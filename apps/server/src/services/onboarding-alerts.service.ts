/**
 * Onboarding-Stuck Alert — Plan C Phase C.6.
 *
 * Daily cron (09:00 UTC) emails Avantej super_admins a list of tenants
 * whose Stripe Connect onboarding stalled. A row is "stuck" when:
 *   - org_country_stripe_accounts.chargesEnabled = false AND
 *   - connect_account_updated_at < now - 7 days (no recent update)
 *
 * Skips alerts on quiet days (zero stuck rows). Tenants are not
 * directly contacted by this service — that's handled by tenant ops once
 * Avantej support reaches out.
 *
 * Triggered by wrangler scheduled handler (ADR-0021).
 */

import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as authUser } from "@avantej-core/db/schema/auth";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";

type CpDb = NeonDatabase<typeof controlPanelSchema>;

const STUCK_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export interface RunOnboardingAlertsArgs {
	controlPanelDb: CpDb;
	/**
	 * Override the "now" clock for testing. Default: new Date().
	 */
	now?: Date;
}

export interface OnboardingAlertReport {
	stuckOrgs: number;
	recipients: number;
	emailsSent: number;
	errors: number;
}

export async function runOnboardingAlerts(
	args: RunOnboardingAlertsArgs,
): Promise<OnboardingAlertReport> {
	const { controlPanelDb } = args;
	const now = args.now ?? new Date();
	const cutoff = new Date(now.getTime() - STUCK_THRESHOLD_MS);

	const report: OnboardingAlertReport = {
		stuckOrgs: 0,
		recipients: 0,
		emailsSent: 0,
		errors: 0,
	};

	// Find stuck rows. "stuck" = (org, country) row that has been linked
	// (stripeAccountId set) but charges still disabled past the threshold.
	const stuck = await controlPanelDb
		.select({
			organizationId: orgCountryStripeAccounts.organizationId,
			countryCode: orgCountryStripeAccounts.countryCode,
			stripeAccountId: orgCountryStripeAccounts.stripeAccountId,
			status: orgCountryStripeAccounts.stripeConnectStatus,
			connectAccountUpdatedAt: orgCountryStripeAccounts.connectAccountUpdatedAt,
			detailsSubmitted: orgCountryStripeAccounts.detailsSubmitted,
			orgName: organizations.name,
			orgSlug: organizations.slug,
		})
		.from(orgCountryStripeAccounts)
		.innerJoin(
			organizations,
			eq(organizations.id, orgCountryStripeAccounts.organizationId),
		)
		.where(
			and(
				eq(orgCountryStripeAccounts.chargesEnabled, false),
				isNotNull(orgCountryStripeAccounts.stripeAccountId),
				lt(orgCountryStripeAccounts.connectAccountUpdatedAt, cutoff),
			),
		);

	report.stuckOrgs = stuck.length;

	if (stuck.length === 0) {
		console.log("[onboarding-alerts] no stuck onboardings — skipping email");
		return report;
	}

	// Resolve super_admin recipients.
	const superAdmins = await controlPanelDb
		.select({
			userId: platformAdmins.userId,
			email: authUser.email,
			name: authUser.name,
		})
		.from(platformAdmins)
		.innerJoin(authUser, eq(authUser.id, platformAdmins.userId))
		.where(eq(platformAdmins.role, "super_admin"));

	report.recipients = superAdmins.length;

	if (superAdmins.length === 0) {
		console.warn(
			`[onboarding-alerts] ${stuck.length} stuck onboardings but no super_admin platform admins to notify`,
		);
		return report;
	}

	const subject = `[Avantej Ops] ${stuck.length} Stripe Connect onboarding${stuck.length === 1 ? "" : "s"} stuck`;
	const html = buildHtmlBody(stuck, now);

	for (const admin of superAdmins) {
		if (!admin.email) continue;
		try {
			await sendEmail({ to: admin.email, subject, html });
			report.emailsSent++;
		} catch (e) {
			report.errors++;
			console.error(`[onboarding-alerts] email to ${admin.email} failed:`, e);
		}
	}

	console.log(`[onboarding-alerts] complete: ${JSON.stringify(report)}`);
	return report;
}

function buildHtmlBody(
	stuck: Array<{
		orgName: string;
		orgSlug: string;
		countryCode: string;
		stripeAccountId: string | null;
		status: string;
		connectAccountUpdatedAt: Date | null;
		detailsSubmitted: boolean;
	}>,
	now: Date,
): string {
	const rows = stuck
		.map((row) => {
			const days = row.connectAccountUpdatedAt
				? Math.floor(
						(now.getTime() - row.connectAccountUpdatedAt.getTime()) /
							(24 * 60 * 60 * 1000),
					)
				: "?";
			const ds = row.detailsSubmitted ? "submitted" : "NOT submitted";
			return `
				<tr>
					<td>${escapeHtml(row.orgName)} <small>(${escapeHtml(row.orgSlug)})</small></td>
					<td>${row.countryCode}</td>
					<td><code>${escapeHtml(row.stripeAccountId ?? "")}</code></td>
					<td>${escapeHtml(row.status)}</td>
					<td>details: ${ds}</td>
					<td>${days} days stuck</td>
				</tr>
			`;
		})
		.join("");
	return `
		<p>Hi Avantej ops,</p>
		<p>${stuck.length} Stripe Connect onboarding${stuck.length === 1 ? "" : "s"} ${stuck.length === 1 ? "is" : "are"} stuck — tenants started but never completed verification, and we haven't seen activity for over 7 days.</p>
		<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-family: sans-serif; font-size: 13px;">
			<thead>
				<tr style="background: #f3f4f6;">
					<th align="left">Org</th>
					<th align="left">Country</th>
					<th align="left">Acct</th>
					<th align="left">Status</th>
					<th align="left">Details</th>
					<th align="left">Stuck</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
		<p>Open these accounts on Stripe Dashboard to check requirements:</p>
		<p>Drill into individual tenants from the platform admin payments page (<code>/dashboard/platform-admin/payments</code>, Phase C.4).</p>
	`;
}
