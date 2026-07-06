/**
 * Tenant Branch Number Sequences (WS3 — MOVE parity).
 *
 * Opt-in gapless per-branch document counters. One row per
 * (branch_node_id, doc_type). The numbering service increments `next_seq`
 * with an UPDATE ... RETURNING inside the SAME transaction that writes the
 * document, so numbers are gapless and race-safe under concurrent sales.
 *
 * A branch only uses these counters once it has an invoice/receipt prefix
 * configured on branch_details; otherwise the existing global tenant_*_seq
 * sequences are used and no row is created here.
 *
 * branch_node_id is a plain uuid (points at hierarchy_nodes.id / a branch
 * node) with no FK, consistent with the cross-cutting branch-scoped columns.
 */

import {
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const branchNumberSequences = pgTable(
	"branch_number_sequences",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		branchNodeId: uuid("branch_node_id").notNull(),
		/** 'invoice' | 'receipt' (extensible). */
		docType: text("doc_type").notNull(),
		nextSeq: integer("next_seq").notNull().default(1),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		branchDocIdx: uniqueIndex("branch_number_sequences_branch_doc_idx").on(
			table.branchNodeId,
			table.docType,
		),
	}),
);
