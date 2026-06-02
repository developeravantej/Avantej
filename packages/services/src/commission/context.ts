/**
 * Commission Pipeline — Stage 1: Gather
 *
 * `loadCommissionContext` performs ALL database reads required before the pure
 * planning stage. Corresponds to Steps 1–3 + pre-steps A/B3 of the original
 * _buildSplits, plus the latestConfigVersion fetch (F-COM-B fix).
 *
 * Returns `CommissionContext | null`. Null means "no commission should fire"
 * (service has no category, category has no active config/track, conditional
 * config has no matching condition for this input). The caller must treat null
 * as a clean early-exit producing [].
 *
 * ## Track vs Config path (Task #16)
 *
 * The preferred path reads from the NEW delivery track tables:
 *   commission_tracks (roleType='trainer', trigger='on_completion')
 *   commission_track_rates (keyed by tierId)
 *   commission_coach_slots (by track_id)
 *   commission_track_versions (latest version for provenance)
 *
 * Fallback: if no delivery track exists for the category (un-backfilled tenant),
 * we fall back to the legacy categoryCommissionConfigs path so no tenant is
 * broken during a rolling rollout. The fallback logs a warning.
 *
 * The `CommissionContext` shape is extended with:
 *   resolvedTrackId       — uuid of the delivery track (null on fallback)
 *   resolvedTrackVersionId — uuid of the latest track version (null on fallback)
 * These are consumed by persist.ts (Task #17) to stamp provenance on splits.
 */

import { eq, and, asc, inArray, desc, sql } from "drizzle-orm";
import { services } from "@avantej-core/db/schema/tenant/services";
import { categoryCommissionConfigs } from "@avantej-core/db/schema/tenant/category-commission-configs";
import { categoryCommissionConfigVersions } from "@avantej-core/db/schema/tenant/category-commission-config-versions";
import { commissionCoachSlots } from "@avantej-core/db/schema/tenant/commission-coach-slots";
import { commissionTierRates } from "@avantej-core/db/schema/tenant/commission-tier-rates";
import { commissionConditions } from "@avantej-core/db/schema/tenant/commission-conditions";
import { commissionConditionRates } from "@avantej-core/db/schema/tenant/commission-condition-rates";
import { commissionTracks } from "@avantej-core/db/schema/tenant/commission-tracks";
import { commissionTrackRates } from "@avantej-core/db/schema/tenant/commission-track-rates";
import { commissionTrackVersions } from "@avantej-core/db/schema/tenant/commission-track-versions";
import { members } from "@avantej-core/db/schema/tenant/members";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface MemberSnapshot {
	userId: string;
	role: string;
	trainerTierId: string | null;
}

export interface RateTable {
	isConditional: false;
	tierRates: { trainerTierId: string; amount: number }[];
	conditionRates?: never;
	matchedConditionId?: never;
}

export interface ConditionalRateTable {
	isConditional: true;
	tierRates?: never;
	conditionRates: {
		trainerTierId: string;
		amount: number;
		conditionId: string;
	}[];
	matchedConditionId: string;
}

export interface CommissionContext {
	/** The resolved active config for this category. */
	config: typeof categoryCommissionConfigs.$inferSelect;
	/** Rate table — either non-conditional (tierRates) or conditional (conditionRates + matchedConditionId). */
	rateTable: RateTable | ConditionalRateTable;
	/** All configured coach slots for this config (needed for redistribution). */
	allSlots: { slotIndex: number; weightageBasisPoints: number }[];
	/**
	 * Pre-fetched member snapshots keyed by userId.
	 * Populated only when `requireTrainerRole=true` (appointment path).
	 * Empty map for POS path — members are fetched per-staff in persist.
	 */
	memberByUserId: Map<string, MemberSnapshot>;
	/**
	 * Latest config version ID for this category (F-COM-B fix).
	 * May be undefined for tenants that haven't run the trigger-creating migration.
	 */
	resolvedConfigVersionId: string | undefined;
	/**
	 * Task #17 provenance — delivery track ID (null when falling back to legacy config path).
	 */
	resolvedTrackId: string | null;
	/**
	 * Task #17 provenance — latest track version ID (null when falling back to legacy config path).
	 */
	resolvedTrackVersionId: string | null;
}

// ---------------------------------------------------------------------------
// Load context
// ---------------------------------------------------------------------------

export interface LoadCommissionContextInput {
	serviceId: string;
	/**
	 * matchMode:
	 *   "operator" — appointment path; condition matched by attendeeCount vs operator/threshold.
	 *   "threshold" — POS path; condition matched by quantity >= minQuantity descending.
	 */
	matchMode: "operator" | "threshold";
	/** Used for condition matching when matchMode="operator". */
	matchValue?: number;
	/** Used for condition matching when matchMode="threshold". */
	quantity?: number;
	/** When true, pre-fetches member roles/tiers for the provided staffIds. */
	requireTrainerRole: boolean;
	/** Staff IDs to pre-fetch when requireTrainerRole=true. */
	staffIds?: string[];
	/** Source reference for logging (appointmentId or salesOrderId). */
	sourceRef?: string;
}

export async function loadCommissionContext(
	db: TenantDb | TenantTx,
	input: LoadCommissionContextInput,
): Promise<CommissionContext | null> {
	const tdb = db as TenantDb;

	// Step 1: service → categoryId
	const [service] = await tdb
		.select({ categoryId: services.categoryId })
		.from(services)
		.where(eq(services.id, input.serviceId))
		.limit(1);

	if (!service?.categoryId) {
		return null;
	}

	// Step 2: attempt to resolve the DELIVERY TRACK for this category.
	// The delivery track is: roleType='trainer', trigger='on_completion'.
	// Migration 0083 backfills one such row per categoryCommissionConfigs row.
	const [deliveryTrack] = await tdb
		.select()
		.from(commissionTracks)
		.where(
			and(
				eq(commissionTracks.categoryId, service.categoryId),
				eq(commissionTracks.roleType, "trainer"),
				eq(commissionTracks.trigger, "on_completion"),
				eq(commissionTracks.isActive, true),
			),
		)
		.limit(1);

	if (deliveryTrack) {
		// -----------------------------------------------------------------------
		// TRACK PATH (preferred): read rates, slots, version from track tables
		// -----------------------------------------------------------------------
		return _loadFromTrack(tdb, deliveryTrack, input);
	}

	// -------------------------------------------------------------------------
	// FALLBACK: no delivery track — fall back to legacy config path.
	// This handles un-backfilled tenants during rolling rollout.
	// -------------------------------------------------------------------------
	console.warn(
		JSON.stringify({
			event: "commission_track_not_found_fallback_to_config",
			categoryId: service.categoryId,
			sourceRef: input.sourceRef,
		}),
	);
	return _loadFromConfig(tdb, service.categoryId, input);
}

// ---------------------------------------------------------------------------
// Track path implementation (Task #16)
// ---------------------------------------------------------------------------

async function _loadFromTrack(
	tdb: TenantDb,
	track: typeof commissionTracks.$inferSelect,
	input: LoadCommissionContextInput,
): Promise<CommissionContext | null> {
	// We need to bridge to the legacy config shape for plan.ts which uses
	// `config.id` (for skip-reason logging), `config.paymentType`, and
	// `config.isConditional`. We resolve the backing config to get those fields.
	// The track was created by migration 0083 with a 1:1 mapping to the config,
	// so we can look up the config via categoryId + isActive=true.
	const [config] = await tdb
		.select()
		.from(categoryCommissionConfigs)
		.where(
			and(
				eq(categoryCommissionConfigs.categoryId, track.categoryId!),
				eq(categoryCommissionConfigs.isActive, true),
			),
		)
		.limit(1);

	if (!config) {
		// Track exists but backing config is gone — this shouldn't happen post-migration.
		// Treat as no commission.
		console.warn(
			JSON.stringify({
				event: "commission_track_backing_config_not_found",
				trackId: track.id,
				categoryId: track.categoryId,
				sourceRef: input.sourceRef,
			}),
		);
		return null;
	}

	// Step 3: rates from commission_track_rates (keyed by tierId, maps to trainerTierId for plan.ts)
	let rateTable: RateTable | ConditionalRateTable;

	if (!config.isConditional) {
		const trackRates = await tdb
			.select({
				trainerTierId: commissionTrackRates.tierId,
				amount: commissionTrackRates.amount,
			})
			.from(commissionTrackRates)
			.where(eq(commissionTrackRates.trackId, track.id));

		rateTable = { isConditional: false, tierRates: trackRates };
	} else if (input.matchMode === "operator") {
		// Appointment path: condition matching by attendeeCount + operator
		const conditions = await tdb
			.select()
			.from(commissionConditions)
			.where(eq(commissionConditions.configId, config.id))
			.orderBy(asc(commissionConditions.conditionIndex));

		const n = input.matchValue ?? 0;
		const matched = conditions.find((cond) => {
			switch (cond.operator) {
				case "lt":
					return n < cond.threshold;
				case "lte":
					return n <= cond.threshold;
				case "gt":
					return n > cond.threshold;
				case "gte":
					return n >= cond.threshold;
				case "eq":
					return n === cond.threshold;
				case "between":
					return (
						cond.thresholdMax !== null &&
						cond.thresholdMax !== undefined &&
						n >= cond.threshold &&
						n <= cond.thresholdMax
					);
				default:
					return false;
			}
		});

		if (!matched) {
			console.warn(
				JSON.stringify({
					event: "commission_skipped_no_matching_condition",
					sourceRef: input.sourceRef,
					attendeeCount: input.matchValue,
				}),
			);
			return null;
		}

		const conditionRates = await tdb
			.select({
				trainerTierId: commissionConditionRates.trainerTierId,
				amount: commissionConditionRates.amount,
				conditionId: commissionConditionRates.conditionId,
			})
			.from(commissionConditionRates)
			.where(eq(commissionConditionRates.conditionId, matched.id));

		rateTable = {
			isConditional: true,
			conditionRates,
			matchedConditionId: matched.id,
		};
	} else {
		// POS threshold path: walk conditions descending by minQuantity
		const conds = await tdb
			.select()
			.from(commissionConditions)
			.where(eq(commissionConditions.configId, config.id))
			.orderBy(
				sql`COALESCE(${commissionConditions.minQuantity}, 0) DESC`,
				asc(commissionConditions.conditionIndex),
			);

		const matched = conds.find(
			(c) => c.minQuantity == null || c.minQuantity <= (input.quantity ?? 0),
		);

		if (!matched) {
			return null;
		}

		const conditionRates = await tdb
			.select({
				trainerTierId: commissionConditionRates.trainerTierId,
				amount: commissionConditionRates.amount,
				conditionId: commissionConditionRates.conditionId,
			})
			.from(commissionConditionRates)
			.where(eq(commissionConditionRates.conditionId, matched.id));

		rateTable = {
			isConditional: true,
			conditionRates,
			matchedConditionId: matched.id,
		};
	}

	// Pre-step A: fetch all configured coach slots by TRACK ID (not configId)
	const allSlots = await tdb
		.select({
			slotIndex: commissionCoachSlots.slotIndex,
			weightageBasisPoints: commissionCoachSlots.weightageBasisPoints,
		})
		.from(commissionCoachSlots)
		.where(eq(commissionCoachSlots.trackId, track.id));

	// Pre-step B3: batch-fetch member roles + tiers (appointment path only)
	const memberByUserId = new Map<string, MemberSnapshot>();
	if (input.requireTrainerRole && input.staffIds && input.staffIds.length > 0) {
		const memberData = await tdb
			.select({
				userId: members.userId,
				role: members.role,
				trainerTierId: members.trainerTierId,
			})
			.from(members)
			.where(inArray(members.userId, input.staffIds));

		for (const m of memberData) {
			memberByUserId.set(m.userId, m);
		}
	}

	// Resolve latest track version (Task #17 provenance)
	const [latestTrackVersion] = await tdb
		.select({ id: commissionTrackVersions.id })
		.from(commissionTrackVersions)
		.where(eq(commissionTrackVersions.trackId, track.id))
		.orderBy(desc(commissionTrackVersions.versionNumber))
		.limit(1);

	const resolvedTrackVersionId = latestTrackVersion?.id ?? null;
	if (!resolvedTrackVersionId) {
		console.warn(
			JSON.stringify({
				event: "commission_track_no_version_found",
				trackId: track.id,
				categoryId: track.categoryId,
				sourceRef: input.sourceRef,
			}),
		);
	}

	// Still resolve the legacy configVersionId for backward compatibility
	// (existing splits with configVersionId still use it in cap queries).
	const [latestConfigVersion] = await tdb
		.select({ id: categoryCommissionConfigVersions.id })
		.from(categoryCommissionConfigVersions)
		.where(eq(categoryCommissionConfigVersions.categoryId, config.categoryId))
		.orderBy(desc(categoryCommissionConfigVersions.versionNumber))
		.limit(1);

	const resolvedConfigVersionId = latestConfigVersion?.id ?? undefined;

	return {
		config,
		rateTable,
		allSlots,
		memberByUserId,
		resolvedConfigVersionId,
		resolvedTrackId: track.id,
		resolvedTrackVersionId,
	};
}

// ---------------------------------------------------------------------------
// Legacy config path (fallback for un-backfilled tenants)
// ---------------------------------------------------------------------------

async function _loadFromConfig(
	tdb: TenantDb,
	categoryId: string,
	input: LoadCommissionContextInput,
): Promise<CommissionContext | null> {
	// Step 2 (legacy): active commission config for this category
	const [config] = await tdb
		.select()
		.from(categoryCommissionConfigs)
		.where(
			and(
				eq(categoryCommissionConfigs.categoryId, categoryId),
				eq(categoryCommissionConfigs.isActive, true),
			),
		)
		.limit(1);

	if (!config) {
		return null;
	}

	// Step 3: rates (non-conditional or conditional)
	let rateTable: RateTable | ConditionalRateTable;

	if (!config.isConditional) {
		const tierRates = await tdb
			.select({
				trainerTierId: commissionTierRates.trainerTierId,
				amount: commissionTierRates.amount,
			})
			.from(commissionTierRates)
			.where(eq(commissionTierRates.configId, config.id));

		rateTable = { isConditional: false, tierRates };
	} else if (input.matchMode === "operator") {
		const conditions = await tdb
			.select()
			.from(commissionConditions)
			.where(eq(commissionConditions.configId, config.id))
			.orderBy(asc(commissionConditions.conditionIndex));

		const n = input.matchValue ?? 0;
		const matched = conditions.find((cond) => {
			switch (cond.operator) {
				case "lt":
					return n < cond.threshold;
				case "lte":
					return n <= cond.threshold;
				case "gt":
					return n > cond.threshold;
				case "gte":
					return n >= cond.threshold;
				case "eq":
					return n === cond.threshold;
				case "between":
					return (
						cond.thresholdMax !== null &&
						cond.thresholdMax !== undefined &&
						n >= cond.threshold &&
						n <= cond.thresholdMax
					);
				default:
					return false;
			}
		});

		if (!matched) {
			console.warn(
				JSON.stringify({
					event: "commission_skipped_no_matching_condition",
					sourceRef: input.sourceRef,
					attendeeCount: input.matchValue,
				}),
			);
			return null;
		}

		const conditionRates = await tdb
			.select({
				trainerTierId: commissionConditionRates.trainerTierId,
				amount: commissionConditionRates.amount,
				conditionId: commissionConditionRates.conditionId,
			})
			.from(commissionConditionRates)
			.where(eq(commissionConditionRates.conditionId, matched.id));

		rateTable = {
			isConditional: true,
			conditionRates,
			matchedConditionId: matched.id,
		};
	} else {
		const conds = await tdb
			.select()
			.from(commissionConditions)
			.where(eq(commissionConditions.configId, config.id))
			.orderBy(
				sql`COALESCE(${commissionConditions.minQuantity}, 0) DESC`,
				asc(commissionConditions.conditionIndex),
			);

		const matched = conds.find(
			(c) => c.minQuantity == null || c.minQuantity <= (input.quantity ?? 0),
		);

		if (!matched) {
			return null;
		}

		const conditionRates = await tdb
			.select({
				trainerTierId: commissionConditionRates.trainerTierId,
				amount: commissionConditionRates.amount,
				conditionId: commissionConditionRates.conditionId,
			})
			.from(commissionConditionRates)
			.where(eq(commissionConditionRates.conditionId, matched.id));

		rateTable = {
			isConditional: true,
			conditionRates,
			matchedConditionId: matched.id,
		};
	}

	// Pre-step A: fetch all configured coach slots (legacy: by configId)
	const allSlots = await tdb
		.select({
			slotIndex: commissionCoachSlots.slotIndex,
			weightageBasisPoints: commissionCoachSlots.weightageBasisPoints,
		})
		.from(commissionCoachSlots)
		.where(eq(commissionCoachSlots.configId, config.id));

	// Pre-step B3: batch-fetch member roles + tiers (appointment path only)
	const memberByUserId = new Map<string, MemberSnapshot>();
	if (input.requireTrainerRole && input.staffIds && input.staffIds.length > 0) {
		const memberData = await tdb
			.select({
				userId: members.userId,
				role: members.role,
				trainerTierId: members.trainerTierId,
			})
			.from(members)
			.where(inArray(members.userId, input.staffIds));

		for (const m of memberData) {
			memberByUserId.set(m.userId, m);
		}
	}

	// F-COM-B: resolve latest configVersionId for this category
	const [latestVersion] = await tdb
		.select({ id: categoryCommissionConfigVersions.id })
		.from(categoryCommissionConfigVersions)
		.where(eq(categoryCommissionConfigVersions.categoryId, config.categoryId))
		.orderBy(desc(categoryCommissionConfigVersions.versionNumber))
		.limit(1);

	const resolvedConfigVersionId = latestVersion?.id ?? undefined;
	if (!resolvedConfigVersionId) {
		console.warn(
			JSON.stringify({
				event: "commission_no_config_version_found",
				categoryId: config.categoryId,
				configId: config.id,
				sourceRef: input.sourceRef,
			}),
		);
	}

	return {
		config,
		rateTable,
		allSlots,
		memberByUserId,
		resolvedConfigVersionId,
		resolvedTrackId: null,
		resolvedTrackVersionId: null,
	};
}
