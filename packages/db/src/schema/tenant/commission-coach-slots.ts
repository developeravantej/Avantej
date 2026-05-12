import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { categoryCommissionConfigs } from "./category-commission-configs";

export const commissionCoachSlots = pgTable("commission_coach_slots", {
	id: uuid("id").primaryKey().defaultRandom(),
	configId: uuid("config_id")
		.notNull()
		.references(() => categoryCommissionConfigs.id, { onDelete: "cascade" }),
	slotIndex: integer("slot_index").notNull(),
	label: text("label").notNull(),
	weightageBasisPoints: integer("weightage_basis_points").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	configSlotUnique: uniqueIndex("coach_slots_config_slot_unique").on(table.configId, table.slotIndex),
	configIdx: index("coach_slots_config_idx").on(table.configId),
}));
