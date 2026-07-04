/**
 * WS5 (MOVE parity) — month-based payroll period lock.
 *
 * A payroll period is a (branch, [start, end)) commission window. Locking it
 * freezes commission for that branch+window so a back-dated correction can't
 * silently change a settled, already-paid month. The gate (`assertPeriodOpen`)
 * is called from every commission write path; corrections instead route to the
 * CURRENT open period as signed adjustments.
 *
 * Period boundaries reuse the existing cycle resolver (resolveCycleBoundsForDate
 * — per-branch policy, half-open UTC bounds). A split's branch is derived the
 * same way `applyCommissionCaps` does: appointment → sales_order → (package via
 * its sales_order) → tenant-wide null. A null-branch split has no branch period
 * and is never gated (documented limitation for package-only splits).
 */

import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payrollPeriods } from "@avantej-core/db/schema/tenant/payroll-periods";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import {
	resolveCycleBoundsForDate,
	resolveCyclePolicy,
	deriveCycleBounds,
} from "./commission-cycle.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
/** Bare pool OR an open transaction — the gate must run inside the write tx. */
type TenantDbOrTx =
	| TenantDb
	| Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

/** Thrown when a commission write targets a locked payroll period. */
export class PayrollPeriodLockedError extends Error {
	constructor(
		public readonly branchNodeId: string,
		public readonly periodStart: Date,
		public readonly periodEnd: Date,
	) {
		super(
			`PAYROLL_PERIOD_LOCKED: commission for branch ${branchNodeId} in ` +
				`${periodStart.toISOString().slice(0, 10)}..${periodEnd
					.toISOString()
					.slice(
						0,
						10,
					)} is locked; corrections must post to the current open period`,
		);
		this.name = "PayrollPeriodLockedError";
	}
}

export function isPayrollPeriodLockedError(
	e: unknown,
): e is PayrollPeriodLockedError {
	return (
		e instanceof PayrollPeriodLockedError ||
		(e instanceof Error && e.message.startsWith("PAYROLL_PERIOD_LOCKED:"))
	);
}

/** Reference identifying the parent a split hangs off (branch derivation). */
export interface SplitBranchRef {
	branchId?: string | null;
	appointmentId?: string | null;
	salesOrderId?: string | null;
	packageInstanceId?: string | null;
}

/**
 * Derive the branch node a commission split belongs to. Mirrors
 * applyCommissionCaps, plus the package → sales_order hop so package-purchase
 * splits are branch-attributed (and therefore gate-able) rather than dropping
 * to tenant-wide.
 */
export async function resolveSplitBranchId(
	db: TenantDbOrTx,
	ref: SplitBranchRef,
): Promise<string | null> {
	if (ref.branchId) return ref.branchId;
	if (ref.appointmentId) {
		const [r] = await db
			.select({ branchId: appointments.branchId })
			.from(appointments)
			.where(eq(appointments.id, ref.appointmentId))
			.limit(1);
		if (r?.branchId) return r.branchId;
	}
	if (ref.salesOrderId) {
		const [r] = await db
			.select({ branchId: salesOrders.branchId })
			.from(salesOrders)
			.where(eq(salesOrders.id, ref.salesOrderId))
			.limit(1);
		if (r?.branchId) return r.branchId;
	}
	if (ref.packageInstanceId) {
		const [r] = await db
			.select({ branchId: salesOrders.branchId })
			.from(packageInstances)
			.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
			.where(eq(packageInstances.id, ref.packageInstanceId))
			.limit(1);
		if (r?.branchId) return r.branchId;
	}
	return null;
}

/**
 * True when the (branch, period-of earnedAt) is locked. Null branch → not
 * gated (no branch period exists). Uses the branch's cycle policy to find the
 * window and matches on period_start (the unique window anchor).
 */
export async function isPeriodLocked(
	db: TenantDbOrTx,
	branchNodeId: string | null,
	earnedAt: Date,
): Promise<boolean> {
	if (!branchNodeId) return false;
	const { start } = await resolveCycleBoundsForDate(
		db as TenantDb,
		branchNodeId,
		earnedAt,
	);
	const [row] = await db
		.select({ state: payrollPeriods.state })
		.from(payrollPeriods)
		.where(
			and(
				eq(payrollPeriods.branchNodeId, branchNodeId),
				eq(payrollPeriods.periodStart, start),
			),
		)
		.limit(1);
	return row?.state === "locked";
}

/**
 * Gate: throw PayrollPeriodLockedError if the split's period is locked. Call
 * this INSIDE the write transaction, before inserting/mutating a split.
 */
export async function assertPeriodOpen(
	db: TenantDbOrTx,
	ref: SplitBranchRef & { earnedAt: Date },
): Promise<void> {
	const branchNodeId = await resolveSplitBranchId(db, ref);
	if (!branchNodeId) return;
	const { start, end } = await resolveCycleBoundsForDate(
		db as TenantDb,
		branchNodeId,
		ref.earnedAt,
	);
	const [row] = await db
		.select({ state: payrollPeriods.state })
		.from(payrollPeriods)
		.where(
			and(
				eq(payrollPeriods.branchNodeId, branchNodeId),
				eq(payrollPeriods.periodStart, start),
			),
		)
		.limit(1);
	if (row?.state === "locked") {
		throw new PayrollPeriodLockedError(branchNodeId, start, end);
	}
}

// ---------------------------------------------------------------------------
// Lock / unlock / list
// ---------------------------------------------------------------------------

export type PayrollPeriodRow = typeof payrollPeriods.$inferSelect;

export interface LockPeriodParams {
	branchNodeId: string;
	periodStart: Date;
	periodEnd: Date;
	lockedBy: string;
	lockKind: "auto" | "manual";
	organizationId?: string | null;
}

/** Idempotent upsert to state='locked' for a (branch, window). */
export async function lockPayrollPeriod(
	db: TenantDbOrTx,
	params: LockPeriodParams,
): Promise<PayrollPeriodRow> {
	const now = new Date();
	const [row] = await db
		.insert(payrollPeriods)
		.values({
			organizationId: params.organizationId ?? null,
			branchNodeId: params.branchNodeId,
			periodStart: params.periodStart,
			periodEnd: params.periodEnd,
			state: "locked",
			lockedAt: now,
			lockedBy: params.lockedBy,
			lockKind: params.lockKind,
		})
		.onConflictDoUpdate({
			target: [
				payrollPeriods.branchNodeId,
				payrollPeriods.periodStart,
				payrollPeriods.periodEnd,
			],
			set: {
				state: "locked",
				lockedAt: now,
				lockedBy: params.lockedBy,
				lockKind: params.lockKind,
				unlockReason: null,
				updatedAt: now,
			},
		})
		.returning();
	return row!;
}

export interface UnlockPeriodParams {
	id: string;
	unlockedBy: string;
	reason: string;
}

/** Re-open a locked period. Reason is mandatory (audited by the caller). */
export async function unlockPayrollPeriod(
	db: TenantDbOrTx,
	params: UnlockPeriodParams,
): Promise<PayrollPeriodRow | null> {
	const now = new Date();
	const [row] = await db
		.update(payrollPeriods)
		.set({
			state: "open",
			unlockReason: params.reason,
			lockedBy: params.unlockedBy,
			updatedAt: now,
		})
		.where(eq(payrollPeriods.id, params.id))
		.returning();
	return row ?? null;
}

export async function listPayrollPeriods(
	db: TenantDbOrTx,
	filter: { branchNodeId?: string; from?: Date; to?: Date } = {},
): Promise<PayrollPeriodRow[]> {
	const conditions = [];
	if (filter.branchNodeId)
		conditions.push(eq(payrollPeriods.branchNodeId, filter.branchNodeId));
	if (filter.from)
		conditions.push(gte(payrollPeriods.periodStart, filter.from));
	if (filter.to) conditions.push(lte(payrollPeriods.periodStart, filter.to));
	return db
		.select()
		.from(payrollPeriods)
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(payrollPeriods.periodStart);
}

// ---------------------------------------------------------------------------
// Auto-lock (cron): lock the just-closed period per branch once the grace
// window has elapsed.
// ---------------------------------------------------------------------------

export interface AutoLockResult {
	branchesScanned: number;
	locked: number;
}

/**
 * For every branch node (+ the tenant-wide default), lock the period that
 * ended most recently once `graceDays` have passed since it closed. Idempotent:
 * an already-locked window is skipped by the upsert. A locked-but-empty window
 * is harmless — it simply pre-blocks back-dating into a settled month.
 */
export async function autoLockDuePeriods(
	db: TenantDb,
	now: Date = new Date(),
	graceDays = 2,
): Promise<AutoLockResult> {
	const graceMs = graceDays * 24 * 60 * 60 * 1000;

	// Every branch node, plus null (tenant-wide policy scope).
	const branches = await db
		.select({ id: hierarchyNodes.id })
		.from(hierarchyNodes)
		.where(
			and(eq(hierarchyNodes.type, "branch"), isNotNull(hierarchyNodes.id)),
		);
	const branchIds: string[] = branches.map((b) => b.id);

	const result: AutoLockResult = { branchesScanned: 0, locked: 0 };

	for (const branchId of branchIds) {
		result.branchesScanned++;
		const policy = await resolveCyclePolicy(db, branchId);
		// Current period contains `now`; the just-closed period is the one
		// immediately before it — [prevStart, curStart).
		const cur = deriveCycleBounds(policy, now);
		// Grace must have elapsed since the just-closed period ended (= cur.start).
		if (now.getTime() < cur.start.getTime() + graceMs) continue;
		const prev = deriveCycleBounds(policy, new Date(cur.start.getTime() - 1));
		// Skip if a row already exists for this window — whether it's already
		// locked OR was deliberately unlocked by an admin. Auto-lock only ever
		// creates the FIRST lock; it must never override a human's unlock (which
		// would revert the unlock overnight and wipe its reason). A re-lock after
		// an unlock is an explicit manual action (lockNow).
		const [existing] = await db
			.select({ id: payrollPeriods.id })
			.from(payrollPeriods)
			.where(
				and(
					eq(payrollPeriods.branchNodeId, branchId),
					eq(payrollPeriods.periodStart, prev.start),
				),
			)
			.limit(1);
		if (existing) continue;
		await lockPayrollPeriod(db, {
			branchNodeId: branchId,
			periodStart: prev.start,
			periodEnd: prev.end,
			lockedBy: "system",
			lockKind: "auto",
		});
		result.locked++;
	}

	return result;
}
