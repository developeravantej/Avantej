/**
 * Commission Tracks Schema (Task #15 — Commission Tracks Plan §3.3)
 *
 * A CommissionTrack is a named rule that determines:
 *   - WHO earns (roleType)
 *   - WHEN they earn (trigger)
 *   - HOW the base amount is calculated (basis)
 *   - Whether the pool is shared or separate across earners (poolPolicy)
 *
 * The initial backfill (migration 0083) creates one delivery track per
 * category_commission_configs row (scope='category', roleType='trainer',
 * trigger='on_completion', basis='delivery_total') — preserving existing
 * trainer commission behaviour exactly.
 *
 * Multi-tenant: this table lives in each tenant's Neon branch.
 *
 * NOTE: String literal types are defined locally here to avoid introducing a
 * dependency on @avantej-core/types inside @avantej-core/db. The canonical
 * exports live in packages/types/src/commission.ts.
 */

import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { serviceCategories } from "./service-categories";

// Local type aliases — canonical definitions are in @avantej-core/types
type CommissionTrackScope = "category" | "org" | "product";
type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";
type CommissionTrigger = "on_completion" | "on_sale";
type CommissionBasis = "delivery_total" | "gross_order" | "net_order" | "flat";
type CommissionPaymentType = "fixed" | "variable";
type CommissionPoolPolicy = "separate" | "shared";
// UAT §12 — which kind of sale a track applies to:
//   "new"     — only a new customer's first purchase (acquisition)
//   "renewal" — only a returning customer's purchase
//   "any"     — applies regardless (default; preserves pre-migration behaviour)
type CommissionSalesType = "new" | "renewal" | "any";

export const commissionTracks = pgTable(
	"commission_tracks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// NULL = org-scoped; NOT NULL = category-scoped
		categoryId: uuid("category_id").references(() => serviceCategories.id, {
			onDelete: "restrict",
		}),
		scope: text("scope")
			.notNull()
			.default("category")
			.$type<CommissionTrackScope>(),
		roleType: text("role_type")
			.notNull()
			.default("trainer")
			.$type<CommissionRoleType>(),
		trigger: text("trigger")
			.notNull()
			.default("on_completion")
			.$type<CommissionTrigger>(),
		basis: text("basis")
			.notNull()
			.default("delivery_total")
			.$type<CommissionBasis>(),
		paymentType: text("payment_type")
			.notNull()
			.default("variable")
			.$type<CommissionPaymentType>(),
		poolPolicy: text("pool_policy")
			.notNull()
			.default("separate")
			.$type<CommissionPoolPolicy>(),
		// UAT §12 — new-vs-renewal scoping. Default 'any' preserves all existing
		// tracks (they fire regardless of whether the sale is a new customer or a
		// renewal). Migration 0096 adds the column with this default.
		salesType: text("sales_type")
			.notNull()
			.default("any")
			.$type<CommissionSalesType>(),
		maxBeneficiaries: integer("max_beneficiaries").notNull().default(1),
		// NULL = uncapped per cycle
		maxPerCycleCents: integer("max_per_cycle_cents"),
		// Per-split ceiling (null = uncapped)
		capAmountCents: integer("cap_amount_cents"),
		// Per-split minimum (null = no floor)
		floorAmountCents: integer("floor_amount_cents"),
		// Basis points (e.g. 2000 = 20%). NULL = no exclusion.
		excludeIfDiscountAbovePct: integer("exclude_if_discount_above_pct"),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		categoryIdx: index("commission_tracks_category_idx").on(table.categoryId),
		scopeRoleIdx: index("commission_tracks_scope_role_idx").on(
			table.scope,
			table.roleType,
		),
		activeIdx: index("commission_tracks_active_idx").on(table.isActive),
	}),
);
