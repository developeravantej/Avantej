import { pgTable, uuid, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const rooms = pgTable("rooms", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	type: text("type").notNull(), // "consultation" | "group_session" | "private" | "training" | "individual"
	capacity: integer("capacity").notNull(),
	branchId: uuid("branch_id")
		.notNull()
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	branchIdIdx: index("rooms_branch_idx").on(table.branchId),
	isActiveIdx: index("rooms_is_active_idx").on(table.isActive),
}));
