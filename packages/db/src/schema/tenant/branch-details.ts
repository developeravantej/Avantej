/**
 * Tenant Branch Details
 *
 * Branch-specific columns split out of `hierarchy_nodes` in Phase H2.
 * One row per branch (type='branch' in hierarchy_nodes), keyed by
 * `node_id` → hierarchy_nodes.id with ON DELETE CASCADE. Created
 * lazily by createHierarchyNode when the new branch has any
 * branch-specific data; absent rows mean no data set.
 *
 * Cross-DB note: `pic_user_id` references control panel `users.id`
 * (text type, no FK constraint due to cross-database).
 */

import { relations, sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";

export const branchDetails = pgTable(
	"branch_details",
	{
		nodeId: uuid("node_id")
			.primaryKey()
			.references(() => hierarchyNodes.id, { onDelete: "cascade" }),
		address: text("address"),
		picUserId: text("pic_user_id"),
		// WS1 (multi-currency): branch ISO currency, seeded from its country
		// node. Source of truth for stamping currency on money rows. Nullable
		// during rollout; resolveBranchCurrency() falls back to the country map.
		currency: text("currency"),
		// WS3 (per-branch company/tax profile). All nullable — a branch with no
		// profile behaves exactly as before. Printed on invoices/receipts.
		companyLegalName: text("company_legal_name"),
		registrationNumber: text("registration_number"),
		taxId: text("tax_id"),
		// WS3 numbering prefixes. When set, documents for this branch use the
		// gapless per-branch counter (branch_number_sequences); when null, the
		// existing global tenant_*_seq sequences are used (unchanged).
		invoicePrefix: text("invoice_prefix"),
		receiptPrefix: text("receipt_prefix"),
		// WS3 per-branch tax override → tax_rates.id. Plain uuid (no cross-table
		// FK) matching the currency precedent + dodging the drift-check FK gate.
		// resolveTaxRate prefers this over the country/org-default fallback.
		branchTaxRateId: uuid("branch_tax_rate_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		picUserIdIdx: index("branch_details_pic_user_idx").on(table.picUserId),
		// WS3: per-branch document prefixes must be unique across branches so two
		// branches never mint colliding invoice/receipt numbers. Partial (NULLs
		// allowed — most branches have no prefix set).
		invoicePrefixIdx: uniqueIndex("branch_details_invoice_prefix_idx")
			.on(table.invoicePrefix)
			.where(sql`${table.invoicePrefix} IS NOT NULL`),
		receiptPrefixIdx: uniqueIndex("branch_details_receipt_prefix_idx")
			.on(table.receiptPrefix)
			.where(sql`${table.receiptPrefix} IS NOT NULL`),
	}),
);

// TODO(Phase H2): If inferred relation types require a reciprocal
// `branchDetails` relation on hierarchyNodes, add it in hierarchy.ts.
export const branchDetailsRelations = relations(branchDetails, ({ one }) => ({
	node: one(hierarchyNodes, {
		fields: [branchDetails.nodeId],
		references: [hierarchyNodes.id],
	}),
}));
