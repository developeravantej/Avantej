/**
 * Commission Splits Service
 *
 * Manages the lifecycle of commission splits:
 *   pending → approved → paid
 *   (any status) → void
 *
 * Two creation paths:
 *   1. Appointment completed  → createCommissionSplitsForAppointment (called by appointment.service)
 *   2. POS sale with salesperson → createCommissionSplit (called by pos.service)
 *
 * Commission config: categoryCommissionConfigs → commissionCoachSlots + commissionTierRates/Conditions.
 * The calculator (commission-calculator.service.ts) handles rate lookup and slot redistribution.
 *
 * staffId convention: always the member's cross-DB userId (i.e. members.userId), NOT member.id.
 * Frontend and callers must send userId — not the tenant member table PK.
 */

import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	inArray,
	lte,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { commissionSplitReversals } from "@avantej-core/db/schema/tenant/commission-split-reversals";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { categoryCommissionConfigs } from "@avantej-core/db/schema/tenant/category-commission-configs";
import { categoryCommissionConfigVersions } from "@avantej-core/db/schema/tenant/category-commission-config-versions";
import { commissionTracks } from "@avantej-core/db/schema/tenant/commission-tracks";
import { promotionUsages } from "@avantej-core/db/schema/tenant/promotions";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payoutBatches } from "@avantej-core/db/schema/tenant/payout-batches";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { refundItems } from "@avantej-core/db/schema/tenant/refund-items";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { ORPCError } from "@orpc/server";
import { writeAudit } from "./audit-log.service";
import { resolveCycleBoundsForDate } from "./commission-cycle.service";
import { getDescendantNodeIds } from "./hierarchy.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CommissionSplit = typeof commissionSplits.$inferSelect;

// ---------------------------------------------------------------------------
// Existing read functions (unchanged)
// ---------------------------------------------------------------------------

export async function listCommissionSplits(
	tenantDb: TenantDb,
	params: {
		memberId?: string;
		appointmentId?: string;
		from?: Date;
		to?: Date;
		limit?: number;
		offset?: number;
		accessibleNodeIds?: string[];
	} = {},
) {
	const {
		memberId,
		appointmentId,
		from,
		to,
		limit = 50,
		offset = 0,
		accessibleNodeIds,
	} = params;

	const conditions = [];

	if (memberId) {
		conditions.push(eq(commissionSplits.staffId, memberId));
	}

	if (appointmentId) {
		conditions.push(eq(commissionSplits.appointmentId, appointmentId));
	}

	if (from) {
		conditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		conditions.push(lte(commissionSplits.createdAt, to));
	}

	// Scope by accessible hierarchy nodes. commissionSplits can be linked to either an
	// appointment (branchId on appointments) or a salesOrder (branchId on salesOrders).
	// LEFT JOIN both and require at least one of the resolved branchIds to be accessible.
	if (accessibleNodeIds !== undefined && accessibleNodeIds.length > 0) {
		const baseConditions =
			conditions.length > 0 ? and(...conditions) : undefined;

		return tenantDb
			.select({ split: commissionSplits })
			.from(commissionSplits)
			.leftJoin(
				appointments,
				eq(commissionSplits.appointmentId, appointments.id),
			)
			.leftJoin(salesOrders, eq(commissionSplits.salesOrderId, salesOrders.id))
			.where(
				and(
					baseConditions,
					or(
						inArray(appointments.branchId, accessibleNodeIds),
						inArray(salesOrders.branchId, accessibleNodeIds),
					),
				),
			)
			.orderBy(desc(commissionSplits.createdAt))
			.limit(limit)
			.offset(offset)
			.then((rows) => rows.map((r) => r.split));
	}

	const query = tenantDb
		.select()
		.from(commissionSplits)
		.orderBy(desc(commissionSplits.createdAt))
		.limit(limit)
		.offset(offset);

	if (conditions.length > 0) {
		return query.where(and(...conditions));
	}

	return query;
}

export async function getCommissionsByAppointment(
	tenantDb: TenantDb,
	appointmentId: string,
	options: { accessibleNodeIds?: string[] } = {},
) {
	const { accessibleNodeIds } = options;

	// If accessibleNodeIds provided, verify the appointment's branch is accessible
	// before returning commission data — avoids a JOIN for single-record lookups.
	if (accessibleNodeIds !== undefined && accessibleNodeIds.length > 0) {
		const appt = await tenantDb.query.appointments.findFirst({
			where: eq(appointments.id, appointmentId),
			columns: { branchId: true },
		});
		if (!appt || !appt.branchId || !accessibleNodeIds.includes(appt.branchId)) {
			return [];
		}
	}

	return tenantDb
		.select()
		.from(commissionSplits)
		.where(eq(commissionSplits.appointmentId, appointmentId))
		.orderBy(desc(commissionSplits.calculatedAmount));
}

export async function getMyCommissions(
	tenantDb: TenantDb,
	// NOTE: commission_splits.staffId stores members.userId (NOT members.id) —
	// matches the staff_assignments convention. The parameter is named userId to
	// prevent callers from passing a members.id by accident (audit F-COM-A).
	userId: string,
	params: {
		from?: Date;
		to?: Date;
	} = {},
) {
	const { from, to } = params;

	const conditions = [eq(commissionSplits.staffId, userId)];

	if (from) {
		conditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		conditions.push(lte(commissionSplits.createdAt, to));
	}

	const splits = await tenantDb
		.select()
		.from(commissionSplits)
		.where(and(...conditions))
		.orderBy(desc(commissionSplits.createdAt));

	const totalAmount = splits.reduce(
		(sum, s) => sum + (s.calculatedAmount ?? 0),
		0,
	);

	return { splits, totalAmount };
}

// ---------------------------------------------------------------------------
// Agent 3.4 — Commission caps/floors (Phase 3 §5)
// ---------------------------------------------------------------------------

/**
 * Resolve the categoryId for a split's source. The category drives which
 * commission-config row applies (and therefore which caps).
 *
 * Resolution priority — at most one source is set per split (CHECK constraint):
 *   appointmentId      → appointments.serviceId      → services.categoryId
 *   packageInstanceId  → package_instances.serviceId → services.categoryId
 *   salesOrderId       → first sales_order_items row with a serviceId →
 *                        services.categoryId. (Sales orders may bundle multiple
 *                        services across categories. We take the first commission-
 *                        eligible line; if cap-tuning per line is needed later it
 *                        belongs in commission-calculator.service.ts which is
 *                        out of scope here.)
 */
async function resolveCategoryIdForSplit(
	db: TenantDb | TenantTx,
	source: {
		appointmentId?: string | null;
		salesOrderId?: string | null;
		packageInstanceId?: string | null;
	},
): Promise<string | null> {
	const tdb = db as TenantDb;
	if (source.appointmentId) {
		const [row] = await tdb
			.select({ categoryId: services.categoryId })
			.from(appointments)
			.innerJoin(services, eq(appointments.serviceId, services.id))
			.where(eq(appointments.id, source.appointmentId))
			.limit(1);
		return row?.categoryId ?? null;
	}
	if (source.packageInstanceId) {
		const [row] = await tdb
			.select({ categoryId: services.categoryId })
			.from(packageInstances)
			.innerJoin(services, eq(packageInstances.serviceId, services.id))
			.where(eq(packageInstances.id, source.packageInstanceId))
			.limit(1);
		return row?.categoryId ?? null;
	}
	if (source.salesOrderId) {
		const [row] = await tdb
			.select({ categoryId: services.categoryId })
			.from(salesOrderItems)
			.innerJoin(services, eq(salesOrderItems.serviceId, services.id))
			.where(
				and(
					eq(salesOrderItems.salesOrderId, source.salesOrderId),
					eq(salesOrderItems.commissionExcluded, false),
				),
			)
			.limit(1);
		return row?.categoryId ?? null;
	}
	return null;
}

/**
 * Sum the discount applied to a sales order via promotion_usages and compute
 * the discount fraction in basis points relative to the gross order total
 * (gross = totalAmount + sum(discountAmount)). Returns 0 when no promotions
 * were applied or the order is missing.
 */
async function computeOrderDiscountBps(
	db: TenantDb | TenantTx,
	salesOrderId: string,
): Promise<number> {
	const tdb = db as TenantDb;
	const [order] = await tdb
		.select({ totalAmount: salesOrders.totalAmount })
		.from(salesOrders)
		.where(eq(salesOrders.id, salesOrderId))
		.limit(1);
	if (!order) return 0;

	const [agg] = await tdb
		.select({
			discountTotal:
				sql<number>`COALESCE(SUM(${promotionUsages.discountAmount}), 0)`.mapWith(
					Number,
				),
		})
		.from(promotionUsages)
		.where(eq(promotionUsages.salesOrderId, salesOrderId));

	const discountCents = agg?.discountTotal ?? 0;
	if (discountCents <= 0) return 0;
	const grossCents = order.totalAmount + discountCents;
	if (grossCents <= 0) return 0;
	return Math.round((discountCents / grossCents) * 10_000); // basis points
}

// `getCycleBoundsForDate` removed in S-cycle-window-alignment — replaced by
// `resolveCycleBoundsForDate` in `commission-cycle.service.ts` which honours
// per-(branch | tenant) policy. Preserved logic for `calendar_month` is the
// fallback when no policy row exists.

export interface CommissionCapDecision {
	/** True when the split must be skipped entirely (e.g. order discount above threshold). */
	skip: boolean;
	/** Final commission amount after cycle cap. May equal input when no cap applied. */
	amountCents: number;
	/** Reason string when capped/skipped — useful for audit notes. null when unchanged. */
	reason: string | null;
}

/**
 * Apply commission caps for a pending split.
 *
 * Steps:
 *   1. Resolve the effective config via categoryId (skips silently if unresolvable).
 *   2. excludeIfDiscountAbovePct (basis points): if the parent sales order's
 *      effective discount % exceeds the threshold → skip split.
 *   3. maxPerCycleCents: sum of pending+approved+paid splits for the trainer in
 *      the same calendar-month cycle (excluding void). New amount is reduced so
 *      total ≤ cap. If cap already met, returned amount is 0 and skip=true.
 *
 * Returns a decision object the caller acts on. Pure read operation; safe to
 * call inside the same transaction as the eventual insert.
 */
export async function applyCommissionCaps(
	db: TenantDb | TenantTx,
	params: {
		appointmentId?: string | null;
		salesOrderId?: string | null;
		packageInstanceId?: string | null;
		staffId: string;
		amountCents: number;
		earnedAt: Date;
		// S-cycle-window-alignment: callers MAY pass the parent branchId so the
		// cap cycle is resolved against the branch's configured policy. When
		// omitted, the tenant-wide policy (or default UTC calendar month) is used.
		branchId?: string | null;
		/**
		 * Task #16/#18: delivery track ID for per-track cap isolation (GAPS #8).
		 * When provided, the cap SUM filters by commission_splits.track_id
		 * (LEFT JOIN, no INNER JOIN on configVersionId — avoids excluding NULL rows).
		 * When absent, falls back to the legacy configVersionId INNER JOIN path.
		 */
		trackId?: string | null;
	},
): Promise<CommissionCapDecision> {
	const tdb = db as TenantDb;

	const categoryId = await resolveCategoryIdForSplit(db, {
		appointmentId: params.appointmentId,
		salesOrderId: params.salesOrderId,
		packageInstanceId: params.packageInstanceId,
	});
	if (!categoryId) {
		// Cannot resolve config without a category — fall through with no cap.
		return { skip: false, amountCents: params.amountCents, reason: null };
	}

	// Task #18 / GAPS #8: read cap config from commission_tracks when trackId is
	// available (preferred), otherwise fall back to categoryCommissionConfigs.
	// Cap fields on commission_tracks mirror those on categoryCommissionConfigs
	// (maxPerCycleCents, excludeIfDiscountAbovePct) — migration 0083 copies them.
	let capConfig: {
		maxPerCycleCents: number | null | undefined;
		excludeIfDiscountAbovePct: number | null | undefined;
	} | null = null;

	if (params.trackId) {
		const [trackRow] = await tdb
			.select({
				maxPerCycleCents: commissionTracks.maxPerCycleCents,
				excludeIfDiscountAbovePct: commissionTracks.excludeIfDiscountAbovePct,
			})
			.from(commissionTracks)
			.where(eq(commissionTracks.id, params.trackId))
			.limit(1);
		capConfig = trackRow ?? null;
	} else {
		const [configRow] = await tdb
			.select({
				maxPerCycleCents: categoryCommissionConfigs.maxPerCycleCents,
				excludeIfDiscountAbovePct:
					categoryCommissionConfigs.excludeIfDiscountAbovePct,
			})
			.from(categoryCommissionConfigs)
			.where(
				and(
					eq(categoryCommissionConfigs.categoryId, categoryId),
					eq(categoryCommissionConfigs.isActive, true),
				),
			)
			.limit(1);
		capConfig = configRow ?? null;
	}

	if (!capConfig) {
		return { skip: false, amountCents: params.amountCents, reason: null };
	}

	// 1) Discount-threshold opt-out (sales order path only — appointments and
	//    package instances are not promotion-discounted in the current model).
	if (
		params.salesOrderId &&
		capConfig.excludeIfDiscountAbovePct !== null &&
		capConfig.excludeIfDiscountAbovePct !== undefined
	) {
		const discountBps = await computeOrderDiscountBps(db, params.salesOrderId);
		if (discountBps > capConfig.excludeIfDiscountAbovePct) {
			return {
				skip: true,
				amountCents: 0,
				reason: `Commission excluded: order discount ${(discountBps / 100).toFixed(2)}% exceeds category threshold ${(capConfig.excludeIfDiscountAbovePct / 100).toFixed(2)}%`,
			};
		}
	}

	// 2) Per-cycle cap. Sum non-void splits for trainer in the calendar month
	//    that contains earnedAt; cap the new amount so the running total ≤ cap.
	if (
		capConfig.maxPerCycleCents !== null &&
		capConfig.maxPerCycleCents !== undefined &&
		capConfig.maxPerCycleCents >= 0
	) {
		// S-cycle-window-alignment: resolve cycle bounds via configured policy
		// (branch-specific → tenant-wide → calendar-month default) instead of
		// hardcoded UTC calendar month. If the caller didn't pass `branchId`,
		// derive it from the parent (appointment | sales_order | package_instance).
		// At most one extra SELECT — `branch_id` is on the parent row directly.
		let resolvedBranchId: string | null = params.branchId ?? null;
		if (resolvedBranchId === null) {
			if (params.appointmentId) {
				const [r] = await tdb
					.select({ branchId: appointments.branchId })
					.from(appointments)
					.where(eq(appointments.id, params.appointmentId))
					.limit(1);
				resolvedBranchId = r?.branchId ?? null;
			} else if (params.salesOrderId) {
				const [r] = await tdb
					.select({ branchId: salesOrders.branchId })
					.from(salesOrders)
					.where(eq(salesOrders.id, params.salesOrderId))
					.limit(1);
				resolvedBranchId = r?.branchId ?? null;
			}
			// packageInstances doesn't carry a branchId column directly — fall back
			// to tenant-wide policy when only packageInstanceId is set.
		}
		const { start, end } = await resolveCycleBoundsForDate(
			tdb,
			resolvedBranchId,
			params.earnedAt,
		);

		// GAPS #11 — close the cap race with a pg_advisory_xact_lock.
		//
		// The old SELECT-SUM-then-INSERT pattern had a TOCTOU race: two concurrent
		// transactions for the same (staffId, cycle, track) would both read the
		// pre-insert total and both insert, exceeding the cap.
		//
		// Fix: acquire a transaction-scoped advisory lock keyed on
		// (staffId | trackOrCategoryId | cycleStart-ISO). Two concurrent earns
		// for the same scope will serialize here — the second waits until the
		// first commits/rolls back, then reads the updated total.
		//
		// pg_advisory_xact_lock is automatically released at transaction end.
		// It is a no-op outside an explicit transaction (auto-commit), which is
		// safe — individual inserts are atomic anyway.
		const lockScope = `${params.staffId}|${params.trackId ?? categoryId}|${start.toISOString()}`;
		await tdb.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext(${lockScope}))`,
		);

		// GAPS #8 — NO INNER JOIN on configVersionId.
		//
		// The old aggregate used INNER JOIN category_commission_config_versions via
		// configVersionId, which excluded splits where configVersionId IS NULL (e.g.
		// legacy manual rows or pre-migration rows). This silently under-counted the
		// cap total, allowing cap overruns.
		//
		// New approach: when trackId is available, filter by commission_splits.track_id
		// directly — no JOIN needed, no NULL exclusion. This is also the correct
		// per-track isolation (GAPS #8): caps are PER-TRACK, so a trainer who earns
		// on two tracks has independent ceilings.
		//
		// When trackId is absent (legacy fallback path), use LEFT JOIN +
		// COALESCE so NULL configVersionId rows are included conservatively.
		let agg: { total: number } | undefined;

		if (params.trackId) {
			// Track path: filter by track_id directly (no JOIN, no NULL exclusion)
			const [row] = await tdb
				.select({
					total:
						sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)`.mapWith(
							Number,
						),
				})
				.from(commissionSplits)
				.where(
					and(
						eq(commissionSplits.staffId, params.staffId),
						eq(commissionSplits.trackId, params.trackId),
						ne(commissionSplits.status, "void"),
						gte(commissionSplits.earnedAt, start),
						sql`${commissionSplits.earnedAt} < ${end}`,
					),
				);
			agg = row;
		} else {
			// Legacy fallback: LEFT JOIN so NULL configVersionId rows are included.
			// The SUM covers all splits for this staff+category+cycle regardless
			// of whether configVersionId is set.
			const [row] = await tdb
				.select({
					total:
						sql<number>`COALESCE(SUM(${commissionSplits.calculatedAmount}), 0)`.mapWith(
							Number,
						),
				})
				.from(commissionSplits)
				.leftJoin(
					categoryCommissionConfigVersions,
					eq(
						commissionSplits.configVersionId,
						categoryCommissionConfigVersions.id,
					),
				)
				.where(
					and(
						eq(commissionSplits.staffId, params.staffId),
						sql`COALESCE(${categoryCommissionConfigVersions.categoryId}, ${commissionSplits.trackId}::text) IS NOT DISTINCT FROM ${categoryId}`,
						ne(commissionSplits.status, "void"),
						gte(commissionSplits.earnedAt, start),
						sql`${commissionSplits.earnedAt} < ${end}`,
					),
				);
			agg = row;
		}

		const alreadyCents = agg?.total ?? 0;
		const remaining = capConfig.maxPerCycleCents - alreadyCents;
		if (remaining <= 0) {
			return {
				skip: true,
				amountCents: 0,
				reason: `Commission skipped: trainer reached per-cycle cap of ${capConfig.maxPerCycleCents} cents (already ${alreadyCents})`,
			};
		}
		if (params.amountCents > remaining) {
			return {
				skip: false,
				amountCents: remaining,
				reason: `Commission capped from ${params.amountCents} to ${remaining} cents — per-cycle limit ${capConfig.maxPerCycleCents}`,
			};
		}
	}

	return { skip: false, amountCents: params.amountCents, reason: null };
}

// ---------------------------------------------------------------------------
// Write helpers — new in Phase 6
// ---------------------------------------------------------------------------

export interface CreateSplitParams {
	/** Exactly one of appointmentId, salesOrderId, or packageInstanceId must be set */
	appointmentId?: string;
	salesOrderId?: string;
	/** Agent 2.5 — third source for J5 commission audit */
	packageInstanceId?: string;
	/** Agent 2.5 — frozen config version snapshot at split creation time */
	configVersionId?: string;
	/**
	 * staffId = members.userId (cross-DB user ID), NOT the tenant member table PK.
	 * Consistent with appointmentStaff.staffId and payouts.recipientId conventions.
	 */
	staffId: string;
	splitPercentage: number; // 0–100
	calculatedAmountCents: number; // pre-tax, integer cents
	notes?: string;
	earnedAt?: Date; // defaults to now(); use appointment.completedAt or salesOrder.createdAt when available
	actor: { userId: string; memberId: string; role: string };
	// Commission calculation snapshot fields
	slotIndex?: number;
	conditionId?: string;
	trainerTierId?: string;
	weightageBasisPoints?: number;
	baseAmountCents?: number;
	splitType?: "automatic" | "manual";
	manualNote?: string;
}

/**
 * Insert a single commission split with status='pending'.
 * Idempotent: if a split already exists for the same (appointment_id, staff_id) or
 * (sales_order_id, staff_id), the duplicate is silently ignored and the existing row
 * is returned. Uses onConflictDoNothing rather than error-code parsing.
 * Writes audit inside the same transaction.
 */
export async function createCommissionSplit(
	db: TenantDb | TenantTx,
	params: CreateSplitParams,
): Promise<CommissionSplit | null> {
	const {
		appointmentId,
		salesOrderId,
		packageInstanceId,
		configVersionId,
		staffId,
		splitPercentage,
		calculatedAmountCents,
		notes,
		earnedAt,
		actor,
		slotIndex,
		conditionId,
		trainerTierId,
		weightageBasisPoints,
		baseAmountCents,
		splitType,
		manualNote,
	} = params;

	// Agent 3.3 — Phase 3 §5: comp-order / commission-excluded guard.
	// Skip split creation when the parent sales order is complimentary
	// (sales_orders.complimentary_reason IS NOT NULL) or when every line on
	// the order is opted out via sales_order_items.commission_excluded.
	// NOTE: the hot POS path goes through commission-calculator.service.ts
	// (_buildSplits) and bypasses this function via direct insert. Mirror
	// guard there is a follow-up (read-only in this scope).
	if (salesOrderId) {
		const [orderRow] = await (db as TenantDb)
			.select({ complimentaryReason: salesOrders.complimentaryReason })
			.from(salesOrders)
			.where(eq(salesOrders.id, salesOrderId))
			.limit(1);
		if (orderRow?.complimentaryReason) {
			return null;
		}
		const [activeLine] = await (db as TenantDb)
			.select({ id: salesOrderItems.id })
			.from(salesOrderItems)
			.where(
				and(
					eq(salesOrderItems.salesOrderId, salesOrderId),
					eq(salesOrderItems.commissionExcluded, false),
				),
			)
			.limit(1);
		if (!activeLine) {
			// Either no items at all, or every item is commission-excluded.
			return null;
		}
	}

	const sourceCount =
		(appointmentId ? 1 : 0) +
		(salesOrderId ? 1 : 0) +
		(packageInstanceId ? 1 : 0);
	if (sourceCount === 0) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"createCommissionSplit: exactly one of appointmentId, salesOrderId, or packageInstanceId is required",
		});
	}
	if (sourceCount > 1) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"createCommissionSplit: cannot set more than one of appointmentId, salesOrderId, packageInstanceId",
		});
	}

	// Agent 3.4 — Phase 3 §5: discount-threshold opt-out + per-cycle cap.
	// Comp / commission-excluded skip is already evaluated above; if we reach
	// here the line is commission-eligible. Cap evaluation is read-only and
	// safe to share the surrounding transaction.
	const splitEarnedAt = earnedAt ?? new Date();
	const capDecision = await applyCommissionCaps(db, {
		appointmentId: appointmentId ?? null,
		salesOrderId: salesOrderId ?? null,
		packageInstanceId: packageInstanceId ?? null,
		staffId,
		amountCents: calculatedAmountCents,
		earnedAt: splitEarnedAt,
	});
	if (capDecision.skip) {
		return null;
	}
	const finalAmountCents = capDecision.amountCents;
	const capNoteSuffix = capDecision.reason
		? notes
			? `${notes} | ${capDecision.reason}`
			: capDecision.reason
		: (notes ?? null);

	const [inserted] = await (db as TenantDb)
		.insert(commissionSplits)
		.values({
			appointmentId: appointmentId ?? null,
			salesOrderId: salesOrderId ?? null,
			packageInstanceId: packageInstanceId ?? null,
			configVersionId: configVersionId ?? null,
			staffId,
			splitPercentage,
			calculatedAmount: finalAmountCents,
			notes: capNoteSuffix,
			status: "pending",
			earnedAt: splitEarnedAt,
			slotIndex: slotIndex ?? null,
			conditionId: conditionId ?? null,
			trainerTierId: trainerTierId ?? null,
			weightageBasisPoints: weightageBasisPoints ?? null,
			baseAmountCents: baseAmountCents ?? null,
			splitType: splitType ?? "automatic",
			manualNote: manualNote ?? null,
		})
		.onConflictDoNothing()
		.returning();

	if (inserted) {
		// New row was created — write audit
		await writeAudit(db as TenantDb, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "commission.create",
			entityType: "commission_split",
			entityId: inserted.id,
			branchId: undefined,
			summary: `Commission split created for staff ${staffId} — ${finalAmountCents} cents (${splitPercentage}%)${capDecision.reason ? ` [${capDecision.reason}]` : ""}`,
			changes: {
				appointmentId: appointmentId ?? null,
				salesOrderId: salesOrderId ?? null,
				staffId,
				splitPercentage,
				requestedAmountCents: calculatedAmountCents,
				calculatedAmountCents: finalAmountCents,
				capReason: capDecision.reason,
			},
		});
		return inserted;
	}

	// Conflict: row already exists — fetch and return it
	const existing = appointmentId
		? await (db as TenantDb).query.commissionSplits.findFirst({
				where: and(
					eq(commissionSplits.appointmentId, appointmentId),
					eq(commissionSplits.staffId, staffId),
				),
			})
		: await (db as TenantDb).query.commissionSplits.findFirst({
				where: and(
					eq(commissionSplits.salesOrderId, salesOrderId!),
					eq(commissionSplits.staffId, staffId),
				),
			});

	if (!existing) {
		throw new Error(
			"createCommissionSplit: conflict resolution failed — existing row not found",
		);
	}
	return existing;
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * Bulk approve pending commission splits.
 * All ids must be status='pending'. Any non-pending id causes BAD_REQUEST.
 * Writes one audit row per split inside the supplied db connection.
 */
export async function approveCommissionSplits(
	tenantDb: TenantDb,
	ids: string[],
	actor: { userId: string; memberId: string; role: string },
): Promise<CommissionSplit[]> {
	if (ids.length === 0) return [];

	return tenantDb.transaction(async (tx) => {
		const existing = await tx
			.select()
			.from(commissionSplits)
			.where(inArray(commissionSplits.id, ids))
			.for("update");

		const nonPending = existing.filter((r) => r.status !== "pending");
		if (nonPending.length > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot approve: ${nonPending.length} split(s) are not in 'pending' status (ids: ${nonPending.map((r) => r.id).join(", ")})`,
			});
		}

		// Batch invariant: all splits must be for the same staff member and within 31 days.
		// Prevents cross-trainer and cross-period approval accidents.
		if (existing.length === 0) return [];

		const staffIds = new Set(existing.map((r) => r.staffId));
		if (staffIds.size > 1) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Approval batch must contain splits for a single staff member. Got ${staffIds.size} distinct staff IDs: ${[...staffIds].join(", ")}.`,
				data: { code: "MIXED_BATCH_STAFF", staffIds: [...staffIds] },
			});
		}

		const earned = existing
			.map((r) => r.earnedAt.getTime())
			.sort((a, b) => a - b);
		const spreadDays = (earned[earned.length - 1]! - earned[0]!) / 86_400_000;
		if (spreadDays > 31) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Approval batch spans ${Math.ceil(spreadDays)} days; max allowed is 31. Filter to a single payout period.`,
				data: { code: "MIXED_BATCH_PERIOD", spreadDays: Math.ceil(spreadDays) },
			});
		}

		const now = new Date();
		const updated = await tx
			.update(commissionSplits)
			.set({
				status: "approved",
				approvedBy: actor.userId,
				approvedAt: now,
				updatedAt: now,
			})
			.where(inArray(commissionSplits.id, ids))
			.returning();

		// Audit per row inside the same transaction
		for (const row of updated) {
			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "commission.approve",
				entityType: "commission_split",
				entityId: row.id,
				summary: `Commission split approved for staff ${row.staffId} — ${row.calculatedAmount} cents`,
				changes: { previousStatus: "pending", newStatus: "approved" },
			});
		}

		return updated;
	});
}

export interface MarkPaidParams {
	payoutId?: string;
	/**
	 * Free-form reference string (e.g. bank transaction ID, cheque number).
	 * Stored in the audit changes payload and appended to the split's notes
	 * field. Not a UUID FK — distinct from `payoutId` which links to payouts.id.
	 */
	paymentReference?: string;
	actor: { userId: string; memberId: string; role: string };
}

/**
 * Bulk mark approved commission splits as paid.
 * All ids must be status='approved'. Any non-approved id causes BAD_REQUEST.
 * Optionally links a payoutId to each split. Optionally records a
 * paymentReference string in audit + notes (no dedicated column).
 */
export async function markCommissionSplitsPaid(
	tenantDb: TenantDb,
	ids: string[],
	params: MarkPaidParams,
): Promise<CommissionSplit[]> {
	if (ids.length === 0) return [];

	return tenantDb.transaction(async (tx) => {
		const existing = await tx
			.select()
			.from(commissionSplits)
			.where(inArray(commissionSplits.id, ids))
			.for("update");

		const nonApproved = existing.filter((r) => r.status !== "approved");
		if (nonApproved.length > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot mark paid: ${nonApproved.length} split(s) are not in 'approved' status (ids: ${nonApproved.map((r) => r.id).join(", ")})`,
			});
		}

		const now = new Date();
		// Per-row update so we can append paymentReference to each split's notes
		// without clobbering existing content. Falls back to a bulk update when
		// no reference is supplied.
		let updated: CommissionSplit[];
		if (params.paymentReference) {
			const ref = params.paymentReference;
			updated = [];
			for (const row of existing) {
				const refSuffix = `Payment ref: ${ref}`;
				const nextNotes = row.notes ? `${row.notes} | ${refSuffix}` : refSuffix;
				const [u] = await tx
					.update(commissionSplits)
					.set({
						status: "paid",
						paidBy: params.actor.userId,
						paidAt: now,
						...(params.payoutId !== undefined && { payoutId: params.payoutId }),
						notes: nextNotes,
						updatedAt: now,
					})
					.where(eq(commissionSplits.id, row.id))
					.returning();
				if (u) updated.push(u);
			}
		} else {
			updated = await tx
				.update(commissionSplits)
				.set({
					status: "paid",
					paidBy: params.actor.userId,
					paidAt: now,
					...(params.payoutId !== undefined && { payoutId: params.payoutId }),
					updatedAt: now,
				})
				.where(inArray(commissionSplits.id, ids))
				.returning();
		}

		for (const row of updated) {
			await writeAudit(tx, {
				actorUserId: params.actor.userId,
				actorMemberId: params.actor.memberId,
				actorRole: params.actor.role,
				action: "commission.mark_paid",
				entityType: "commission_split",
				entityId: row.id,
				summary: `Commission split marked paid for staff ${row.staffId} — ${row.calculatedAmount} cents`,
				changes: {
					previousStatus: "approved",
					newStatus: "paid",
					payoutId: params.payoutId ?? null,
					paymentReference: params.paymentReference ?? null,
				},
			});
		}

		return updated;
	});
}

/**
 * Void a single commission split.
 * Blocks on paid status. Idempotent if already void. Writes audit.
 */
export async function voidCommissionSplit(
	tenantDb: TenantDb,
	id: string,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<CommissionSplit> {
	return tenantDb.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(commissionSplits)
			.where(eq(commissionSplits.id, id))
			.for("update");

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Commission split not found",
			});
		}
		if (existing.status === "paid") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot void a paid commission split. Contact finance.",
			});
		}
		if (existing.status === "void") {
			return existing; // Idempotent
		}

		const [updated] = await tx
			.update(commissionSplits)
			.set({ status: "void", notes: reason, updatedAt: new Date() })
			.where(eq(commissionSplits.id, id))
			.returning();

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "commission.void",
			entityType: "commission_split",
			entityId: id,
			summary: `Commission split voided: ${reason}`,
			changes: { previousStatus: existing.status, reason },
		});

		return updated!;
	});
}

/**
 * Void all non-void, non-paid commission splits for a sales order.
 * Used by the cancelled-sales flow (Phase 4.8a).
 */
export async function voidCommissionSplitsForSalesOrder(
	tenantDb: TenantDb,
	salesOrderId: string,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<CommissionSplit[]> {
	// CPR-06: Wrap all reads and writes in a single transaction to prevent
	// partial-void state if any step fails, and to serialise concurrent mutations
	// on the same sales order.
	return tenantDb.transaction(async (tx) => {
		const rows = await tx
			.select()
			.from(commissionSplits)
			.where(
				and(
					eq(commissionSplits.salesOrderId, salesOrderId),
					ne(commissionSplits.status, "void"),
					ne(commissionSplits.status, "paid"),
				),
			);

		if (rows.length === 0) return [];

		// Task 1.7: skip splits whose linked appointment has already been delivered
		// (status = 'completed' or 'cancelled'). Those splits were earned at delivery
		// time and must not be voided when the parent sale is cancelled after the fact.
		const toVoid: typeof rows = [];
		const skipped: typeof rows = [];

		for (const row of rows) {
			if (row.appointmentId) {
				const [appt] = await tx
					.select({ status: appointments.status })
					.from(appointments)
					.where(eq(appointments.id, row.appointmentId))
					.limit(1);

				if (
					appt?.status === "completed" ||
					appt?.status === "cancelled" ||
					appt?.status === "no_show"
				) {
					skipped.push(row);
					console.info(
						JSON.stringify({
							event: "commission_void_skipped_delivered",
							splitId: row.id,
							appointmentId: row.appointmentId,
							appointmentStatus: appt.status,
							salesOrderId,
						}),
					);
					continue;
				}
			}
			toVoid.push(row);
		}

		if (toVoid.length === 0) return [];

		const ids = toVoid.map((r) => r.id);
		const updated = await tx
			.update(commissionSplits)
			.set({ status: "void", notes: reason, updatedAt: new Date() })
			.where(inArray(commissionSplits.id, ids))
			.returning();

		for (const row of updated) {
			await writeAudit(tx as unknown as TenantDb, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "commission.void",
				entityType: "commission_split",
				entityId: row.id,
				summary: `Commission voided on sales order cancellation: ${reason}`,
				changes: { salesOrderId, reason },
			});
		}

		return updated;
	}); // end transaction
}

export interface CreateManualAdjustmentParams {
	staffId: string; // members.userId (cross-DB)
	amountCents: number; // Can be negative (clawback)
	note: string; // Required
	salesOrderId?: string | null;
	appointmentId?: string | null;
	packageInstanceId?: string | null;
	actor: { userId: string; memberId: string; role: string };
}

/**
 * Create a manual commission adjustment (positive bonus or negative clawback).
 * splitType="manual". Writes audit. No idempotency guard — each call creates a new row.
 */
// ---------------------------------------------------------------------------
// Liability summary (Phase 6)
// ---------------------------------------------------------------------------

export interface LiabilitySummaryTrainer {
	memberId: string; // members.userId (staffId on commission_splits)
	name: string; // from control-panel user.name; falls back to userId
	approvedUnpaidCents: number;
	paidCents: number;
	manualAdjustmentCents: number; // manual splits where status IN (pending, approved)
	netPayableCents: number; // approvedUnpaidCents + manualAdjustmentCents
	/**
	 * Breakdown of approvedUnpaidCents by roleType.
	 * NULL roleType rows are keyed as "delivery_legacy" (GAPS #22).
	 */
	byRoleType: Record<string, number>;
}

export interface LiabilitySummaryResult {
	trainers: LiabilitySummaryTrainer[];
	totals: {
		approvedUnpaidCents: number;
		paidCents: number;
		manualAdjustmentCents: number;
		netPayableCents: number;
		/** Breakdown of approvedUnpaidCents by roleType across all trainers. */
		byRoleType: Record<string, number>;
	};
}

export interface LiabilitySummaryParams {
	from: string; // ISO datetime
	to: string; // ISO datetime (inclusive end)
	hierarchyNodeId?: string; // optional scope to hierarchy subtree
	categoryId?: string; // optional filter by service category
	/** SQL-side filter: only include splits for this track. */
	trackId?: string;
	/** SQL-side filter: only include splits with this roleType (NULL treated as "delivery_legacy"). */
	roleType?: string;
}

/**
 * Aggregate commission liability for a date range.
 *
 * Filters on earnedAt (not createdAt) — sessions delivered in a period but
 * completed later still fall in the correct payroll period.
 *
 * Status buckets (all non-void):
 *   approvedUnpaidCents  — automatic splits, status="approved"
 *   paidCents            — status="paid" (any splitType)
 *   manualAdjustmentCents— manual splits, status IN ("pending","approved")
 *   netPayableCents      — approvedUnpaidCents + manualAdjustmentCents
 */
export async function liabilitySummary(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: LiabilitySummaryParams,
): Promise<LiabilitySummaryResult> {
	const { from, to, hierarchyNodeId, categoryId, trackId, roleType } = params;

	const fromDate = new Date(from);
	const toDate = new Date(to);

	// Build staff scope from hierarchy if needed
	let staffIdScope: string[] | null = null;
	if (hierarchyNodeId) {
		const descendantNodeIds = await getDescendantNodeIds(
			tenantDb,
			hierarchyNodeId,
		);
		if (descendantNodeIds.length === 0) {
			// No nodes found — return empty result
			return {
				trainers: [],
				totals: {
					approvedUnpaidCents: 0,
					paidCents: 0,
					manualAdjustmentCents: 0,
					netPayableCents: 0,
				},
			};
		}
		// Fetch userIds of members whose hierarchyScopeId is within the descendant set
		const scopedMembers = await tenantDb
			.select({ userId: members.userId })
			.from(members)
			.where(inArray(members.hierarchyScopeId, descendantNodeIds));
		staffIdScope = scopedMembers.map((m) => m.userId);
		if (staffIdScope.length === 0) {
			return {
				trainers: [],
				totals: {
					approvedUnpaidCents: 0,
					paidCents: 0,
					manualAdjustmentCents: 0,
					netPayableCents: 0,
				},
			};
		}
	}

	// Build WHERE conditions
	const baseConditions = [
		gte(commissionSplits.earnedAt, fromDate),
		lte(commissionSplits.earnedAt, toDate),
		ne(commissionSplits.status, "void"),
	];

	if (staffIdScope !== null) {
		baseConditions.push(inArray(commissionSplits.staffId, staffIdScope));
	}

	// SQL-side track / roleType filters (Phase 4, GAPS #22 — never in-memory).
	// NULL roleType is treated as "delivery_legacy": when the caller requests
	// roleType=null specifically, we match IS NULL; when they pass the string
	// "delivery_legacy" we also match IS NULL for backwards compat.
	if (trackId) {
		baseConditions.push(eq(commissionSplits.trackId, trackId));
	}
	if (roleType !== undefined) {
		if (roleType === null || roleType === "delivery_legacy") {
			baseConditions.push(sql`${commissionSplits.roleType} IS NULL`);
		} else {
			baseConditions.push(eq(commissionSplits.roleType, roleType));
		}
	}

	// Single aggregation query using conditional sums grouped by staffId + roleType.
	// If categoryId is provided, we LEFT JOIN appointments and salesOrders, then
	// filter to splits that have a matching category (or are manual with no source).
	//
	// Invariant: refunded commission must NOT show as owed.
	//   approvedUnpaid = SUM(calculatedAmount WHERE status=approved AND splitType=automatic)
	//                  + SUM(reversal.amountCents WHERE source.status=approved AND splitType=automatic)
	//   paid           = SUM(calculatedAmount WHERE status=paid)
	//                  + SUM(reversal.amountCents WHERE source.status=paid)
	// reversal.amountCents is negative → reduces the bucket. Reversals are joined
	// via a pre-aggregated subquery (one row per split) so the outer GROUP BY does
	// NOT double-count split rows. Single SQL query — no N+1.
	const reversalsSubquery = tenantDb
		.select({
			splitId: commissionSplitReversals.reversedSplitId,
			total:
				sql<number>`COALESCE(SUM(${commissionSplitReversals.amountCents}), 0)`
					.mapWith(Number)
					.as("reversal_total"),
		})
		.from(commissionSplitReversals)
		.groupBy(commissionSplitReversals.reversedSplitId)
		.as("rev");

	let rows: {
		staffId: string;
		roleType: string | null;
		approvedUnpaid: number;
		paid: number;
		manualAdj: number;
	}[];

	if (categoryId) {
		// Category filter: appointment path → appointments.serviceId → services.categoryId
		//                  sales order path → sales_order_items.serviceId → services.categoryId
		// Manual splits with neither appointmentId nor salesOrderId are excluded.
		rows = (await tenantDb
			.select({
				staffId: commissionSplits.staffId,
				// NULL roleType = delivery (legacy). COALESCE to sentinel so GROUP BY collapses correctly.
				roleType: sql<string | null>`${commissionSplits.roleType}`,
				approvedUnpaid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						     AND ${commissionSplits.splitType} = 'automatic'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
					+ COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						     AND ${commissionSplits.splitType} = 'automatic'
						THEN COALESCE(${reversalsSubquery.total}, 0) ELSE 0 END
					), 0)
				`.mapWith(Number),
				paid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
					+ COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN COALESCE(${reversalsSubquery.total}, 0) ELSE 0 END
					), 0)
				`.mapWith(Number),
				manualAdj: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.splitType} = 'manual'
						     AND ${commissionSplits.status} IN ('pending', 'approved')
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
			})
			.from(commissionSplits)
			.leftJoin(
				appointments,
				eq(commissionSplits.appointmentId, appointments.id),
			)
			.leftJoin(services, eq(appointments.serviceId, services.id))
			.leftJoin(
				reversalsSubquery,
				eq(reversalsSubquery.splitId, commissionSplits.id),
			)
			.where(
				and(
					...baseConditions,
					// Must match category via one of the two paths
					sql`(
						-- Appointment-linked: service.categoryId matches
						(${commissionSplits.appointmentId} IS NOT NULL
						 AND ${services.categoryId} = ${categoryId})
						OR
						-- SalesOrder-linked: at least one SOI line has matching serviceId→category
						(${commissionSplits.salesOrderId} IS NOT NULL
						 AND EXISTS (
						   SELECT 1
						   FROM ${salesOrderItems} soi
						   INNER JOIN ${services} svc ON svc.id = soi.service_id
						   WHERE soi.sales_order_id = ${commissionSplits.salesOrderId}
						   AND svc.category_id = ${categoryId}
						 ))
					)`,
				),
			)
			.groupBy(commissionSplits.staffId, commissionSplits.roleType)) as {
			staffId: string;
			roleType: string | null;
			approvedUnpaid: number;
			paid: number;
			manualAdj: number;
		}[];
	} else {
		// No category filter — simple aggregation grouped by (staffId, roleType).
		// Grouping by roleType produces one row per (staff, roleType) so the caller
		// can aggregate byRoleType breakdowns without a second query.
		rows = (await tenantDb
			.select({
				staffId: commissionSplits.staffId,
				roleType: sql<string | null>`${commissionSplits.roleType}`,
				approvedUnpaid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						     AND ${commissionSplits.splitType} = 'automatic'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
					+ COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						     AND ${commissionSplits.splitType} = 'automatic'
						THEN COALESCE(${reversalsSubquery.total}, 0) ELSE 0 END
					), 0)
				`.mapWith(Number),
				paid: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
					+ COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN COALESCE(${reversalsSubquery.total}, 0) ELSE 0 END
					), 0)
				`.mapWith(Number),
				manualAdj: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.splitType} = 'manual'
						     AND ${commissionSplits.status} IN ('pending', 'approved')
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
			})
			.from(commissionSplits)
			.leftJoin(
				reversalsSubquery,
				eq(reversalsSubquery.splitId, commissionSplits.id),
			)
			.where(and(...baseConditions))
			.groupBy(commissionSplits.staffId, commissionSplits.roleType)) as {
			staffId: string;
			roleType: string | null;
			approvedUnpaid: number;
			paid: number;
			manualAdj: number;
		}[];
	}

	if (rows.length === 0) {
		return {
			trainers: [],
			totals: {
				approvedUnpaidCents: 0,
				paidCents: 0,
				manualAdjustmentCents: 0,
				netPayableCents: 0,
				byRoleType: {},
			},
		};
	}

	// Enrich names from control-panel user table (best-effort — same pattern as listCommissionLedger)
	const distinctStaffIds = [...new Set(rows.map((r) => r.staffId))];
	const staffNameMap = new Map<string, string>();
	try {
		const { user } = await import("@avantej-core/db/schema/auth");
		const { inArray: inArr } = await import("drizzle-orm");
		const users = await controlPanelDb
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(inArr(user.id, distinctStaffIds));
		for (const u of users) {
			staffNameMap.set(u.id, u.name);
		}
	} catch {
		// Best-effort: if control panel is unavailable, names fall back to userId
	}

	// Rows are now (staffId, roleType) tuples. Collapse them into per-trainer entries
	// accumulating the byRoleType breakdown. NULL roleType → "delivery_legacy" (GAPS #22).
	const trainerMap = new Map<
		string,
		{
			approvedUnpaidCents: number;
			paidCents: number;
			manualAdjustmentCents: number;
			byRoleType: Record<string, number>;
		}
	>();

	for (const row of rows) {
		const roleKey = row.roleType ?? "delivery_legacy";
		const existing = trainerMap.get(row.staffId) ?? {
			approvedUnpaidCents: 0,
			paidCents: 0,
			manualAdjustmentCents: 0,
			byRoleType: {},
		};
		existing.approvedUnpaidCents += row.approvedUnpaid;
		existing.paidCents += row.paid;
		existing.manualAdjustmentCents += row.manualAdj;
		existing.byRoleType[roleKey] =
			(existing.byRoleType[roleKey] ?? 0) + row.approvedUnpaid;
		trainerMap.set(row.staffId, existing);
	}

	const trainers: LiabilitySummaryTrainer[] = [];
	for (const [staffId, agg] of trainerMap) {
		trainers.push({
			memberId: staffId,
			name: staffNameMap.get(staffId) ?? staffId,
			approvedUnpaidCents: agg.approvedUnpaidCents,
			paidCents: agg.paidCents,
			manualAdjustmentCents: agg.manualAdjustmentCents,
			netPayableCents: agg.approvedUnpaidCents + agg.manualAdjustmentCents,
			byRoleType: agg.byRoleType,
		});
	}

	// Aggregate totals from per-trainer rows (cheap JS reduction)
	const totalByRoleType: Record<string, number> = {};
	const totals = trainers.reduce(
		(acc, t) => {
			acc.approvedUnpaidCents += t.approvedUnpaidCents;
			acc.paidCents += t.paidCents;
			acc.manualAdjustmentCents += t.manualAdjustmentCents;
			acc.netPayableCents += t.netPayableCents;
			for (const [role, amount] of Object.entries(t.byRoleType)) {
				totalByRoleType[role] = (totalByRoleType[role] ?? 0) + amount;
			}
			return acc;
		},
		{
			approvedUnpaidCents: 0,
			paidCents: 0,
			manualAdjustmentCents: 0,
			netPayableCents: 0,
		},
	);

	return { trainers, totals: { ...totals, byRoleType: totalByRoleType } };
}

// ---------------------------------------------------------------------------
// Mark paid batch (Phase 6)
// ---------------------------------------------------------------------------

export interface MarkPaidBatchParams {
	memberIds: string[]; // staffIds / userIds
	from: string; // ISO datetime
	to: string; // ISO datetime
	actor: { userId: string; memberId: string; role: string };
	/**
	 * F-PAY-3: Payment method stored on the created payouts row.
	 * Defaults to "bank_transfer" when omitted.
	 */
	paymentMethod?: "bank_transfer" | "cash" | "check" | "other";
	/**
	 * Optional branch anchor for the payout_batches row. NULL = cross-branch batch.
	 * Passed through to getOrCreatePayoutBatch for idempotent batch resolution.
	 */
	branchId?: string | null;
}

export interface MarkPaidBatchResult {
	updatedCount: number;
	memberIds: string[]; // subset of input that actually had rows updated
	/**
	 * F-PAY-3: IDs of the payout rows created — one per affected staff member.
	 * These link commission_splits.payoutId back to the payouts table so KPI
	 * queries on payouts.amount correctly include Liability-tab disbursements.
	 */
	payoutIds: string[];
}

/**
 * Batch-mark all approved commission splits for the given members in the
 * earnedAt date range as paid. Wrapped in a transaction.
 *
 * F-PAY-3 fix (2026-05-27 audit-prove-a): after flipping splits to 'paid',
 * insert one `payouts` row per affected member (summing their split amounts).
 * The Payouts tab, KPIs, and recipientSummary all read from the `payouts`
 * table — splits marked paid via this Liability-tab path previously NEVER
 * appeared there.
 *
 * One audit log entry per MEMBER affected (not per split).
 */
export async function markPaidBatch(
	tenantDb: TenantDb,
	params: MarkPaidBatchParams,
): Promise<MarkPaidBatchResult> {
	const { memberIds, from, to, actor, branchId } = params;
	const paymentMethod = params.paymentMethod ?? "bank_transfer";

	const fromDate = new Date(from);
	const toDate = new Date(to);

	return tenantDb.transaction(async (tx) => {
		const now = new Date();

		// 1. Update splits to 'paid', returning staffId + calculatedAmount for payout grouping
		const updated = await tx
			.update(commissionSplits)
			.set({
				status: "paid",
				paidBy: actor.userId,
				paidAt: now,
				updatedAt: now,
			})
			.where(
				and(
					inArray(commissionSplits.staffId, memberIds),
					eq(commissionSplits.status, "approved"),
					gte(commissionSplits.earnedAt, fromDate),
					lte(commissionSplits.earnedAt, toDate),
				),
			)
			.returning({
				id: commissionSplits.id,
				staffId: commissionSplits.staffId,
				calculatedAmount: commissionSplits.calculatedAmount,
			});

		const updatedCount = updated.length;
		// Distinct memberIds that had at least one row updated
		const affectedMemberIds = [...new Set(updated.map((r) => r.staffId))];
		// F-PAY-3: collect payout IDs created in this run for the return value.
		const payoutIds: string[] = [];

		if (affectedMemberIds.length > 0) {
			// 2. F-PAY-3: resolve (or create) a payout batch for idempotent grouping.
			// Mirrors the getOrCreatePayoutBatch pattern from runBatch in payouts.service.ts.
			// Using the earnedAt period bounds as the batch period — consistent with how
			// the Liability tab's date range maps to a payroll period.
			const batch = await getOrCreatePayoutBatch(tx as unknown as TenantDb, {
				branchId: branchId ?? null,
				periodStart: fromDate,
				periodEnd: toDate,
				createdBy: actor.userId,
			});

			// 3. Group updated splits by staffId and sum amounts
			const byStaff = new Map<
				string,
				{ splitIds: string[]; totalCents: number }
			>();
			for (const row of updated) {
				const existing = byStaff.get(row.staffId) ?? {
					splitIds: [],
					totalCents: 0,
				};
				existing.splitIds.push(row.id);
				existing.totalCents += row.calculatedAmount;
				byStaff.set(row.staffId, existing);
			}

			// 4. Insert one payout row per staff member and link splits back to it
			for (const [staffId, group] of byStaff) {
				const [newPayout] = await tx
					.insert(payouts)
					.values({
						recipientId: staffId,
						amount: group.totalCents,
						grossAmountCents: group.totalCents,
						deductionsCents: 0,
						currency: "myr",
						payoutMethod: paymentMethod,
						status: "paid",
						paidAt: now,
						manualPayoutConfirmedAt: now,
						manualPayoutConfirmedBy: actor.userId,
						batchId: batch.id,
						appointmentId: null,
						notes: `Liability batch payout ${fromDate.toISOString().slice(0, 10)} – ${toDate.toISOString().slice(0, 10)}`,
					})
					.returning({ id: payouts.id });

				if (!newPayout) {
					throw new Error(
						`markPaidBatch: failed to insert payout row for staff ${staffId}`,
					);
				}
				// Track for return value
				payoutIds.push(newPayout.id);

				// 5. Back-link splits to the new payout row
				await tx
					.update(commissionSplits)
					.set({ payoutId: newPayout.id, updatedAt: now })
					.where(inArray(commissionSplits.id, group.splitIds));

				// 6. Audit for the payout row itself
				await writeAudit(tx, {
					actorUserId: actor.userId,
					actorMemberId: actor.memberId,
					actorRole: actor.role,
					action: "payout.create",
					entityType: "payout",
					entityId: newPayout.id,
					summary: `Liability batch payout RM ${(group.totalCents / 100).toFixed(2)} created for staff ${staffId} (${group.splitIds.length} split(s))`,
					changes: {
						recipientId: staffId,
						amountCents: group.totalCents,
						splitCount: group.splitIds.length,
						paymentMethod,
						batchId: batch.id,
						from,
						to,
					},
				});
			}
		}

		// 7. One audit entry per affected member (commission lifecycle audit)
		for (const memberId of affectedMemberIds) {
			const memberSplitCount = updated.filter(
				(r) => r.staffId === memberId,
			).length;
			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "commission.batch_paid",
				entityType: "commission_split",
				entityId: memberId,
				summary: `Batch paid ${memberSplitCount} commission split(s) for staff ${memberId} (period: ${from} – ${to})`,
				changes: {
					staffId: memberId,
					splitCount: memberSplitCount,
					from,
					to,
				},
			});
		}

		return { updatedCount, memberIds: affectedMemberIds, payoutIds };
	});
}

// Manual adjustments above this threshold are flagged for review before paying out.
const MANUAL_REVIEW_THRESHOLD_CENTS = 50_000; // RM 500

export async function createManualAdjustment(
	tenantDb: TenantDb,
	params: CreateManualAdjustmentParams,
): Promise<CommissionSplit> {
	// Defense-in-depth XOR check: the commission_splits_must_target_one DB CHECK
	// enforces this at the row level (Postgres 23514). Validating here gives a
	// clean error message before the insert runs, so callers that bypass the
	// router (tests, services) get the same protection as router callers.
	const targetCount =
		(params.appointmentId ? 1 : 0) +
		(params.salesOrderId ? 1 : 0) +
		(params.packageInstanceId ? 1 : 0);
	if (targetCount !== 1) {
		throw new Error(
			"XOR target violation: exactly one of appointmentId/salesOrderId/packageInstanceId required",
		);
	}

	// Duplicate guard: reject if a non-void manual split already exists for the
	// same staff + appointment combination. Prevents accidental double-entry.
	if (params.appointmentId) {
		const dupe = await tenantDb.query.commissionSplits.findFirst({
			where: and(
				eq(commissionSplits.staffId, params.staffId),
				eq(commissionSplits.appointmentId, params.appointmentId),
				eq(commissionSplits.splitType, "manual"),
				ne(commissionSplits.status, "void"),
			),
		});
		if (dupe) {
			throw Object.assign(
				new Error(
					`A manual adjustment for this staff member and appointment already exists (split ${dupe.id}). Void it first before creating another.`,
				),
				{ code: "CONFLICT" },
			);
		}
	}

	// High-value flag: amounts above the threshold enter "pending_review" so they
	// need explicit approval before appearing in payout calculations.
	const requiresReview =
		Math.abs(params.amountCents) >= MANUAL_REVIEW_THRESHOLD_CENTS;

	const [inserted] = await tenantDb
		.insert(commissionSplits)
		.values({
			appointmentId: params.appointmentId ?? null,
			salesOrderId: params.salesOrderId ?? null,
			packageInstanceId: params.packageInstanceId ?? null,
			staffId: params.staffId,
			splitPercentage: 0,
			calculatedAmount: params.amountCents,
			notes: params.note,
			status: requiresReview ? "pending_review" : "pending",
			splitType: "manual",
			manualNote: params.note,
			earnedAt: new Date(),
			createdByUserId: params.actor.userId,
		})
		.returning();

	await writeAudit(tenantDb, {
		actorUserId: params.actor.userId,
		actorMemberId: params.actor.memberId,
		actorRole: params.actor.role,
		action: "commission.manual_adjustment",
		entityType: "commission_split",
		entityId: inserted!.id,
		summary: `Manual commission adjustment for staff ${params.staffId}: ${params.amountCents} cents`,
		changes: {
			amountCents: params.amountCents,
			note: params.note,
			appointmentId: params.appointmentId ?? null,
			salesOrderId: params.salesOrderId ?? null,
			packageInstanceId: params.packageInstanceId ?? null,
		},
	});

	return inserted!;
}

// ---------------------------------------------------------------------------
// liabilityByStaff (Phase 1b §1.9)
// ---------------------------------------------------------------------------

export interface LiabilityByStaffRow {
	staffId: string;
	staffName: string; // best-effort from control-panel; falls back to staffId
	pendingCents: number;
	approvedCents: number;
	paidCents: number;
	/**
	 * roleType snapshot from commission_splits.role_type.
	 * NULL means "Delivery (legacy)" — row predates commission tracks (GAPS #22).
	 */
	roleType: string | null;
	/** trackId from commission_splits.track_id — null for legacy delivery rows. */
	trackId: string | null;
}

/**
 * Max staff rows returned by liabilityByStaff. Exposed so the procedure layer can
 * surface a `hasMore` flag instead of silently truncating (F-COM-07).
 */
export const LIABILITY_BY_STAFF_LIMIT = 500;

export interface LiabilityByStaffResult {
	rows: LiabilityByStaffRow[];
	/** Number of staff rows returned (≤ LIABILITY_BY_STAFF_LIMIT). */
	totalCount: number;
	/** True when more staff rows exist beyond the returned page (result was truncated). */
	hasMore: boolean;
}

export interface LiabilityByStaffParams {
	branchId?: string; // optional — filter to a specific branch
	from?: Date; // earnedAt range start (inclusive)
	to?: Date; // earnedAt range end (inclusive)
	/** Caller must pass context.accessibleNodeIds. Empty array = admin (no restriction). */
	accessibleNodeIds: string[];
	/** SQL-side filter: only include splits for this track (Phase 4). */
	trackId?: string;
	/**
	 * SQL-side filter: only include splits with this roleType (Phase 4, GAPS #22).
	 * Pass null or "delivery_legacy" to match legacy rows where roleType IS NULL.
	 */
	roleType?: string | null;
}

/**
 * Aggregate pending/approved/paid commission totals per staff member.
 * Single GROUP BY query — no per-staff loop. LIMIT 500.
 *
 * RBAC: scope by accessibleNodeIds via JOIN to appointments.branchId /
 * salesOrders.branchId. An empty accessibleNodeIds means the caller sees all
 * (admin). A non-empty list restricts to rows whose resolved branchId is in
 * the list — consistent with listCommissionLedger scoping.
 *
 * Uses indexes: commission_splits_staff_status_idx,
 *               commission_splits_staff_status_amount_idx.
 */
export async function liabilityByStaff(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: LiabilityByStaffParams,
): Promise<LiabilityByStaffResult> {
	// Fetch one extra row beyond the cap so we can detect (and report) truncation
	// without a second COUNT query. F-COM-07.
	const fetchLimit = LIABILITY_BY_STAFF_LIMIT + 1;
	const {
		branchId,
		from,
		to,
		accessibleNodeIds,
		trackId: filterTrackId,
		roleType: filterRoleType,
	} = params;

	// Build conditions on commissionSplits directly
	const conditions = [ne(commissionSplits.status, "void")];

	if (from) conditions.push(gte(commissionSplits.earnedAt, from));
	if (to) conditions.push(lte(commissionSplits.earnedAt, to));

	// SQL-side track / roleType filters (Phase 4, GAPS #22)
	if (filterTrackId) {
		conditions.push(eq(commissionSplits.trackId, filterTrackId));
	}
	if (filterRoleType !== undefined) {
		if (filterRoleType === null || filterRoleType === "delivery_legacy") {
			conditions.push(sql`${commissionSplits.roleType} IS NULL`);
		} else {
			conditions.push(eq(commissionSplits.roleType, filterRoleType));
		}
	}

	// When branchId or accessibleNodeIds scope is needed, resolve via JOIN.
	// Otherwise run the simpler no-join query.
	const needsBranchJoin =
		branchId !== undefined ||
		(accessibleNodeIds !== undefined && accessibleNodeIds.length > 0);

	// Each row now carries (staffId, roleType, trackId) in addition to the
	// status buckets so callers can segment/display by track or role.
	let rows: {
		staffId: string;
		roleType: string | null;
		trackId: string | null;
		pendingCents: number;
		approvedCents: number;
		paidCents: number;
	}[];

	if (needsBranchJoin) {
		// LEFT JOIN appointments + salesOrders to resolve the effective branchId
		const branchConditions = [...conditions];

		if (branchId) {
			branchConditions.push(
				or(
					eq(appointments.branchId, branchId),
					eq(salesOrders.branchId, branchId),
				)!,
			);
		}

		if (accessibleNodeIds.length > 0) {
			branchConditions.push(
				or(
					inArray(appointments.branchId, accessibleNodeIds),
					inArray(salesOrders.branchId, accessibleNodeIds),
				)!,
			);
		}

		rows = (await tenantDb
			.select({
				staffId: commissionSplits.staffId,
				roleType: sql<string | null>`${commissionSplits.roleType}`,
				trackId: sql<string | null>`${commissionSplits.trackId}`,
				pendingCents: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'pending'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				approvedCents: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				paidCents: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
			})
			.from(commissionSplits)
			.leftJoin(
				appointments,
				eq(commissionSplits.appointmentId, appointments.id),
			)
			.leftJoin(salesOrders, eq(commissionSplits.salesOrderId, salesOrders.id))
			.where(and(...branchConditions))
			.groupBy(
				commissionSplits.staffId,
				commissionSplits.roleType,
				commissionSplits.trackId,
			)
			.limit(fetchLimit)) as {
			staffId: string;
			roleType: string | null;
			trackId: string | null;
			pendingCents: number;
			approvedCents: number;
			paidCents: number;
		}[];
	} else {
		rows = (await tenantDb
			.select({
				staffId: commissionSplits.staffId,
				roleType: sql<string | null>`${commissionSplits.roleType}`,
				trackId: sql<string | null>`${commissionSplits.trackId}`,
				pendingCents: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'pending'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				approvedCents: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'approved'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
				paidCents: sql<number>`
					COALESCE(SUM(
						CASE WHEN ${commissionSplits.status} = 'paid'
						THEN ${commissionSplits.calculatedAmount} ELSE 0 END
					), 0)
				`.mapWith(Number),
			})
			.from(commissionSplits)
			.where(and(...conditions))
			.groupBy(
				commissionSplits.staffId,
				commissionSplits.roleType,
				commissionSplits.trackId,
			)
			.limit(fetchLimit)) as {
			staffId: string;
			roleType: string | null;
			trackId: string | null;
			pendingCents: number;
			approvedCents: number;
			paidCents: number;
		}[];
	}

	// Detect truncation: if we got the sentinel extra row, there are more staff
	// beyond the cap. Trim back to the documented limit before enriching/returning.
	const hasMore = rows.length > LIABILITY_BY_STAFF_LIMIT;
	if (hasMore) {
		rows = rows.slice(0, LIABILITY_BY_STAFF_LIMIT);
	}

	if (rows.length === 0) return { rows: [], totalCount: 0, hasMore: false };

	// Enrich names from control-panel (best-effort)
	const staffIds = [...new Set(rows.map((r) => r.staffId))];
	const staffNameMap = new Map<string, string>();
	try {
		const { user } = await import("@avantej-core/db/schema/auth");
		const { inArray: inArr } = await import("drizzle-orm");
		const users = await controlPanelDb
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(inArr(user.id, staffIds));
		for (const u of users) staffNameMap.set(u.id, u.name);
	} catch {
		// Best-effort — fall back to staffId as name
	}

	const enriched: LiabilityByStaffRow[] = rows.map((r) => ({
		staffId: r.staffId,
		staffName: staffNameMap.get(r.staffId) ?? r.staffId,
		pendingCents: r.pendingCents,
		approvedCents: r.approvedCents,
		paidCents: r.paidCents,
		// NULL roleType = Delivery (legacy) — GAPS #22 consistent treatment
		roleType: r.roleType ?? null,
		trackId: r.trackId ?? null,
	}));

	return { rows: enriched, totalCount: enriched.length, hasMore };
}

// ---------------------------------------------------------------------------
// Ledger query
// ---------------------------------------------------------------------------

export interface CommissionLedgerRow extends CommissionSplit {
	staffName: string | null; // enriched from control panel (best-effort)
	appointmentNumber: string | null; // appointment.id (no number field)
	salesOrderNumber: string | null; // sales_orders.salesOrderNumber
	branchId: string | null; // from appointment.branchId or salesOrders.branchId
	// trackId and roleType are already on CommissionSplit (from the schema), but
	// we document them here explicitly to make the Phase 4 contract clear.
	// roleType: string | null  — null = "Delivery (legacy)", GAPS #22
	// trackId: string | null   — null for pre-track rows
}

export interface CommissionLedgerResult {
	rows: CommissionLedgerRow[];
	total: number;
	totals: {
		pending: number; // sum of calculatedAmount for status=pending (cents)
		approved: number; // sum of calculatedAmount for status=approved (cents)
		paid: number; // sum of calculatedAmount for status=paid (cents)
	};
}

export interface ListCommissionLedgerParams {
	status?: "pending" | "approved" | "paid" | "void" | "all";
	staffId?: string;
	branchId?: string;
	from?: Date;
	to?: Date;
	accessibleNodeIds: string[];
	limit?: number;
	offset?: number;
	/** SQL-side filter: only include splits for this track (Phase 4). */
	trackId?: string;
	/**
	 * SQL-side filter: only include splits with this roleType (Phase 4, GAPS #22).
	 * Pass null or "delivery_legacy" to match legacy rows where roleType IS NULL.
	 */
	roleType?: string | null;
}

/**
 * List commission splits with enriched ledger data.
 *
 * RBAC scoping:
 * - Appointment-based splits: appointment.branchId must be in accessibleNodeIds.
 * - SalesOrder-based splits: salesOrder.branchId must be in accessibleNodeIds.
 * Returns the union of both sets.
 *
 * Staff names are enriched from control panel DB (best-effort; null on failure).
 */
export async function listCommissionLedger(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: ListCommissionLedgerParams,
): Promise<CommissionLedgerResult> {
	const {
		status,
		staffId,
		branchId,
		from,
		to,
		accessibleNodeIds,
		limit = 100,
		offset = 0,
		trackId: filterTrackId,
		roleType: filterRoleType,
	} = params;

	// Base filter conditions (status, staffId, date range)
	const baseConditions: ReturnType<typeof eq>[] = [];

	if (status && status !== "all") {
		baseConditions.push(eq(commissionSplits.status, status));
	}

	if (staffId) {
		baseConditions.push(eq(commissionSplits.staffId, staffId));
	}

	if (from) {
		baseConditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		baseConditions.push(lte(commissionSplits.createdAt, to));
	}

	// SQL-side track / roleType filters (Phase 4, GAPS #22 — never in-memory)
	if (filterTrackId) {
		baseConditions.push(eq(commissionSplits.trackId, filterTrackId));
	}
	if (filterRoleType !== undefined) {
		if (filterRoleType === null || filterRoleType === "delivery_legacy") {
			baseConditions.push(sql`${commissionSplits.roleType} IS NULL`);
		} else {
			baseConditions.push(eq(commissionSplits.roleType, filterRoleType));
		}
	}

	// RBAC + branchId branch conditions (pushed to SQL via LEFT JOINs)
	const branchConditions: ReturnType<typeof and>[] = [];

	if (accessibleNodeIds.length > 0) {
		branchConditions.push(
			or(
				inArray(appointments.branchId, accessibleNodeIds),
				inArray(salesOrders.branchId, accessibleNodeIds),
			)!,
		);
	}

	if (branchId) {
		branchConditions.push(
			or(
				eq(appointments.branchId, branchId),
				eq(salesOrders.branchId, branchId),
			)!,
		);
	}

	const allConditions = [...baseConditions, ...branchConditions];
	const whereClause =
		allConditions.length > 0 ? and(...allConditions) : undefined;

	// 1. Count total matching rows (for pagination metadata)
	const [countRow] = await tenantDb
		.select({
			count: sql<number>`COUNT(*)::int`.mapWith(Number),
		})
		.from(commissionSplits)
		.leftJoin(appointments, eq(commissionSplits.appointmentId, appointments.id))
		.leftJoin(salesOrders, eq(commissionSplits.salesOrderId, salesOrders.id))
		.where(whereClause);

	const total = countRow?.count ?? 0;

	// 2. Fetch paginated rows
	const paginated = await tenantDb
		.select({
			split: commissionSplits,
			appointmentId: appointments.id,
			appointmentBranchId: appointments.branchId,
			salesOrderId: salesOrders.id,
			salesOrderNumber: salesOrders.salesOrderNumber,
			salesOrderBranchId: salesOrders.branchId,
		})
		.from(commissionSplits)
		.leftJoin(appointments, eq(commissionSplits.appointmentId, appointments.id))
		.leftJoin(salesOrders, eq(commissionSplits.salesOrderId, salesOrders.id))
		.where(whereClause)
		.orderBy(desc(commissionSplits.createdAt))
		.limit(limit)
		.offset(offset);

	// Enrich staff names from control panel (best-effort)
	const distinctStaffIds = [...new Set(paginated.map((r) => r.split.staffId))];
	const staffNameMap = new Map<string, string>();

	if (distinctStaffIds.length > 0) {
		try {
			const { user } = await import("@avantej-core/db/schema/auth");
			const { inArray: inArr } = await import("drizzle-orm");
			const users = await controlPanelDb
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArr(user.id, distinctStaffIds));
			for (const u of users) {
				staffNameMap.set(u.id, u.name);
			}
		} catch {
			// Best-effort: if control panel is unavailable, names remain null
		}
	}

	// Build enriched rows
	const rows: CommissionLedgerRow[] = paginated.map((row) => ({
		...row.split,
		staffName: staffNameMap.get(row.split.staffId) ?? null,
		appointmentNumber: row.appointmentId ?? null,
		salesOrderNumber: row.salesOrderNumber ?? null,
		branchId: row.appointmentBranchId ?? row.salesOrderBranchId ?? null,
	}));

	// 3. Compute totals via SQL aggregation over the full filtered set (not just the current page)
	const [totalsRow] = await tenantDb
		.select({
			pending:
				sql<number>`COALESCE(SUM(CASE WHEN ${commissionSplits.status} = 'pending' THEN ${commissionSplits.calculatedAmount} ELSE 0 END), 0)::int`.mapWith(
					Number,
				),
			approved:
				sql<number>`COALESCE(SUM(CASE WHEN ${commissionSplits.status} = 'approved' THEN ${commissionSplits.calculatedAmount} ELSE 0 END), 0)::int`.mapWith(
					Number,
				),
			paid: sql<number>`COALESCE(SUM(CASE WHEN ${commissionSplits.status} = 'paid' THEN ${commissionSplits.calculatedAmount} ELSE 0 END), 0)::int`.mapWith(
				Number,
			),
		})
		.from(commissionSplits)
		.leftJoin(appointments, eq(commissionSplits.appointmentId, appointments.id))
		.leftJoin(salesOrders, eq(commissionSplits.salesOrderId, salesOrders.id))
		.where(whereClause);

	return {
		rows,
		total,
		totals: {
			pending: totalsRow?.pending ?? 0,
			approved: totalsRow?.approved ?? 0,
			paid: totalsRow?.paid ?? 0,
		},
	};
}

// ---------------------------------------------------------------------------
// Phase 4 — Commission Liability CSV export (backend service)
// ---------------------------------------------------------------------------

export interface ExportLiabilityCsvParams {
	from: string; // ISO datetime
	to: string; // ISO datetime
	hierarchyNodeId?: string;
	categoryId?: string;
	trackId?: string;
	roleType?: string | null;
}

export interface ExportLiabilityCsvResult {
	csv: string;
	rowCount: number; // number of trainer data rows (not counting header/totals)
}

/**
 * Build a commission-liability CSV from the liabilitySummary result.
 *
 * Column layout (Phase 4):
 *   Staff Member, Role, Track ID, Approved Unpaid (RM), Paid (RM), Manual Adj (RM), Net Payable (RM)
 *
 * - "Role" replaces the old hard-coded "Trainer" value — uses the trainer's
 *   dominant roleType from byRoleType (highest approvedUnpaid contribution).
 *   NULL roleType renders as "Delivery (legacy)" (GAPS #22).
 * - "Track ID" is the trackId filter when a single track is requested;
 *   "All" when no filter applied (multiple tracks may be included per trainer).
 * - Amounts are formatted as decimal RM with 2 decimal places (consistent with
 *   the existing frontend CSV export format).
 * - Last row is a TOTALS row (matches frontend convention for e2e spec compatibility).
 * - Returns empty CSV (header only) when no trainer rows exist.
 */
export async function exportLiabilityCsv(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: ExportLiabilityCsvParams,
): Promise<ExportLiabilityCsvResult> {
	const summary = await liabilitySummary(tenantDb, controlPanelDb, params);

	function centsToRmStr(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	function csvCell(value: string): string {
		return `"${value.replace(/"/g, '""')}"`;
	}

	const header = [
		"Staff Member",
		"Role",
		"Track ID",
		"Approved Unpaid (RM)",
		"Paid (RM)",
		"Manual Adj (RM)",
		"Net Payable (RM)",
	]
		.map(csvCell)
		.join(",");

	const trackIdLabel = params.trackId ?? "All";

	const dataRows = summary.trainers.map((t) => {
		// Determine dominant roleType from byRoleType breakdown.
		// The "dominant" role is the one contributing most to approvedUnpaid.
		// If no roleType data, fall back to "Delivery (legacy)".
		let dominantRole = "Delivery (legacy)";
		if (Object.keys(t.byRoleType).length > 0) {
			const topRole = Object.entries(t.byRoleType).sort(
				(a, b) => b[1] - a[1],
			)[0];
			if (topRole) {
				dominantRole =
					topRole[0] === "delivery_legacy" ? "Delivery (legacy)" : topRole[0];
			}
		}

		return [
			csvCell(t.name),
			csvCell(dominantRole),
			csvCell(trackIdLabel),
			csvCell(centsToRmStr(t.approvedUnpaidCents)),
			csvCell(centsToRmStr(t.paidCents)),
			csvCell(centsToRmStr(t.manualAdjustmentCents)),
			csvCell(centsToRmStr(t.netPayableCents)),
		].join(",");
	});

	const totalsRow = [
		csvCell("TOTALS"),
		csvCell(""),
		csvCell(trackIdLabel),
		csvCell(centsToRmStr(summary.totals.approvedUnpaidCents)),
		csvCell(centsToRmStr(summary.totals.paidCents)),
		csvCell(centsToRmStr(summary.totals.manualAdjustmentCents)),
		csvCell(centsToRmStr(summary.totals.netPayableCents)),
	].join(",");

	const allLines: string[] = [header, ...dataRows];
	if (summary.trainers.length > 0) {
		allLines.push(totalsRow);
	}

	return {
		csv: allLines.join("\n"),
		rowCount: dataRows.length,
	};
}

// ---------------------------------------------------------------------------
// Agent 2.5 — Commission audit helpers (J5)
// ---------------------------------------------------------------------------

/**
 * Resolve the latest `category_commission_config_versions.id` for a given
 * categoryId. Returns null if no version row exists yet (i.e. the config has
 * never been saved since the trigger was installed).
 *
 * Callers should pass the returned id to createCommissionSplit so the split
 * is anchored to the immutable snapshot of the config that was live at split
 * creation time. Disputes mid-cycle can then be reproduced from the frozen
 * version + the per-split snapshot fields already stored on commissionSplits
 * (weightageBasisPoints, baseAmountCents, conditionId, trainerTierId,
 * slotIndex).
 */
export async function getLatestConfigVersionForCategory(
	tenantDb: TenantDb,
	categoryId: string,
): Promise<string | null> {
	const [row] = await tenantDb
		.select({ id: categoryCommissionConfigVersions.id })
		.from(categoryCommissionConfigVersions)
		.where(eq(categoryCommissionConfigVersions.categoryId, categoryId))
		.orderBy(desc(categoryCommissionConfigVersions.versionNumber))
		.limit(1);
	return row?.id ?? null;
}

export interface GetOrCreatePayoutBatchParams {
	branchId: string | null;
	periodStart: Date;
	periodEnd: Date;
	createdBy: string; // members.userId
}

/**
 * Idempotent payout batch resolver. Returns an existing batch matching
 * (branchId, periodStart, periodEnd) if one is already pending or
 * processing; otherwise creates a new pending batch.
 */
export async function getOrCreatePayoutBatch(
	tenantDb: TenantDb,
	params: GetOrCreatePayoutBatchParams,
): Promise<typeof payoutBatches.$inferSelect> {
	const { branchId, periodStart, periodEnd, createdBy } = params;

	const branchCondition = branchId
		? eq(payoutBatches.branchId, branchId)
		: sql`${payoutBatches.branchId} IS NULL`;

	const [existing] = await tenantDb
		.select()
		.from(payoutBatches)
		.where(
			and(
				branchCondition,
				eq(payoutBatches.periodStart, periodStart),
				eq(payoutBatches.periodEnd, periodEnd),
				inArray(payoutBatches.status, ["pending", "processing"]),
			),
		)
		.limit(1);

	if (existing) return existing;

	const [created] = await tenantDb
		.insert(payoutBatches)
		.values({
			branchId,
			periodStart,
			periodEnd,
			createdBy,
			status: "pending",
			totalCents: 0,
		})
		.returning();

	if (!created) {
		throw new Error("getOrCreatePayoutBatch: insert returned no row");
	}
	return created;
}

/**
 * Wire one or more payouts to a payout batch. Idempotent: payouts already
 * linked to the batch are silently re-set (no-op).
 */
export async function attachPayoutsToBatch(
	tenantDb: TenantDb,
	payoutIds: string[],
	batchId: string,
): Promise<{ updatedCount: number }> {
	if (payoutIds.length === 0) return { updatedCount: 0 };
	const updated = await tenantDb
		.update(payouts)
		.set({ batchId, updatedAt: new Date() })
		.where(inArray(payouts.id, payoutIds))
		.returning({ id: payouts.id });
	return { updatedCount: updated.length };
}

// ---------------------------------------------------------------------------
// Agent 2.9 — Refund → commission reversal chain (J5)
// ---------------------------------------------------------------------------

export interface ReverseForRefundParams {
	reason: string;
	initiatedBy: string; // members.userId
	actor?: { userId: string; memberId: string; role: string };
}

export interface ReverseForRefundResult {
	reversalIds: string[];
}

/**
 * Reverse commission splits tied to a refund.
 *
 * Strategy:
 *   1. Resolve the set of commission_splits linked to the refund's targets:
 *      - refund.salesOrderId          → splits with salesOrderId (delivery + origination)
 *      - refund.packageInstanceId     → splits with packageInstanceId
 *      - refund_items.salesOrderItemId → resolve to splits via the item's salesOrderId
 *      - refund_items.packageInstanceId (partial) → splits with that packageInstanceId
 *   2. For each candidate split, compute the reversal amount:
 *      - Full refund (amount >= total / refund has no items): -split.calculatedAmount
 *      - Partial refund (creditsRefunded < creditsTotal): pro-rate by
 *        creditsRefunded / creditsTotal of the package instance, capped at split amount
 *      - F-COM-C / GAPS #6 / #16: Partial sales-order refund — pro-rate by
 *        refundedAmountCents / sales_orders.totalAmount, applied uniformly to EVERY
 *        candidate split on the order (delivery + origination both clawed back
 *        proportionally). ratio==1 → full clawback.
 *   3. Skip splits already fully reversed (sum of prior reversals == -split.calculatedAmount).
 *      Subsequent reversals against the same split (e.g. multi-step refunds) are allowed
 *      up to the unreversed remainder.
 *   4. Insert commission_split_reversals rows in the same transaction. The self-FK is
 *      DEFERRABLE so reversal-of-reversal chains can be inserted in any order.
 *   5. Caller (refunds.service) wraps this in its own tx; we accept either tenantDb or tx.
 *
 * GAPS #6/#16 (Phase 3): origination splits on the same salesOrderId are included in the
 * candidate set and receive proportional reversals via the existing salesOrderPartialRatios
 * mechanism — no separate origination-specific code path needed. The track_id on each split
 * provides per-track isolation already.
 *
 * Performance: the salesOrderId split fetch is paginated (BATCH_SIZE=500) to avoid
 * unbounded IN() queries as stacked tracks (delivery + origination) grow the split count.
 *
 * Returns the list of inserted reversal IDs. No payout adjustment row is created here —
 * the next payout batch run picks up unsettled reversals via payout_adjustment_id IS NULL.
 */
export async function reverseForRefund(
	db: TenantDb | TenantTx,
	refundId: string,
	params: ReverseForRefundParams,
): Promise<ReverseForRefundResult> {
	const tdb = db as TenantDb;

	// 1. Load the refund + its items
	const refund = await tdb.query.refunds.findFirst({
		where: (r, { eq: eqFn }) => eqFn(r.id, refundId),
	});
	if (!refund) {
		throw new ORPCError("NOT_FOUND", {
			message: `reverseForRefund: refund ${refundId} not found`,
		});
	}

	const items = await tdb
		.select()
		.from(refundItems)
		.where(eq(refundItems.refundId, refundId));

	// 2. Build the candidate split set
	const candidateSplits = new Map<
		string,
		typeof commissionSplits.$inferSelect
	>();

	const addSplits = (rows: (typeof commissionSplits.$inferSelect)[]) => {
		for (const row of rows) {
			// Skip already-void splits — nothing to reverse
			if (row.status === "void") continue;
			candidateSplits.set(row.id, row);
		}
	};

	// F-COM-C: resolve item IDs first so we can decide whether the salesOrder
	// refund is full-order or line-level BEFORE executing the wide fetch.
	const itemSalesOrderItemIds = items
		.map((i) => i.salesOrderItemId)
		.filter((id): id is string => id !== null);
	const itemPackageInstanceIds = items
		.map((i) => i.packageInstanceId)
		.filter((id): id is string => id !== null);

	// GAPS #6/#16 / F-COM-C: batch/paginate split fetches to prevent unbounded IN()
	// queries as stacked tracks (delivery + origination) grow the split count per order.
	const SPLIT_FETCH_BATCH = 500;

	/**
	 * Paginated fetch of all commission_splits for a given salesOrderId.
	 * Ordered by id (uuid, stable) so batches are deterministic.
	 * Includes ALL tracks (delivery + origination) — proportional reversal is
	 * applied uniformly to each by the salesOrderPartialRatios mechanism below.
	 */
	async function fetchSplitsForOrderPaginated(orderId: string): Promise<void> {
		let lastId: string | null = null;
		while (true) {
			const batch = await tdb
				.select()
				.from(commissionSplits)
				.where(
					and(
						eq(commissionSplits.salesOrderId, orderId),
						...(lastId ? [gt(commissionSplits.id, lastId)] : []),
					),
				)
				.orderBy(asc(commissionSplits.id))
				.limit(SPLIT_FETCH_BATCH);
			addSplits(batch);
			if (batch.length < SPLIT_FETCH_BATCH) break;
			const last = batch[batch.length - 1];
			lastId = last?.id ?? null;
			if (!lastId) break;
		}
	}

	if (refund.salesOrderId) {
		if (itemSalesOrderItemIds.length > 0) {
			// F-COM-C: Line-level refund — scope to splits whose source order covers
			// the specific refunded sales_order_items. commission_splits does not store
			// salesOrderItemId directly, so we scope to the parent orderIds.
			const soiRows = await tdb
				.select({
					id: salesOrderItems.id,
					salesOrderId: salesOrderItems.salesOrderId,
				})
				.from(salesOrderItems)
				.where(inArray(salesOrderItems.id, itemSalesOrderItemIds));
			const orderIds = [...new Set(soiRows.map((r) => r.salesOrderId))];
			// Fetch splits for each affected order using paginated helper (GAPS #16 fix).
			// Includes both delivery and origination tracks — reversal ratio applied uniformly.
			for (const orderId of orderIds) {
				await fetchSplitsForOrderPaginated(orderId);
			}
		} else {
			// Full-order refund (no specific items) — paginated fetch for the order.
			await fetchSplitsForOrderPaginated(refund.salesOrderId);
		}
	}

	if (refund.packageInstanceId) {
		const rows = await tdb
			.select()
			.from(commissionSplits)
			.where(eq(commissionSplits.packageInstanceId, refund.packageInstanceId));
		addSplits(rows);
	}

	// Package-instance items (partial credits refund) — handled below in partialRatios.
	// salesOrderItem path is now handled inside the refund.salesOrderId block above.

	if (itemPackageInstanceIds.length > 0) {
		const rows = await tdb
			.select()
			.from(commissionSplits)
			.where(
				inArray(commissionSplits.packageInstanceId, itemPackageInstanceIds),
			);
		addSplits(rows);
	}

	if (candidateSplits.size === 0) {
		return { reversalIds: [] };
	}

	// 3. Find the set of credits-refunded info for partial pro-rating.
	// For each refund_item with creditsRefunded > 0, look up the package instance to
	// derive the proration ratio. Multi-item refunds aggregate per packageInstanceId.
	const partialRatios = new Map<string, number>(); // packageInstanceId → 0..1
	for (const item of items) {
		if (
			item.packageInstanceId &&
			item.creditsRefunded !== null &&
			item.creditsRefunded > 0
		) {
			// Need creditsTotal for the instance — best-effort via packageInstances query
			const inst = await tdb.query.packageInstances.findFirst({
				where: (pi, { eq: eqFn }) =>
					eqFn(pi.id, item.packageInstanceId as string),
			});
			const creditsTotal = inst?.creditsTotal ?? 0;
			if (creditsTotal > 0) {
				const ratio = Math.min(1, item.creditsRefunded / creditsTotal);
				const prev = partialRatios.get(item.packageInstanceId) ?? 0;
				partialRatios.set(item.packageInstanceId, Math.min(1, prev + ratio));
			}
		}
	}

	// F-COM-C: pro-rate sales-order split reversals.
	//
	// commission_splits has no salesOrderItemId column, so when a refund only
	// touches some lines of a multi-line order we cannot reverse splits per-line.
	// Instead, build a per-order ratio = SUM(refund_items.amountCents for items
	// belonging to that order) / sales_orders.totalAmount, capped at 1. That ratio
	// is then applied uniformly to every candidate split on the order.
	//
	// Behaviour by refund shape:
	//   - Full-order refund (refund.salesOrderId set, no refund_items with
	//     salesOrderItemId): ratio = refund.amountCents / order.totalAmount → 1
	//     for a full-amount refund, falling through to the existing full-clawback
	//     path when ratio==1.
	//   - Line-level refund (refund_items carry salesOrderItemId): ratio = SUM of
	//     those items' amountCents / order.totalAmount. Strictly < 1 for a partial
	//     refund of a multi-line order.
	//
	// NOTE: if/when commission_splits gains a salesOrderItemId FK, replace this
	// with strict per-line scoping (reverse only the splits whose source line is
	// in the refund items).
	const salesOrderPartialRatios = new Map<string, number>(); // salesOrderId → 0..1
	// Resolve refund_items → salesOrderId so we can attribute line refund amounts
	// to their parent order. amountByOrder accumulates refunded cents per order.
	const amountByOrder = new Map<string, number>();
	if (itemSalesOrderItemIds.length > 0) {
		const soiRows = await tdb
			.select({
				id: salesOrderItems.id,
				salesOrderId: salesOrderItems.salesOrderId,
			})
			.from(salesOrderItems)
			.where(inArray(salesOrderItems.id, itemSalesOrderItemIds));
		const soiToOrder = new Map<string, string>(
			soiRows.map((r) => [r.id, r.salesOrderId]),
		);
		for (const item of items) {
			if (!item.salesOrderItemId) continue;
			const orderId = soiToOrder.get(item.salesOrderItemId);
			if (!orderId) continue;
			amountByOrder.set(
				orderId,
				(amountByOrder.get(orderId) ?? 0) + (item.amountCents ?? 0),
			);
		}
	}
	// Always include refund.salesOrderId (full-order refund path with no items)
	if (refund.salesOrderId && !amountByOrder.has(refund.salesOrderId)) {
		amountByOrder.set(refund.salesOrderId, refund.amountCents);
	}
	if (amountByOrder.size > 0) {
		const orderRows = await tdb
			.select({ id: salesOrders.id, totalAmount: salesOrders.totalAmount })
			.from(salesOrders)
			.where(inArray(salesOrders.id, [...amountByOrder.keys()]));
		for (const o of orderRows) {
			const refunded = amountByOrder.get(o.id) ?? 0;
			const total = o.totalAmount ?? 0;
			// F-COM-C: pro-rate sales-order split reversals
			const ratio = total > 0 ? Math.min(1, refunded / total) : 1;
			salesOrderPartialRatios.set(o.id, ratio);
		}
	}

	// 4. Sum prior reversals per split to compute the unreversed remainder
	const splitIds = [...candidateSplits.keys()];
	const priorRows = await tdb
		.select({
			splitId: commissionSplitReversals.reversedSplitId,
			total:
				sql<number>`COALESCE(SUM(${commissionSplitReversals.amountCents}), 0)`.mapWith(
					Number,
				),
		})
		.from(commissionSplitReversals)
		.where(inArray(commissionSplitReversals.reversedSplitId, splitIds))
		.groupBy(commissionSplitReversals.reversedSplitId);
	const priorReversedBySplit = new Map<string, number>();
	for (const r of priorRows) {
		priorReversedBySplit.set(r.splitId, r.total ?? 0);
	}

	// 5. Build reversal rows
	type InsertRow = typeof commissionSplitReversals.$inferInsert;
	const toInsert: InsertRow[] = [];
	for (const split of candidateSplits.values()) {
		const priorReversed = priorReversedBySplit.get(split.id) ?? 0;
		// priorReversed is negative (clawback); the unreversed positive amount remaining is:
		const unreversed = split.calculatedAmount + priorReversed;
		if (unreversed <= 0) continue;

		// Determine reversal amount
		let reversalCents: number;
		if (split.packageInstanceId && partialRatios.has(split.packageInstanceId)) {
			// Package-instance partial: pro-rate by credits refunded / credits total
			const ratio = partialRatios.get(split.packageInstanceId) ?? 1;
			reversalCents = -Math.min(
				unreversed,
				Math.round(split.calculatedAmount * ratio),
			);
		} else if (
			split.salesOrderId &&
			salesOrderPartialRatios.has(split.salesOrderId)
		) {
			// F-COM-C: Sales-order partial: pro-rate by refund amount / order total.
			// Ratio=1.0 for full refunds → identical to the old full-reversal path.
			const ratio = salesOrderPartialRatios.get(split.salesOrderId) ?? 1;
			reversalCents = -Math.min(
				unreversed,
				Math.round(split.calculatedAmount * ratio),
			);
		} else {
			// Full reversal (appointment-linked or unresolvable order)
			reversalCents = -unreversed;
		}

		if (reversalCents === 0) continue;

		toInsert.push({
			reversedSplitId: split.id,
			refundId,
			amountCents: reversalCents,
			reason: params.reason,
			createdBy: params.initiatedBy,
		});
	}

	if (toInsert.length === 0) {
		return { reversalIds: [] };
	}

	const inserted = await tdb
		.insert(commissionSplitReversals)
		.values(toInsert)
		.returning({ id: commissionSplitReversals.id });

	// Audit (best-effort — only if actor is provided)
	if (params.actor) {
		for (const row of inserted) {
			await writeAudit(tdb, {
				actorUserId: params.actor.userId,
				actorMemberId: params.actor.memberId,
				actorRole: params.actor.role,
				action: "commission.reverse",
				entityType: "commission_split_reversal",
				entityId: row.id,
				summary: `Commission reversal created for refund ${refundId}: ${params.reason}`,
				changes: { refundId, reason: params.reason },
			});
		}
	}

	return { reversalIds: inserted.map((r) => r.id) };
}

// ---------------------------------------------------------------------------
// listPendingReview (Flaw #13)
// ---------------------------------------------------------------------------

export interface ListPendingReviewParams {
	accessibleNodeIds: string[];
	limit: number;
	cursor?: { earnedAt: string; id: string };
	/** Optional SQL-side filter by commission track id. */
	trackId?: string | null;
	/** Optional SQL-side filter by role type. */
	roleType?: string | null;
}

export interface PendingReviewRow {
	id: string;
	staffId: string;
	staffName: string;
	amountCents: number;
	note: string | null;
	appointmentId: string | null;
	salesOrderId: string | null;
	createdAt: string;
	createdByUserId: string | null;
	createdByName: string;
	earnedAt: string;
	/** NULL means "Delivery (legacy)" — originated before commission tracks. */
	roleType: string | null;
	trackId: string | null;
}

export interface ListPendingReviewResult {
	rows: PendingReviewRow[];
	total: number;
	nextCursor: { earnedAt: string; id: string } | null;
}

export async function listPendingReview(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: ListPendingReviewParams,
): Promise<ListPendingReviewResult> {
	// Scope filter — mirror listCommissionLedger pattern.
	// Splits with no appointmentId and no salesOrderId (pure manual) are always visible.
	const scopeCondition =
		params.accessibleNodeIds.length > 0
			? or(
					sql`${commissionSplits.appointmentId} IS NULL AND ${commissionSplits.salesOrderId} IS NULL`,
					inArray(
						sql`(SELECT branch_id FROM appointments WHERE id = ${commissionSplits.appointmentId})::uuid`,
						params.accessibleNodeIds,
					),
					inArray(
						sql`(SELECT branch_id FROM sales_orders WHERE id = ${commissionSplits.salesOrderId})::uuid`,
						params.accessibleNodeIds,
					),
				)
			: sql`true`;

	// Optional SQL-side filters (Task #26)
	const trackCondition = params.trackId
		? eq(commissionSplits.trackId, params.trackId)
		: sql`true`;
	const roleCondition = params.roleType
		? eq(commissionSplits.roleType, params.roleType)
		: sql`true`;

	// COUNT query for badge
	const [countRow] = await tenantDb
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(commissionSplits)
		.where(
			and(
				eq(commissionSplits.status, "pending_review"),
				scopeCondition,
				trackCondition,
				roleCondition,
			),
		);
	const total = countRow?.count ?? 0;

	// Row query with cursor
	const cursorCondition = params.cursor
		? sql`(${commissionSplits.earnedAt}, ${commissionSplits.id}) < (${params.cursor.earnedAt}::timestamptz, ${params.cursor.id}::uuid)`
		: sql`true`;

	const rows = await tenantDb
		.select()
		.from(commissionSplits)
		.where(
			and(
				eq(commissionSplits.status, "pending_review"),
				scopeCondition,
				trackCondition,
				roleCondition,
				cursorCondition,
			),
		)
		.orderBy(desc(commissionSplits.earnedAt), desc(commissionSplits.id))
		.limit(params.limit);

	// Batch display-name lookup from control-panel DB — mirror liabilityByStaff pattern
	const userIds = [
		...new Set([
			...rows.map((r) => r.staffId),
			...rows
				.map((r) => r.createdByUserId)
				.filter((id): id is string => id != null),
		]),
	];

	const nameMap = new Map<string, string>();
	if (userIds.length > 0) {
		try {
			const { user } = await import("@avantej-core/db/schema/auth");
			const { inArray: inArr } = await import("drizzle-orm");
			const users = await controlPanelDb
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArr(user.id, userIds));
			for (const u of users) {
				nameMap.set(u.id, u.name);
			}
		} catch {
			// Best-effort — fall back to IDs as names
		}
	}

	const resultRows: PendingReviewRow[] = rows.map((r) => ({
		id: r.id,
		staffId: r.staffId,
		staffName: nameMap.get(r.staffId) ?? r.staffId,
		amountCents: r.calculatedAmount,
		note: r.notes,
		appointmentId: r.appointmentId ?? null,
		salesOrderId: r.salesOrderId ?? null,
		createdAt: r.createdAt.toISOString(),
		createdByUserId: r.createdByUserId ?? null,
		createdByName: r.createdByUserId
			? (nameMap.get(r.createdByUserId) ?? "(unknown)")
			: "(unknown)",
		earnedAt: r.earnedAt.toISOString(),
		roleType: r.roleType ?? null,
		trackId: r.trackId ?? null,
	}));

	const lastRow = rows[rows.length - 1];
	const nextCursor =
		rows.length < params.limit || !lastRow
			? null
			: { earnedAt: lastRow.earnedAt.toISOString(), id: lastRow.id };

	return { rows: resultRows, total, nextCursor };
}

// ---------------------------------------------------------------------------
// resolvePendingReview (Flaw #13)
// ---------------------------------------------------------------------------

export async function resolvePendingReview(
	tenantDb: TenantDb,
	id: string,
	action: "approve" | "reject",
	reason: string | null,
	actor: {
		userId: string;
		memberId: string;
		role: string;
		accessibleNodeIds: string[];
	},
): Promise<CommissionSplit> {
	return tenantDb.transaction(async (tx) => {
		// 1. Lock the row
		const [split] = await tx
			.select()
			.from(commissionSplits)
			.where(eq(commissionSplits.id, id))
			.for("update");

		if (!split) {
			throw new ORPCError("NOT_FOUND", {
				message: "Commission split not found",
			});
		}

		// 2. Scope check — verify the earner's branch is within actor's accessible nodes
		if (actor.accessibleNodeIds.length > 0) {
			// Look up earner's hierarchyScopeId via members table
			const [earnerMember] = await tx
				.select({ hierarchyScopeId: members.hierarchyScopeId })
				.from(members)
				.where(eq(members.userId, split.staffId))
				.limit(1);

			if (
				earnerMember?.hierarchyScopeId &&
				!actor.accessibleNodeIds.includes(earnerMember.hierarchyScopeId)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "You do not have access to this commission split",
					data: { code: "OUT_OF_SCOPE" },
				});
			}
		}

		// 3. Verify status
		if (split.status !== "pending_review") {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cannot resolve: split status is '${split.status}', expected 'pending_review'`,
				data: { code: "NOT_REVIEWABLE" },
			});
		}

		const now = new Date();

		if (action === "approve") {
			// 4. Promote to pending (do NOT overwrite notes — preserve original adjustment note)
			const [updated] = await tx
				.update(commissionSplits)
				.set({ status: "pending", updatedAt: now })
				.where(eq(commissionSplits.id, id))
				.returning();

			// 5. Audit
			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "commission.review_approved",
				entityType: "commission_split",
				entityId: id,
				summary: `Manual adjustment approved for staff ${split.staffId} — ${split.calculatedAmount} cents`,
				changes: {
					previousStatus: "pending_review",
					newStatus: "pending",
					reason: reason ?? null,
				},
			});

			return updated!;
		} else {
			// 4. Void (do NOT overwrite notes — preserve original adjustment note)
			const [updated] = await tx
				.update(commissionSplits)
				.set({ status: "void", updatedAt: now })
				.where(eq(commissionSplits.id, id))
				.returning();

			// 5. Void audit (matches what voidCommissionSplit writes for consistency)
			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "commission.void",
				entityType: "commission_split",
				entityId: id,
				summary: `Commission split voided during review for staff ${split.staffId}`,
				changes: {
					previousStatus: "pending_review",
					newStatus: "void",
					reason,
				},
			});

			// 6. Review-rejected audit (second row distinguishes this void from a generic admin void)
			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "commission.review_rejected",
				entityType: "commission_split",
				entityId: id,
				summary: `Manual adjustment rejected for staff ${split.staffId} — reason: ${reason}`,
				changes: { reason },
			});

			return updated!;
		}
	});
}
