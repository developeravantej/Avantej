// packages/db/src/schema/tenant/installment-plans.ts

/**
 * Installment Plans Schema
 *
 * Admin-configurable installment plan definitions per tenant.
 * Replaces the hardcoded ['full', 'half', 'quarterly'] enum across the codebase.
 *
 * Seed rows (inserted on migration) match existing literal values so historical
 * package_instances.paymentPlanType references remain valid:
 *   full      → numInstallments = 1
 *   half      → numInstallments = 2
 *   quarterly → numInstallments = 4
 *
 * The `code` field is immutable after creation — it is stored as a plain text
 * reference in package_instances.paymentPlanType (no FK), so renaming a code
 * would silently orphan historical rows.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";

export const installmentPlans = pgTable(
	"installment_plans",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Stable short identifier — MUST match existing literal values ('full','half','quarterly').
		// Immutable after creation (service layer enforces).
		code: text("code").notNull(),

		// Human-readable display name, e.g. "Full Payment", "Half (2 installments)"
		name: text("name").notNull(),

		// Number of installments. Must be >= 1 (enforced in service layer).
		numInstallments: integer("num_installments").notNull(),

		// Default interval in days between installments.
		// Callers may override per-service via services.installmentIntervalDays.
		defaultIntervalDays: integer("default_interval_days").notNull().default(30),

		// Optional description shown to customers / admins
		description: text("description"),

		// Soft-delete / visibility flag
		isActive: boolean("is_active").notNull().default(true),

		// Only ONE plan can be default at a time (enforced in service layer via transaction).
		// Reserved for future UX: pre-select default plan in native purchase flow.
		isDefault: boolean("is_default").notNull().default(false),

		// Display ordering (ascending). Lower values appear first.
		sortOrder: integer("sort_order").notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => ({
		codeIdx: uniqueIndex("installment_plans_code_idx").on(t.code),
		activeIdx: index("installment_plans_active_idx").on(t.isActive),
		defaultIdx: index("installment_plans_default_idx").on(t.isDefault),
	}),
);
