/**
 * Scheduled Reports Sender — Phase 5.6 (+ PDF attachment, Phase 8c).
 *
 * Hourly cron iterates every active organization, opens its tenant DB,
 * finds rows in `scheduled_reports` whose `nextRunAt <= now`, generates a
 * KPI summary email (HTML inline + PDF/CSV attachment based on the row's
 * `format` column), and dispatches via Resend.
 *
 * PDF generation runs inside the Cloudflare Worker via jsPDF — same library
 * the browser-side Reports page uses. The bundle cost is real (~150KB
 * gzipped) but is amortised across all cron-driven reports and avoids
 * standing up a separate Node service.
 *
 * On failure: `markScheduledReportFailed` bumps nextRunAt forward by 1 hour
 * so a broken row doesn't hot-loop every cron tick.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import {
	getDashboardKpis,
	getDescendantNodeIds,
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

			for (const sr of due) {
				report.reportsDue++;
				try {
					// NAP-04: resolve the creator's scope instead of using all-tenant nodes.
					// `createdBy` is a control-panel user ID stored as text in this tenant's
					// members table under `userId`.
					let accessibleNodeIds: string[];

					if (sr.createdBy) {
						const [creator] = await tenantDb
							.select({
								status: members.status,
								deletedAt: members.deletedAt,
								hierarchyScopeId: members.hierarchyScopeId,
								role: members.role,
							})
							.from(members)
							.where(eq(members.userId, sr.createdBy));

						if (!creator) {
							// Creator no longer exists in this tenant — skip run.
							console.warn(
								`[scheduled-reports] org=${org.id} row=${sr.id} creator userId=${sr.createdBy} not found in members; skipping`,
							);
							continue;
						}

						if (creator.status !== "active" || creator.deletedAt !== null) {
							// Creator is deactivated or soft-deleted — skip run.
							console.warn(
								`[scheduled-reports] org=${org.id} row=${sr.id} creator userId=${sr.createdBy} is deactivated/deleted; skipping`,
							);
							continue;
						}

						if (creator.role === "admin") {
							// Admin creators see all nodes in the tenant.
							const allNodes = await tenantDb
								.select({ id: hierarchyNodes.id })
								.from(hierarchyNodes);
							accessibleNodeIds = allNodes.map((n) => n.id);
						} else {
							// Scope to the creator's hierarchy subtree.
							accessibleNodeIds = await getDescendantNodeIds(
								tenantDb,
								creator.hierarchyScopeId,
							);
						}
					} else {
						// No creator recorded (legacy rows) — fall back to all-tenant scope.
						const allNodes = await tenantDb
							.select({ id: hierarchyNodes.id })
							.from(hierarchyNodes);
						accessibleNodeIds = allNodes.map((n) => n.id);
					}

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

	const rawRecipients = row.recipients
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);

	if (rawRecipients.length === 0) {
		throw new Error("No valid recipients");
	}

	// NAP-04: validate recipient format. Tenant DB has no email column to cross-check
	// against (emails live in the control-panel DB); reject syntactically invalid
	// addresses so obviously bad entries don't reach Resend.
	const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const recipients = rawRecipients.filter((email) => {
		if (!EMAIL_RE.test(email)) {
			console.warn(
				`[scheduled-reports] org=${orgId} row=${row.id} recipient "${email}" failed format check; skipping`,
			);
			return false;
		}
		return true;
	});

	if (recipients.length === 0) {
		throw new Error("No valid recipients after format validation");
	}

	// Build attachment based on requested format. Dynamic import keeps jsPDF
	// out of the cold-start path for tenants with no scheduled reports.
	const attachments = await buildReportAttachment({
		format: row.format,
		windowKey: row.windowKey,
		orgName,
		kpis,
	});

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
		attachments,
	});
}

type DashboardKpis = Awaited<ReturnType<typeof getDashboardKpis>>;

async function buildReportAttachment(args: {
	format: "pdf" | "csv";
	windowKey: string;
	orgName: string;
	kpis: DashboardKpis;
}): Promise<{ filename: string; content: string }[] | undefined> {
	const { format, windowKey, orgName, kpis } = args;
	const date = new Date().toISOString().slice(0, 10);
	const slug =
		orgName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "report";
	const filenameBase = `${slug}-${windowKey}-${date}`;

	if (format === "csv") {
		const csv = buildCsv({ orgName, windowKey, kpis });
		const content = btoa(unescape(encodeURIComponent(csv)));
		return [{ filename: `${filenameBase}.csv`, content }];
	}

	// pdf
	try {
		const { jsPDF } = await import("jspdf");
		const autoTable = (await import("jspdf-autotable")).default;
		const doc = new jsPDF({
			orientation: "portrait",
			unit: "pt",
			format: "a4",
		});
		const fmtMYR = (cents: number) =>
			new Intl.NumberFormat("en-MY", {
				style: "currency",
				currency: "MYR",
			}).format(cents / 100);
		const periodLabel = `${new Date(kpis.from).toLocaleDateString("en-MY")} – ${new Date(kpis.to).toLocaleDateString("en-MY")}`;

		doc.setFontSize(18);
		doc.setFont("helvetica", "bold");
		doc.text(orgName, 40, 50);
		doc.setFontSize(12);
		doc.text("Performance Report", 40, 68);
		doc.setFontSize(10);
		doc.setFont("helvetica", "normal");
		doc.setTextColor(115);
		doc.text(`Window: ${windowKey}`, 40, 84);
		doc.text(`Period: ${periodLabel}`, 40, 98);
		doc.setTextColor(0);

		autoTable(doc, {
			startY: 120,
			head: [["Metric", "Value"]],
			body: [
				["Total Revenue", fmtMYR(kpis.totalSales)],
				["Prev Period Revenue", fmtMYR(kpis.previousPeriodSales)],
				["Active Members", String(kpis.activeMembersCount)],
				["Completed Appointments", String(kpis.completedAppointments)],
				["Total Appointments", String(kpis.totalAppointments)],
			],
			theme: "striped",
			headStyles: { fillColor: [10, 10, 10] },
			styles: { fontSize: 10 },
		});

		// jsPDF's `output("datauristring")` returns `data:application/pdf;base64,...`
		// Strip the data-URI prefix; Resend wants the raw base64 payload.
		const dataUri = doc.output("datauristring") as string;
		const content = dataUri.slice(dataUri.indexOf(",") + 1);
		return [{ filename: `${filenameBase}.pdf`, content }];
	} catch (e) {
		// PDF generation failure shouldn't block the email — fall through and
		// send the HTML summary alone. Log so the failure is observable.
		console.error("[scheduled-reports] PDF generation failed:", e);
		return undefined;
	}
}

function buildCsv(args: {
	orgName: string;
	windowKey: string;
	kpis: DashboardKpis;
}): string {
	const { orgName, windowKey, kpis } = args;
	const periodLabel = `${new Date(kpis.from).toLocaleDateString("en-MY")} – ${new Date(kpis.to).toLocaleDateString("en-MY")}`;
	const lines: string[] = [];
	lines.push(`# ${orgName} — Performance Report`);
	lines.push(`# Window: ${windowKey}`);
	lines.push(`# Period: ${periodLabel}`);
	lines.push("");
	lines.push("Metric,Value");
	lines.push(`Total Revenue (RM),${(kpis.totalSales / 100).toFixed(2)}`);
	lines.push(
		`Prev Period Revenue (RM),${(kpis.previousPeriodSales / 100).toFixed(2)}`,
	);
	lines.push(`Active Members,${kpis.activeMembersCount}`);
	lines.push(`Completed Appointments,${kpis.completedAppointments}`);
	lines.push(`Total Appointments,${kpis.totalAppointments}`);
	if (kpis.revenueByBranch.length > 0) {
		lines.push("");
		lines.push("Branch,Revenue (RM)");
		for (const b of [...kpis.revenueByBranch].sort(
			(a, z) => z.totalRevenue - a.totalRevenue,
		)) {
			const branch = (b.branchName ?? "Unknown").replace(/,/g, ";");
			lines.push(`${branch},${(b.totalRevenue / 100).toFixed(2)}`);
		}
	}
	return lines.join("\n");
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
