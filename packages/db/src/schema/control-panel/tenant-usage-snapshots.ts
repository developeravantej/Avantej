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
	jsonb,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Plan F.1.5 (Agent H) — risk flag shape persisted in `risk_flags` jsonb.
 * Keep here so the schema is the source of truth; services package re-exports.
 */
export type RiskFlag = {
	code: string;
	severity: "info" | "warn" | "critical";
	observedAt: string; // ISO timestamp
};

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
		// Plan F.1.5 — composite tenant health (0-100). NULL = pre-F.1.5 row.
		healthScore: integer("health_score"),
		// Plan F.1.5 — array of { code, severity, observedAt } emitted by
		// computeHealthScore at snapshot-write time. NULL = pre-F.1.5 row.
		riskFlags: jsonb("risk_flags").$type<RiskFlag[]>(),
		// Plan F.6 (Agent Sn) — three additional factor columns wired by
		// the snapshot cron so computeHealthScore covers all 5 factors.
		// All nullable: pre-F.6 rows stay NULL; tolerant cron writes NULL
		// when a factor can't be computed (tenant DB unreachable, etc.).
		lastAdminLoginAt: timestamp("last_admin_login_at"),
		failedWebhooks7d: integer("failed_webhooks_7d"),
		dailyActiveMembers30dAvg: integer("daily_active_members_30d_avg"),
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
