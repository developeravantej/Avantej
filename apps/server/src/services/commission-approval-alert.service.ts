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
	/** Orgs that had a non-empty approval and/or review backlog. */
	orgsWithBacklog: number;
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
		orgsWithBacklog: 0,
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

			const sums = {
				count: sql<number>`COUNT(*)::int`,
				totalCents: sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)::int`,
			};

			// Backlog 1 — approval queue: pending splits older than staleDays.
			// These are approved under Commissions → All (Pending filter).
			const [pendingAgg] = await tenantDb
				.select(sums)
				.from(commissionSplits)
				.where(
					and(
						eq(commissionSplits.status, "pending"),
						lt(commissionSplits.earnedAt, cutoff),
					),
				);

			// Backlog 2 — review queue: high-value manual adjustments awaiting
			// sign-off (any age — they need prompt attention). Resolved under
			// Commissions → Review.
			const [reviewAgg] = await tenantDb
				.select(sums)
				.from(commissionSplits)
				.where(eq(commissionSplits.status, "pending_review"));

			const pendingCount = pendingAgg?.count ?? 0;
			const pendingCents = pendingAgg?.totalCents ?? 0;
			const reviewCount = reviewAgg?.count ?? 0;
			const reviewCents = reviewAgg?.totalCents ?? 0;
			if (pendingCount === 0 && reviewCount === 0) continue;
			report.orgsWithBacklog++;

			const admins = await tenantDb.query.members.findMany({
				where: and(eq(members.role, "admin"), eq(members.status, "active")),
				columns: { userId: true },
			});
			if (admins.length === 0) continue;

			const parts: string[] = [];
			if (pendingCount > 0) {
				parts.push(
					`${pendingCount} commission split${pendingCount === 1 ? "" : "s"} (RM ${(
						pendingCents / 100
					).toFixed(
						2,
					)}) pending approval >${staleDays}d — Commissions → All (Pending filter).`,
				);
			}
			if (reviewCount > 0) {
				parts.push(
					`${reviewCount} manual adjustment${reviewCount === 1 ? "" : "s"} (RM ${(
						reviewCents / 100
					).toFixed(2)}) awaiting review — Commissions → Review.`,
				);
			}
			const title = "Commission approvals waiting";
			const message = parts.join(" ");

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

				// onConflictDoNothing backstops the find-first dedupe against a
				// concurrent run: migration 0094's partial unique index
				// (user_id WHERE type=digest AND is_read=false) makes a double
				// insert a no-op instead of a 23505.
				await tenantDb
					.insert(notifications)
					.values({
						userId: admin.userId,
						type: "commission_pending_digest",
						title,
						message,
						icon: "alert-circle",
						color: "amber",
					})
					.onConflictDoNothing();
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
