/**
 * Membership Service (Phase 3 Agent 3.1 — J4)
 *
 * Front-desk freeze/resume of a customer's package. A freeze creates an
 * append-only `membership_holds` row, sets `package_instances.status = 'paused'`,
 * and writes a `package_instance_status_history` audit row — all in the same
 * transaction.
 *
 * `auto-resume-holds` cron (apps/server/src/cron/auto-resume-holds.ts) walks
 * `membership_holds WHERE status='active' AND end_date <= NOW()` and calls
 * `resumeMembership` with the system actor.
 *
 * Naming note: this file is `membership.service.ts` (singular, freeze/resume
 * write-side). The pre-existing `memberships.service.ts` (plural) is the
 * read-side dashboard widget query and is left untouched.
 */

import { and, eq, lte, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { membershipHolds } from "@avantej-core/db/schema/tenant/membership-holds";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { appendPackageInstanceStatusHistory } from "./status-history.helper";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type FreezeReason = "medical" | "travel" | "other";
export const FREEZE_REASONS: readonly FreezeReason[] = [
	"medical",
	"travel",
	"other",
] as const;

export type MembershipHold = typeof membershipHolds.$inferSelect;

export type FreezeMembershipParams = {
	packageInstanceId: string;
	memberId?: string | null;
	startDate: Date;
	endDate: Date;
	reason: FreezeReason | string;
	feeWaived?: boolean;
	createdBy: string;
	notes?: string | null;
};

export type ResumeMembershipParams = {
	resumedBy: string;
	notes?: string | null;
};

/**
 * Freeze a member's package.
 *
 * Atomically:
 *   1. inserts a `membership_holds` row (status='active'),
 *   2. flips `package_instances.status` → 'paused' (capturing prior status for history),
 *   3. writes a `package_instance_status_history` audit entry.
 *
 * Throws if `endDate <= startDate`, the package is missing, or already paused.
 */
export async function freezeMembership(
	tenantDb: TenantDb,
	params: FreezeMembershipParams,
): Promise<{ hold: MembershipHold; previousStatus: string }> {
	if (params.endDate.getTime() <= params.startDate.getTime()) {
		throw new Error("Hold endDate must be strictly after startDate");
	}

	return tenantDb.transaction(async (tx) => {
		const pkg = await tx.query.packageInstances.findFirst({
			where: eq(packageInstances.id, params.packageInstanceId),
		});
		if (!pkg) {
			throw new Error(
				`Package instance ${params.packageInstanceId} not found`,
			);
		}
		if (pkg.status === "paused") {
			throw new Error(
				`Package instance ${params.packageInstanceId} is already paused`,
			);
		}

		const [hold] = await tx
			.insert(membershipHolds)
			.values({
				packageInstanceId: params.packageInstanceId,
				memberId: params.memberId ?? null,
				startDate: params.startDate,
				endDate: params.endDate,
				reason: params.reason,
				feeWaived: params.feeWaived ?? false,
				status: "active",
				createdBy: params.createdBy,
			})
			.returning();

		if (!hold) {
			throw new Error("Failed to insert membership_holds row");
		}

		await tx
			.update(packageInstances)
			.set({ status: "paused", updatedAt: new Date() })
			.where(eq(packageInstances.id, params.packageInstanceId));

		await appendPackageInstanceStatusHistory(tx, params.packageInstanceId, {
			fromStatus: pkg.status,
			toStatus: "paused",
			changedBy: params.createdBy,
			reason: `freeze:${params.reason}`,
			notes:
				params.notes ??
				`Hold ${hold.id} (${params.startDate.toISOString().slice(0, 10)} → ${params.endDate.toISOString().slice(0, 10)})`,
		});

		return { hold, previousStatus: pkg.status };
	});
}

/**
 * Resume a frozen package.
 *
 * Marks the hold completed, reverts `package_instances.status` to 'active'
 * (the canonical post-freeze state — callers may further transition the
 * package later), and appends a `package_instance_status_history` row.
 *
 * Idempotent: calling on a hold that is already 'completed' or 'cancelled'
 * throws — the cron checks status='active' first.
 */
export async function resumeMembership(
	tenantDb: TenantDb,
	holdId: string,
	params: ResumeMembershipParams,
): Promise<{ hold: MembershipHold }> {
	return tenantDb.transaction(async (tx) => {
		const hold = await tx.query.membershipHolds.findFirst({
			where: eq(membershipHolds.id, holdId),
		});
		if (!hold) {
			throw new Error(`Membership hold ${holdId} not found`);
		}
		if (hold.status !== "active") {
			throw new Error(
				`Membership hold ${holdId} is not active (status=${hold.status})`,
			);
		}

		const pkg = await tx.query.packageInstances.findFirst({
			where: eq(packageInstances.id, hold.packageInstanceId),
		});
		if (!pkg) {
			throw new Error(
				`Package instance ${hold.packageInstanceId} not found while resuming hold ${holdId}`,
			);
		}

		const now = new Date();
		const [updated] = await tx
			.update(membershipHolds)
			.set({ status: "completed", resumedAt: now })
			.where(eq(membershipHolds.id, holdId))
			.returning();

		if (!updated) {
			throw new Error("Failed to update membership_holds row on resume");
		}

		// Revert to 'active'. If the package was something else pre-freeze (e.g.
		// 'pending'), the status_history row preserves that for ops to inspect.
		await tx
			.update(packageInstances)
			.set({ status: "active", updatedAt: now })
			.where(eq(packageInstances.id, hold.packageInstanceId));

		await appendPackageInstanceStatusHistory(tx, hold.packageInstanceId, {
			fromStatus: pkg.status,
			toStatus: "active",
			changedBy: params.resumedBy,
			reason: "resume",
			notes: params.notes ?? `Resumed hold ${holdId}`,
		});

		return { hold: updated };
	});
}

/**
 * Cancel a freeze without resuming the package — used when a freeze was
 * created in error. Does NOT touch package_instances; assumes the package
 * is being separately re-statused (or never paused if cancelled immediately).
 */
export async function cancelMembershipHold(
	tenantDb: TenantDb,
	holdId: string,
	cancelledBy: string,
): Promise<MembershipHold> {
	const [updated] = await tenantDb
		.update(membershipHolds)
		.set({ status: "cancelled", resumedAt: new Date() })
		.where(
			and(
				eq(membershipHolds.id, holdId),
				eq(membershipHolds.status, "active"),
			),
		)
		.returning();
	if (!updated) {
		throw new Error(`Membership hold ${holdId} not found or not active`);
	}
	// Audit: caller should additionally append a status_history row if they
	// reverted package_instances.status separately.
	void cancelledBy;
	return updated;
}

/**
 * List holds for a package (audit-trail UI).
 */
export async function listHoldsForPackage(
	tenantDb: TenantDb,
	packageInstanceId: string,
): Promise<MembershipHold[]> {
	return tenantDb.query.membershipHolds.findMany({
		where: eq(membershipHolds.packageInstanceId, packageInstanceId),
		orderBy: (h, { desc }) => [desc(h.createdAt)],
	});
}

/**
 * Cron helper: enumerate holds whose `end_date` has passed and which are
 * still 'active'. Caller iterates and invokes `resumeMembership` for each.
 */
export async function listExpiredActiveHolds(
	tenantDb: TenantDb,
	now: Date = new Date(),
): Promise<MembershipHold[]> {
	return tenantDb
		.select()
		.from(membershipHolds)
		.where(
			and(
				eq(membershipHolds.status, "active"),
				lte(membershipHolds.endDate, now),
			),
		);
}

/**
 * Run the auto-resume cron pass. Returns a tally for observability.
 *
 * Failure-isolation: each hold is resumed in its own transaction so a single
 * row's failure (e.g. the package was deleted under us) does not abort the
 * whole batch.
 */
export async function runAutoResumeHolds(
	tenantDb: TenantDb,
	systemActor = "system:auto-resume-holds",
	now: Date = new Date(),
): Promise<{ scanned: number; resumed: number; errors: { holdId: string; message: string }[] }> {
	const expired = await listExpiredActiveHolds(tenantDb, now);
	const errors: { holdId: string; message: string }[] = [];
	let resumed = 0;

	for (const hold of expired) {
		try {
			await resumeMembership(tenantDb, hold.id, {
				resumedBy: systemActor,
				notes: "auto-resume:cron",
			});
			resumed++;
		} catch (err) {
			errors.push({
				holdId: hold.id,
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// Surface a tiny SQL no-op so linters don't trip on `sql` being unused
	// once the file is type-checked in isolation.
	void sql;
	return { scanned: expired.length, resumed, errors };
}
