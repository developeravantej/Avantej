/**
 * Control Panel — Tenant Usage Snapshots (Plan E E.2).
 *
 * Daily-cron-written rollup of usage per tenant for the platform-admin
 * UI. Source-of-truth lives in tenant DBs; this table is a denormalized
 * mirror so the cross-tenant dashboard doesn't fan out at request time.
 *
 * Cron: 01:00 UTC daily. One row per (organization, snapshot_date).
 * UPSERT-on-conflict so re-runs are idempotent.
 *
 * See ADR-0023.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	bigint,
	boolean,
	timestamp,
	date,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const tenantUsageSnapshots = pgTable(
	"tenant_usage_snapshots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		snapshotDate: date("snapshot_date").notNull(),
		memberCount: integer("member_count").notNull().default(0),
		customerCount: integer("customer_count").notNull().default(0),
		apptCount30d: integer("appt_count_30d").notNull().default(0),
		salesTotal30dMinor: integer("sales_total_30d_minor").notNull().default(0),
		salesCurrency: text("sales_currency").notNull().default("MYR"),
		storageBytes: bigint("storage_bytes", { mode: "number" }).notNull().default(0),
		ghlActive: boolean("ghl_active").notNull().default(false),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => ({
		orgDateUq: uniqueIndex("tenant_usage_snapshots_org_date_uq").on(
			t.organizationId,
			t.snapshotDate,
		),
		orgIdx: index("tenant_usage_snapshots_org_idx").on(
			t.organizationId,
			t.snapshotDate,
		),
	}),
);
