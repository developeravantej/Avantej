/**
 * Category Commission Config Versions (Agent 2.5 — J5 commission audit)
 *
 * Immutable, append-only metadata snapshot of a `category_commission_configs`
 * save. Auto-created by an AFTER INSERT trigger on the parent table (see
 * 0034_commission_audit.sql) so the existing `category-commission.service.ts`
 * (which we don't modify) emits a version row on every upsert.
 *
 * KEY DESIGN — versionNumber is monotonic per `categoryId`, NOT per
 * `category_commission_configs.id`. The parent service is DELETE-then-INSERT,
 * so the parent row's UUID changes on every save. Stable identity is the
 * categoryId.
 *
 * Snapshot scope (advisor-validated path b): mirror only the parent metadata
 * (paymentType / isConditional / maxCoaches). Per-split reproducibility
 * already lives in the split row itself via existing snapshot columns
 * (weightageBasisPoints, baseAmountCents, conditionId, trainerTierId,
 * slotIndex). The version row is the audit anchor — it answers "which save
 * produced this split?" — not the rate table.
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
import { serviceCategories } from "./service-categories";

export const categoryCommissionConfigVersions = pgTable(
	"category_commission_config_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// Stable identity (FK to service_categories — config row's UUID is unstable
		// because upsert is DELETE-then-INSERT).
		categoryId: uuid("category_id")
			.notNull()
			.references(() => serviceCategories.id, { onDelete: "cascade" }),
		// Post-save category_commission_configs.id — nullable because the row
		// may have been deleted/replaced by a later save.
		configId: uuid("config_id"),
		versionNumber: integer("version_number").notNull(),
		// Mirrored metadata (reflects category_commission_configs columns)
		paymentType: text("payment_type").notNull(),
		isConditional: boolean("is_conditional").notNull().default(false),
		maxCoaches: integer("max_coaches").notNull().default(1),
		// Agent 3.4 — mirror commission-cap fields so version snapshots
		// preserve cap history alongside the rest of the config metadata.
		maxPerCycleCents: integer("max_per_cycle_cents"),
		excludeIfDiscountAbovePct: integer("exclude_if_discount_above_pct"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		// 'system' when the DB trigger is the author; can be updated post-tx
		// by the service layer if actor info is needed.
		createdBy: text("created_by").notNull().default("system"),
	},
	(t) => ({
		categoryVersionUnique: uniqueIndex(
			"commission_config_versions_category_version_unique",
		).on(t.categoryId, t.versionNumber),
		categoryIdx: index("commission_config_versions_category_idx").on(
			t.categoryId,
		),
	}),
);
