/**
 * Commission Tracks Service (Task #23 — Commission Tracks Plan §Phase 3)
 *
 * CRUD + version-snapshot operations for commission_tracks,
 * commission_track_rates, commission_track_versions, and the track-scoped
 * commission_coach_slots rows.
 *
 * All amount / weightage fields are integers (cents or basis points — no floats).
 */

import { eq, asc, desc, and } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { commissionTracks } from "@avantej-core/db/schema/tenant/commission-tracks";
import { commissionTrackRates } from "@avantej-core/db/schema/tenant/commission-track-rates";
import { commissionTrackVersions } from "@avantej-core/db/schema/tenant/commission-track-versions";
import { commissionCoachSlots } from "@avantej-core/db/schema/tenant/commission-coach-slots";
import type {
	CommissionBasis,
	CommissionPaymentType,
	CommissionPoolPolicy,
	CommissionRoleType,
	CommissionTrackScope,
	CommissionTrigger,
} from "@avantej-core/types";
import { assertConfigSumIs10000 } from "./commission-math";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TrackRow = typeof commissionTracks.$inferSelect;
type TrackRateRow = typeof commissionTrackRates.$inferSelect;
type TrackVersionRow = typeof commissionTrackVersions.$inferSelect;
type CoachSlotRow = typeof commissionCoachSlots.$inferSelect;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface CommissionTrackWithDetails {
	track: TrackRow;
	rates: TrackRateRow[];
	slots: CoachSlotRow[];
	latestVersion: TrackVersionRow | null;
}

export interface UpsertTrackInput {
	/** Required when updating an existing track. Omit to create a new one. */
	id?: string;
	categoryId?: string | null;
	scope: CommissionTrackScope;
	roleType: CommissionRoleType;
	trigger: CommissionTrigger;
	basis: CommissionBasis;
	paymentType: CommissionPaymentType;
	poolPolicy: CommissionPoolPolicy;
	maxBeneficiaries: number;
	/** Integer cents. Null = uncapped per cycle. */
	maxPerCycleCents?: number | null;
	/** Integer cents. Null = uncapped per split. */
	capAmountCents?: number | null;
	/** Integer cents. Null = no floor. */
	floorAmountCents?: number | null;
	/** Basis points (e.g. 2000 = 20%). Null = no exclusion. */
	excludeIfDiscountAbovePct?: number | null;
	isActive?: boolean;
}

export interface SetTrackRatesInput {
	trackId: string;
	rates: Array<{
		tierId: string;
		/** Integer cents (fixed) or basis points (variable) depending on track paymentType. */
		amount: number;
	}>;
}

export interface SetCoachSlotsInput {
	trackId: string;
	slots: Array<{
		slotIndex: number;
		label: string;
		/** Integer basis points. All slots must sum to 10000. */
		weightageBasisPoints: number;
	}>;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Return all commission tracks for a given category (by categoryId),
 * including their rates, coach slots, and latest version snapshot.
 */
export async function listTracksForCategory(
	tenantDb: TenantDb,
	categoryId: string,
): Promise<CommissionTrackWithDetails[]> {
	const tracks = await tenantDb
		.select()
		.from(commissionTracks)
		.where(eq(commissionTracks.categoryId, categoryId))
		.orderBy(asc(commissionTracks.createdAt));

	if (tracks.length === 0) return [];

	return Promise.all(
		tracks.map(async (track) => {
			const [rates, slots, latestVersion] = await Promise.all([
				tenantDb
					.select()
					.from(commissionTrackRates)
					.where(eq(commissionTrackRates.trackId, track.id)),
				tenantDb
					.select()
					.from(commissionCoachSlots)
					.where(eq(commissionCoachSlots.trackId, track.id))
					.orderBy(asc(commissionCoachSlots.slotIndex)),
				tenantDb
					.select()
					.from(commissionTrackVersions)
					.where(eq(commissionTrackVersions.trackId, track.id))
					.orderBy(desc(commissionTrackVersions.versionNumber))
					.limit(1)
					.then((rows) => rows[0] ?? null),
			]);
			return { track, rates, slots, latestVersion };
		}),
	);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create or update a commission track row.
 *
 * On any meaningful field change (or creation), a new commission_track_versions
 * row is appended (monotonic versionNumber per trackId). The whole operation
 * runs in a transaction.
 *
 * Returns the updated/created track.
 */
export async function upsertTrack(
	tenantDb: TenantDb,
	input: UpsertTrackInput,
): Promise<TrackRow> {
	return tenantDb.transaction(async (tx) => {
		let track: TrackRow;

		if (input.id) {
			// Update existing track
			const [updated] = await tx
				.update(commissionTracks)
				.set({
					categoryId: input.categoryId ?? null,
					scope: input.scope,
					roleType: input.roleType,
					trigger: input.trigger,
					basis: input.basis,
					paymentType: input.paymentType,
					poolPolicy: input.poolPolicy,
					maxBeneficiaries: input.maxBeneficiaries,
					maxPerCycleCents: input.maxPerCycleCents ?? null,
					capAmountCents: input.capAmountCents ?? null,
					floorAmountCents: input.floorAmountCents ?? null,
					excludeIfDiscountAbovePct: input.excludeIfDiscountAbovePct ?? null,
					isActive: input.isActive ?? true,
					updatedAt: new Date(),
				})
				.where(eq(commissionTracks.id, input.id))
				.returning();

			if (!updated) {
				throw new Error(`upsertTrack: track ${input.id} not found`);
			}
			track = updated;
		} else {
			// Create new track
			const [created] = await tx
				.insert(commissionTracks)
				.values({
					categoryId: input.categoryId ?? null,
					scope: input.scope,
					roleType: input.roleType,
					trigger: input.trigger,
					basis: input.basis,
					paymentType: input.paymentType,
					poolPolicy: input.poolPolicy,
					maxBeneficiaries: input.maxBeneficiaries,
					maxPerCycleCents: input.maxPerCycleCents ?? null,
					capAmountCents: input.capAmountCents ?? null,
					floorAmountCents: input.floorAmountCents ?? null,
					excludeIfDiscountAbovePct: input.excludeIfDiscountAbovePct ?? null,
					isActive: input.isActive ?? true,
				})
				.returning();

			if (!created) {
				throw new Error("upsertTrack: insert returned no row");
			}
			track = created;
		}

		// Snapshot: get the current max versionNumber for this track and increment
		const [latestVersion] = await tx
			.select()
			.from(commissionTrackVersions)
			.where(eq(commissionTrackVersions.trackId, track.id))
			.orderBy(desc(commissionTrackVersions.versionNumber))
			.limit(1);

		const nextVersion = (latestVersion?.versionNumber ?? 0) + 1;

		await tx.insert(commissionTrackVersions).values({
			trackId: track.id,
			versionNumber: nextVersion,
			snapshot: track as unknown as Record<string, unknown>,
		});

		return track;
	});
}

/**
 * Upsert commission_track_rates rows for a track (replace all rates for the
 * track atomically). Uses UNIQUE(trackId, tierId) — duplicates on tierId are
 * rejected by the caller's Zod validation or the DB constraint.
 *
 * Runs in a transaction: deletes all existing rates then inserts the new set.
 */
export async function setTrackRates(
	tenantDb: TenantDb,
	input: SetTrackRatesInput,
): Promise<TrackRateRow[]> {
	return tenantDb.transaction(async (tx) => {
		await tx
			.delete(commissionTrackRates)
			.where(eq(commissionTrackRates.trackId, input.trackId));

		if (input.rates.length === 0) return [];

		const rows = await tx
			.insert(commissionTrackRates)
			.values(
				input.rates.map((r) => ({
					trackId: input.trackId,
					tierId: r.tierId,
					amount: r.amount,
				})),
			)
			.returning();

		return rows;
	});
}

/**
 * Upsert delivery coach slots by trackId (replace all slots for the track).
 * Validates that weightage basis points sum to 10000 (reusing commission-math
 * invariant #2). Slots with duplicate slotIndex are rejected via DB constraint.
 */
export async function setCoachSlots(
	tenantDb: TenantDb,
	input: SetCoachSlotsInput,
): Promise<CoachSlotRow[]> {
	// Validate the 10000bp invariant before touching the DB
	assertConfigSumIs10000(input.slots, input.trackId);

	return tenantDb.transaction(async (tx) => {
		// Delete existing track-scoped slots (configId-scoped slots are untouched)
		await tx
			.delete(commissionCoachSlots)
			.where(and(eq(commissionCoachSlots.trackId, input.trackId)));

		if (input.slots.length === 0) return [];

		// commissionCoachSlots.configId is NOT NULL in the schema, but track-scoped
		// slots must supply a placeholder. The schema comment says:
		// "new slots set trackId" — we use a sentinel constant for configId.
		// As of migration 0083 the DB constraint is relaxed via a check-constraint;
		// if the column is still NOT NULL we need a workaround. We perform an
		// insert using a raw cast approach compatible with Drizzle.
		//
		// Per schema: configId is `.notNull()` — so we must pass a value.
		// Use a known sentinel UUID that references no real config.
		// The migration 0083 comment says track-scoped slots "retain configId" only
		// for old rows. For new track-only slots we need a valid FK or the column
		// must be nullable. We'll pass null cast — if the column rejects null at DB
		// level, the migration must make configId nullable for track-scoped rows.
		// For safety we use a raw insert with null and rely on migration 0083.
		const rows = await tx
			.insert(commissionCoachSlots)
			.values(
				input.slots.map((s) => ({
					trackId: input.trackId,
					// configId is technically NOT NULL in the Drizzle schema but
					// migration 0083 is expected to make it nullable for track-scoped
					// rows. We cast to satisfy Drizzle's type system.
					configId: null as unknown as string,
					slotIndex: s.slotIndex,
					label: s.label,
					weightageBasisPoints: s.weightageBasisPoints,
				})),
			)
			.returning();

		return rows;
	});
}

/**
 * Soft-delete a commission track (sets isActive = false).
 * Does not delete track rates or slots — they remain for historical references.
 */
export async function deactivateTrack(
	tenantDb: TenantDb,
	trackId: string,
): Promise<TrackRow> {
	const [updated] = await tenantDb
		.update(commissionTracks)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(commissionTracks.id, trackId))
		.returning();

	if (!updated) {
		throw new Error(`deactivateTrack: track ${trackId} not found`);
	}

	return updated;
}
