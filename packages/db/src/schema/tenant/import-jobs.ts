/**
 * Tenant Import Jobs (WS6 — MOVE parity).
 *
 * History of self-service CSV import runs. One row per committed/failed run;
 * the imported data itself lands in the entity tables via their services.
 * Plain uuid / text columns, no cross-table FK.
 */

import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const importJobs = pgTable(
	"import_jobs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: text("organization_id"),
		/** 'clients' | 'packages' | 'payments' | 'opening_balances'. */
		entity: text("entity").notNull(),
		/** 'pending' | 'committed' | 'failed'. */
		status: text("status").notNull().default("pending"),
		rowCount: integer("row_count").notNull().default(0),
		createdCount: integer("created_count").notNull().default(0),
		skippedCount: integer("skipped_count").notNull().default(0),
		errorCount: integer("error_count").notNull().default(0),
		/** Per-row outcomes + errors for the review UI. */
		summary: jsonb("summary"),
		createdBy: text("created_by"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		orgCreatedIdx: index("import_jobs_org_created_idx").on(
			t.organizationId,
			t.createdAt,
		),
	}),
);
