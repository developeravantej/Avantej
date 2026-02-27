import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { members } from "./members";
import { hierarchyNodes } from "./hierarchy";

export const transferOrders = pgTable("transfer_orders", {
	id: uuid("id").primaryKey().defaultRandom(),
	transferNumber: text("transfer_number").notNull().unique(),
	dateIssued: timestamp("date_issued").notNull(),
	fromBranchId: uuid("from_branch_id")
		.notNull()
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	toBranchId: uuid("to_branch_id")
		.notNull()
		.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
	issuedByMemberId: uuid("issued_by_member_id")
		.notNull()
		.references(() => members.id, { onDelete: "restrict" }),
	status: text("status").default("pending").notNull(),
	// "pending" | "in_transit" | "completed" | "cancelled"
	notes: text("notes"),
	completedAt: timestamp("completed_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	transferNumberIdx: index("transfer_orders_number_idx").on(table.transferNumber),
	fromBranchIdx: index("transfer_orders_from_branch_idx").on(table.fromBranchId),
	toBranchIdx: index("transfer_orders_to_branch_idx").on(table.toBranchId),
	issuedByMemberIdx: index("transfer_orders_member_idx").on(table.issuedByMemberId),
	statusIdx: index("transfer_orders_status_idx").on(table.status),
	dateIssuedIdx: index("transfer_orders_date_idx").on(table.dateIssued),
}));
