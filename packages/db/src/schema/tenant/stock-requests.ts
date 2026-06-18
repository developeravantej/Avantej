import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { members } from "./members";
import { hierarchyNodes } from "./hierarchy";

export const stockRequests = pgTable(
	"stock_requests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		requestNumber: text("request_number").notNull().unique(),
		dateIssued: timestamp("date_issued").notNull(),
		issuedByMemberId: uuid("issued_by_member_id")
			.notNull()
			.references(() => members.id, { onDelete: "restrict" }),
		// nullable = request from central warehouse
		fromBranchId: uuid("from_branch_id").references(() => hierarchyNodes.id, {
			onDelete: "restrict",
		}),
		toBranchId: uuid("to_branch_id")
			.notNull()
			.references(() => hierarchyNodes.id, { onDelete: "restrict" }),
		destinationLabel: text("destination_label"),
		status: text("status").default("pending").notNull(),
		// "pending" | "approved" | "fulfilled" | "rejected" | "cancelled"
		notes: text("notes"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		requestNumberIdx: index("stock_requests_number_idx").on(
			table.requestNumber,
		),
		issuedByMemberIdx: index("stock_requests_member_idx").on(
			table.issuedByMemberId,
		),
		fromBranchIdx: index("stock_requests_from_branch_idx").on(
			table.fromBranchId,
		),
		toBranchIdx: index("stock_requests_to_branch_idx").on(table.toBranchId),
		statusIdx: index("stock_requests_status_idx").on(table.status),
		dateIssuedIdx: index("stock_requests_date_idx").on(table.dateIssued),
	}),
);
