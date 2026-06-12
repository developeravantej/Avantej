// packages/db/src/schema/tenant/promotions.ts

/**
 * Tenant Promotions Schema
 *
 * Discount/promotion management. Managers create codes (e.g. NEWMEMBER20 for 20% off)
 * that can be applied at checkout in sales orders.
 *
 * Value encoding:
 * - type = "percentage" → value stored as basis points: 2000 = 20.00%, 850 = 8.50%
 * - type = "fixed_amount" → value stored in cents: 1000 = RM 10.00
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
	pgEnum,
	jsonb,
} from "drizzle-orm/pg-core";
import { hierarchyNodes } from "./hierarchy";
import { salesOrders } from "./sales-orders";

export const promotionTypeEnum = pgEnum("promotion_type", [
	"percentage",
	"fixed_amount",
	"free_item",
	"buy_x_get_y",
]);

export const promotions = pgTable(
	"promotions",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Unique redemption code (case-insensitive comparison done in service layer)
		code: text("code").notNull(),

		name: text("name").notNull(),
		description: text("description"),

		type: promotionTypeEnum("type").notNull(),

		// For "percentage": basis points (2000 = 20%)
		// For "fixed_amount": amount in cents (1000 = RM 10)
		value: integer("value").notNull(),

		// Minimum cart value required (in cents). 0 = no minimum.
		minimumOrderAmount: integer("minimum_order_amount").notNull().default(0),

		// Maximum discount cap for percentage discounts (in cents). null = uncapped.
		maximumDiscount: integer("maximum_discount"),

		// Total times this promotion can be redeemed across all customers — null = unlimited
		usageLimit: integer("usage_limit"),
		usageCount: integer("usage_count").notNull().default(0),

		// Max times one customer can use this promotion (1 = one-time use per customer)
		perCustomerLimit: integer("per_customer_limit").default(1),

		// Validity window
		validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
		validUntil: timestamp("valid_until", { withTimezone: true }), // null = never expires

		isActive: boolean("is_active").notNull().default(true),

		// Branch restriction — null = valid at all branches
		branchId: uuid("branch_id").references(() => hierarchyNodes.id, {
			onDelete: "set null",
		}),

		// UUID arrays of product/service IDs this applies to — null = all
		applicableProductIds: jsonb("applicable_product_ids").$type<string[]>(),
		applicableServiceIds: jsonb("applicable_service_ids").$type<string[]>(),

		// member.userId who created this promotion
		createdBy: text("created_by").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		codeIdx: uniqueIndex("promotions_code_idx").on(table.code),
		isActiveIdx: index("promotions_active_idx").on(table.isActive),
		validDatesIdx: index("promotions_valid_dates_idx").on(
			table.validFrom,
			table.validUntil,
		),
		branchIdx: index("promotions_branch_idx").on(table.branchId),
		typeIdx: index("promotions_type_idx").on(table.type),
	}),
);

export const promotionUsages = pgTable(
	"promotion_usages",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		promotionId: uuid("promotion_id")
			.notNull()
			.references(() => promotions.id, { onDelete: "cascade" }),

		// Either member.userId (for member customers) or walk_in_customers.id (for walk-ins)
		customerId: text("customer_id").notNull(),

		// Migration 0046: migrated from text → uuid with FK to sales_orders.
		// ON DELETE RESTRICT: prevent deleting a sales order that has promotion usages.
		salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, {
			onDelete: "restrict",
		}),

		// How much discount was actually applied (in cents, post cap)
		discountAmount: integer("discount_amount").notNull(),

		usedAt: timestamp("used_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		promotionIdIdx: index("promo_usages_promo_idx").on(table.promotionId),
		customerIdx: index("promo_usages_customer_idx").on(table.customerId),
		// Non-unique lookup index (migration 0046)
		salesOrderLookupIdx: index("promotion_usages_sales_order_idx").on(
			table.salesOrderId,
		),
		// One promotion per customer per sales order (unique index recreated in 0046 with uuid type)
		uniqueCustomerOrderPromo: uniqueIndex(
			"promo_usages_unique_customer_order",
		).on(table.promotionId, table.customerId, table.salesOrderId),
	}),
);
