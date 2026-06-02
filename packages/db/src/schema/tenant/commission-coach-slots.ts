import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { categoryCommissionConfigs } from "./category-commission-configs";
import { commissionTracks } from "./commission-tracks";

export const commissionCoachSlots = pgTable(
	"commission_coach_slots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		configId: uuid("config_id")
			.notNull()
			.references(() => categoryCommissionConfigs.id, { onDelete: "cascade" }),
		slotIndex: integer("slot_index").notNull(),
		label: text("label").notNull(),
		weightageBasisPoints: integer("weightage_basis_points").notNull(),
		// Migration 0083: new track-based path. Nullable — existing slots
		// retain configId; new slots set trackId. Agent D wires the handover.
		// The SQL migration adds a partial unique index (track_id, slot_index)
		// WHERE track_id IS NOT NULL (cannot be expressed in Drizzle uniqueIndex).
		trackId: uuid("track_id").references(() => commissionTracks.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		configSlotUnique: uniqueIndex("coach_slots_config_slot_unique").on(
			table.configId,
			table.slotIndex,
		),
		configIdx: index("coach_slots_config_idx").on(table.configId),
		trackIdx: index("commission_coach_slots_track_idx").on(table.trackId),
	}),
);
