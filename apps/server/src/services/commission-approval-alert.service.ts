/**
 * Commission approval-alert sweep — Plan 2 / Job 1 (2026-06-13).
 *
 * Daily, per active org, counts commission splits that have been sitting in
 * `pending` longer than STALE_DAYS and — when there are any — drops a single
 * in-app digest notification to each active admin so the approval queue does
 * not silently pile up. Read-only against commission data; the only write is
 * the notification row (which the existing hourly notification-dispatch cron
 * can optionally email).
 *
 * This does NOT auto-approve anything — it only surfaces the queue.
 *
 * Folded into the existing 09:00 UTC scheduled slot (alongside onboarding
 * alerts) to stay within the Workers Free 5-cron limit. Pattern mirrors
 * installment-sweep.service.ts: loop active orgs from the control panel, skip
 * dead ones, accumulate a per-run report, per-org failures are logged + counted
 * but never kill the batch.
 *
 * DEDUPE: a fresh digest is only created for an admin who has no UNREAD
 * `commission_pending_digest` notification already outstanding. Once they read
 * it (or act on the queue), the next run may surface a new one. This keeps a
 * single standing reminder per admin instead of a daily pile-up.
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel-schema";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { members } from "@avantej-core/db/schema/tenant/members";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { and, eq, lt, sql } from "drizzle-orm";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

/** Splits pending longer than this are considered stale and worth flagging. */
const DEFAULT_STALE_DAYS = 3;

export interface CommissionApprovalAlertReport {
	orgsScanned: number;
	orgsWithStalePending: number;
	notificationsCreated: number;
	errors: number;
}

export interface RunCommissionApprovalAlertArgs {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	now?: Date;
	/** Override the staleness threshold (days). Default 3. */
	staleDays?: number;
}

export async function runCommissionApprovalAlert(
	args: RunCommissionApprovalAlertArgs,
): Promise<CommissionApprovalAlertReport> {
	const { controlPanelDb, getTenantDb } = args;
	const now = args.now ?? new Date();
	const staleDays = args.staleDays ?? DEFAULT_STALE_DAYS;
	const cutoff = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

	const report: CommissionApprovalAlertReport = {
		orgsScanned: 0,
		orgsWithStalePending: 0,
		notificationsCreated: 0,
		errors: 0,
	};

	const orgs = await controlPanelDb
		.select({ id: organizations.id, name: organizations.name })
		.from(organizations)
		.where(eq(organizations.paymentStatus, "active"));

	for (const org of orgs) {
		report.orgsScanned++;
		try {
			const tenantDb = (await getTenantDb(org.id)) as TenantDb;

			// Aggregate stale-pending splits in one query.
			const [agg] = await tenantDb
				.select({
					count: sql<number>`COUNT(*)::int`,
					totalCents: sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)::int`,
				})
				.from(commissionSplits)
				.where(
					and(
						eq(commissionSplits.status, "pending"),
						lt(commissionSplits.earnedAt, cutoff),
					),
				);

			const count = agg?.count ?? 0;
			const totalCents = agg?.totalCents ?? 0;
			if (count === 0) continue;
			report.orgsWithStalePending++;

			const admins = await tenantDb.query.members.findMany({
				where: and(eq(members.role, "admin"), eq(members.status, "active")),
				columns: { userId: true },
			});
			if (admins.length === 0) continue;

			const amountRm = (totalCents / 100).toFixed(2);
			const title = "Commission approvals waiting";
			const message = `${count} commission split${
				count === 1 ? "" : "s"
			} (RM ${amountRm}) have been pending approval for more than ${staleDays} day${
				staleDays === 1 ? "" : "s"
			}. Review them on the Commissions → Review queue.`;

			for (const admin of admins) {
				// DEDUPE: skip if this admin already has an unread digest outstanding.
				const existing = await tenantDb.query.notifications.findFirst({
					where: and(
						eq(notifications.userId, admin.userId),
						eq(notifications.type, "commission_pending_digest"),
						eq(notifications.isRead, false),
					),
					columns: { id: true },
				});
				if (existing) continue;

				await tenantDb.insert(notifications).values({
					userId: admin.userId,
					type: "commission_pending_digest",
					title,
					message,
					icon: "alert-circle",
					color: "amber",
				});
				report.notificationsCreated++;
			}
		} catch (orgErr) {
			report.errors++;
			console.error(
				`[commission-approval-alert] org=${org.id} error:`,
				orgErr instanceof Error ? orgErr.message : String(orgErr),
			);
		}
	}

	return report;
}
