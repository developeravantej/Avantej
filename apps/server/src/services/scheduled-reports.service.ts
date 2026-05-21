/**
 * Scheduled Reports Sender — Phase 5.6.
 *
 * Hourly cron iterates every active organization, opens its tenant DB,
 * finds rows in `scheduled_reports` whose `nextRunAt <= now`, generates a
 * KPI summary email (HTML + link back to the dashboard), and dispatches via Resend.
 *
 * Design decisions:
 * - We do NOT generate PDFs server-side. jsPDF in Cloudflare Workers bloats the
 *   bundle and isn't worth it when users can hit the dashboard directly. Email
 *   contains the KPI summary inline + a "View full report" deep link.
 * - CSV attachments are deferred: Resend's attachment API works in Workers, but
 *   building the CSV requires the same dashboard-side `buildCsv` helper which
 *   lives in apps/web. Cross-app code sharing for this isn't worth it yet —
 *   ship the HTML summary first, attach CSV later if users ask.
 * - On failure: `markScheduledReportFailed` bumps nextRunAt forward by 1 hour
 *   so a broken row doesn't hot-loop every cron tick.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import {
	getDashboardKpis,
	listDueScheduledReports,
	markScheduledReportFailed,
	markScheduledReportSent,
	type ScheduledReportRow,
	type ScheduledReportWindow,
} from "@avantej-core/services";
import { sendEmail } from "@/lib/email";

type TenantDb = NeonDatabase<typeof tenantSchema>;

type CpDb = NeonDatabase<typeof controlPanelSchema>;

const WINDOW_TO_PERIOD: Record<
	ScheduledReportWindow,
	"today" | "this_week" | "this_month" | "this_year"
> = {
	"7D": "this_week",
	"30D": "this_month",
	"90D": "this_month",
	YTD: "this_year",
};

export interface RunScheduledReportsArgs {
	controlPanelDb: CpDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	/** Dashboard origin used for "View full report" deep link. */
	dashboardUrl: string;
	/** Override the "now" clock for testing. Default: new Date(). */
	now?: Date;
}

export interface ScheduledReportsRunReport {
	orgsScanned: number;
	reportsDue: number;
	emailsSent: number;
	errors: number;
}

export async function runScheduledReports(
	args: RunScheduledReportsArgs,
): Promise<ScheduledReportsRunReport> {
	const { controlPanelDb, getTenantDb, dashboardUrl } = args;
	const now = args.now ?? new Date();

	const report: ScheduledReportsRunReport = {
		orgsScanned: 0,
		reportsDue: 0,
		emailsSent: 0,
		errors: 0,
	};

	// Iterate active, non-deleted orgs. Inactive/deleted orgs' tenant DBs may
	// be unreachable; skipping them avoids hot-looping on a dead branch.
	const orgs = await controlPanelDb
		.select({
			id: organizations.id,
			name: organizations.name,
			paymentStatus: organizations.paymentStatus,
		})
		.from(organizations)
		.where(eq(organizations.paymentStatus, "active"));

	for (const org of orgs) {
		report.orgsScanned++;
		try {
			const tenantDb = (await getTenantDb(org.id)) as TenantDb;

			const due = await listDueScheduledReports(tenantDb, now);
			if (due.length === 0) continue;

			// Org-wide cron reports → no RBAC scoping. Fetch all node IDs in the
			// tenant once per org, reused for every due report below.
			const allNodes = await tenantDb
				.select({ id: hierarchyNodes.id })
				.from(hierarchyNodes);
			const accessibleNodeIds = allNodes.map((n) => n.id);

			for (const sr of due) {
				report.reportsDue++;
				try {
					await sendSingleReport({
						tenantDb,
						orgName: org.name,
						orgId: org.id,
						row: sr,
						dashboardUrl,
						accessibleNodeIds,
					});
					await markScheduledReportSent(tenantDb, sr.id, now);
					report.emailsSent++;
				} catch (e) {
					report.errors++;
					const msg = e instanceof Error ? e.message : String(e);
					console.error(
						`[scheduled-reports] org=${org.id} row=${sr.id} send failed:`,
						msg,
					);
					try {
						await markScheduledReportFailed(tenantDb, sr.id, msg);
					} catch (markErr) {
						console.error(
							`[scheduled-reports] failed to mark row ${sr.id} as failed:`,
							markErr,
						);
					}
				}
			}
		} catch (orgErr) {
			report.errors++;
			console.error(
				`[scheduled-reports] org=${org.id} top-level error:`,
				orgErr,
			);
		}
	}

	return report;
}

async function sendSingleReport(args: {
	tenantDb: TenantDb;
	orgName: string;
	orgId: string;
	row: ScheduledReportRow;
	dashboardUrl: string;
	accessibleNodeIds: string[];
}): Promise<void> {
	const { tenantDb, orgName, orgId, row, dashboardUrl, accessibleNodeIds } =
		args;
	const period =
		WINDOW_TO_PERIOD[row.windowKey as ScheduledReportWindow] ?? "this_month";

	const kpis = await getDashboardKpis(tenantDb, { period, accessibleNodeIds });

	const recipients = row.recipients
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);

	if (recipients.length === 0) {
		throw new Error("No valid recipients");
	}

	const fmtMYR = (cents: number) =>
		new Intl.NumberFormat("en-MY", {
			style: "currency",
			currency: "MYR",
		}).format(cents / 100);

	const periodLabel = `${new Date(kpis.from).toLocaleDateString("en-MY")} – ${new Date(kpis.to).toLocaleDateString("en-MY")}`;

	const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; color: #0a0a0a;">
  <div style="padding: 24px; border-bottom: 1px solid #e5e5e5;">
    <h1 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 700;">${escapeHtml(row.reportName)}</h1>
    <p style="margin: 0; color: #737373; font-size: 13px;">${escapeHtml(orgName)} · ${escapeHtml(periodLabel)} · ${escapeHtml(row.windowKey)}</p>
  </div>
  <div style="padding: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #737373;">Key Metrics</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3;">Total Revenue</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3; text-align: right; font-weight: 600;">${fmtMYR(kpis.totalSales)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3;">Previous Period</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3; text-align: right; color: #737373;">${fmtMYR(kpis.previousPeriodSales)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3;">Active Members</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3; text-align: right; font-weight: 600;">${kpis.activeMembersCount.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3;">Completed Appointments</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f3f3; text-align: right; font-weight: 600;">${kpis.completedAppointments.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0;">Total Appointments</td>
        <td style="padding: 8px 0; text-align: right; font-weight: 600;">${kpis.totalAppointments.toLocaleString()}</td>
      </tr>
    </table>

    <div style="margin-top: 24px; padding: 16px; background: #f3f3f3; border-radius: 8px; font-size: 13px; color: #404040;">
      For full charts, branch breakdowns, and PDF/CSV downloads, open the dashboard.
    </div>

    <p style="margin: 24px 0 0 0;">
      <a href="${escapeHtml(dashboardUrl)}/dashboard/reports/view?orgId=${escapeHtml(orgId)}"
         style="display: inline-block; background: #0a0a0a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;">
        View Full Report →
      </a>
    </p>
  </div>
  <div style="padding: 16px 24px; background: #fafafa; color: #a3a3a3; font-size: 11px; border-top: 1px solid #e5e5e5;">
    You're receiving this because someone in your organization scheduled this report.
    To stop, sign in to the dashboard and remove the schedule under Reports.
  </div>
</body>
</html>
	`.trim();

	await sendEmail({
		to: recipients,
		subject: `[${orgName}] ${row.reportName} — ${row.windowKey}`,
		html,
	});
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
