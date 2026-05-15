/**
 * Reconciliation tables (control-panel) — Plan C Phase C.5.
 *
 * Three tables supporting the nightly reconciler (per ADR-0019):
 *
 *   reconciliation_runs   — one row per reconciler invocation
 *   payment_drift_log     — one row per detected drift, FK -> run
 *   reconciliation_state  — checkpoint per (org, country, resource_type)
 *
 * Plan C v1 policy: alert-only. No auto-fix. Drift rows are created with
 * severity (info | warn | critical); platform-admin UI surfaces them with
 * "Force sync" action for manual remediation.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	jsonb,
	index,
	primaryKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const reconciliationRuns = pgTable("reconciliation_runs", {
	id: uuid("id").primaryKey().defaultRandom(),
	runStartedAt: timestamp("run_started_at").notNull(),
	runCompletedAt: timestamp("run_completed_at"),
	status: text("status").notNull(), // running | completed | failed
	driftCount: integer("drift_count").default(0).notNull(),
	error: text("error"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paymentDriftLog = pgTable(
	"payment_drift_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		runId: uuid("run_id")
			.notNull()
			.references(() => reconciliationRuns.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "set null",
		}),
		stripeAccountId: text("stripe_account_id"),
		resourceType: text("resource_type").notNull(), // charge | refund | payout | application_fee
		resourceId: text("resource_id").notNull(),
		severity: text("severity").notNull(), // info | warn | critical
		driftKind: text("drift_kind").notNull(), // missing_in_db | status_mismatch | amount_mismatch | currency_mismatch | ...
		stripeValue: jsonb("stripe_value"),
		dbValue: jsonb("db_value"),
		detectedAt: timestamp("detected_at").defaultNow().notNull(),
		resolvedAt: timestamp("resolved_at"),
		resolvedBy: text("resolved_by"),
	},
	(t) => ({
		runIdx: index("drift_run_idx").on(t.runId),
		orgIdx: index("drift_org_idx").on(t.organizationId),
		severityIdx: index("drift_severity_idx").on(t.severity),
		// Partial index on unresolved drift — admin UI Overview filter.
		unresolvedIdx: index("drift_unresolved_idx").on(t.severity),
	}),
);

export const reconciliationState = pgTable(
	"reconciliation_state",
	{
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		countryCode: text("country_code").notNull(),
		resourceType: text("resource_type").notNull(),
		lastReconciledAt: timestamp("last_reconciled_at").notNull(),
	},
	(t) => ({
		pk: primaryKey({
			columns: [t.organizationId, t.countryCode, t.resourceType],
		}),
	}),
);
