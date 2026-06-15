/**
 * Commission Track Rates Schema (Task #15)
 *
 * Per-tier rate for a commission track. Mirrors the pattern from
 * commission_tier_rates (per-config rates) but attached to commission_tracks.
 *
 * amount semantics:
 *   - paymentType='fixed':    integer cents (e.g. 5000 = RM 50)
 *   - paymentType='variable': basis points  (e.g. 1000 = 10%)
 */

import {
	index,
	integer,
	pgTable,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { commissionTracks } from "./commission-tracks";
import { trainerTiers } from "./trainer-tiers";

export const commissionTrackRates = pgTable(
	"commission_track_rates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		trackId: uuid("track_id")
			.notNull()
			.references(() => commissionTracks.id, { onDelete: "cascade" }),
		// References trainer_tiers.id — the earner tier for this rate row.
		tierId: uuid("tier_id")
			.notNull()
			.references(() => trainerTiers.id, { onDelete: "restrict" }),
		amount: integer("amount").notNull(),
	},
	(table) => ({
		trackTierUnique: uniqueIndex("commission_track_rates_track_tier_unique").on(
			table.trackId,
			table.tierId,
		),
		trackIdx: index("commission_track_rates_track_idx").on(table.trackId),
	}),
);
