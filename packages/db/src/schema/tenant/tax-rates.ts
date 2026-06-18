// packages/db/src/schema/tenant/tax-rates.ts

/**
 * Tenant Tax Rates Schema
 *
 * Configurable tax rates per organization for Malaysian tax compliance
 * (SST 8%, service tax 6%, etc.). Required for LHDN MyInvois e-invoice integration.
 *
 * Rate storage: stored in basis points to avoid floating-point precision issues.
 * - 800  = 8.00% (SST 8%)
 * - 600  = 6.00% (Service tax 6%)
 * - 0    = tax-exempt
 *
 * Calculation: taxAmount = floor(orderAmount × rateInBasisPoints / 10000)
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const taxRates = pgTable(
	"tax_rates",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Full descriptive name, e.g. "Sales and Service Tax 8%"
		name: text("name").notNull(),

		// Short identifier used in LHDN MyInvois API (must match LHDN codes)
		// e.g. "SST_8", "SERVICE_TAX_6", "TAX_EXEMPT"
		code: text("code").notNull(),

		// Rate in basis points (integer, no floats)
		// 800 = 8.00%, 600 = 6.00%, 0 = 0%
		rateInBasisPoints: integer("rate_in_basis_points").notNull(),

		// Regulatory category
		// "SST" | "GST" | "service_tax" | "withholding_tax" | "tax_exempt" | "custom"
		category: text("category").notNull().default("SST"),

		isActive: boolean("is_active").notNull().default(true),

		// Only ONE tax rate can have isDefault = true at a time.
		// Enforced in service layer (not DB constraint).
		isDefault: boolean("is_default").notNull().default(false),

		// The date range this rate is effective
		effectiveFrom: timestamp("effective_from", {
			withTimezone: true,
		}).notNull(),
		effectiveUntil: timestamp("effective_until", { withTimezone: true }), // null = still active

		description: text("description"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		codeIdx: uniqueIndex("tax_rates_code_idx").on(table.code),
		isActiveIdx: index("tax_rates_active_idx").on(table.isActive),
		isDefaultIdx: index("tax_rates_default_idx").on(table.isDefault),
		categoryIdx: index("tax_rates_category_idx").on(table.category),
	}),
);
