import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	boolean,
	index,
} from "drizzle-orm/pg-core";
import { salesOrders } from "./sales-orders";
import { products } from "./products";
import { services } from "./services";
import { appointments } from "./appointments";
import { taxRates } from "./tax-rates";

export const salesOrderItems = pgTable(
	"sales_order_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		salesOrderId: uuid("sales_order_id")
			.notNull()
			.references(() => salesOrders.id, { onDelete: "cascade" }),
		productId: uuid("product_id").references(() => products.id, {
			onDelete: "set null",
		}),
		serviceId: uuid("service_id").references(() => services.id, {
			onDelete: "set null",
		}),
		appointmentId: uuid("appointment_id").references(() => appointments.id, {
			onDelete: "set null",
		}),
		// Agent 2.3 — Phase 2 Wave 3b — Journey J2: tax-rate snapshot at line creation
		// Nullable because legacy rows pre-migration won't have it, and zero-tax orders
		// resolve to null. ON DELETE SET NULL preserves history if the rate is deleted.
		taxRateId: uuid("tax_rate_id").references(() => taxRates.id, {
			onDelete: "set null",
		}),
		description: text("description").notNull(),
		quantity: integer("quantity").notNull(),
		unitPrice: integer("unit_price").notNull(),
		totalPrice: integer("total_price").notNull(),
		// Agent 3.3 — Phase 3 §5: per-line commission opt-out. When true, this
		// line never produces a commission_split row (regardless of whether the
		// parent sales_order is complimentary).
		commissionExcluded: boolean("commission_excluded").default(false).notNull(),
		// Migration 0046 — tax snapshot cols. Captured at line creation so receipts
		// reproduce the applied rate even after the tax_rates row is edited.
		// taxRateBps: the rate in basis points at time of sale (e.g. 800 = 8.00%).
		// taxRateCode: human-readable code string (e.g. "SST-6").
		taxRateBps: integer("tax_rate_bps"),
		taxRateCode: text("tax_rate_code"),
		// Phase 1 (sales-pipeline-fixes): when true, commission for this line is
		// deferred until the linked appointment transitions to completed/cancelled.
		// Set by POS for service-line items; products always earn at sale (false).
		commissionDeferred: boolean("commission_deferred").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => ({
		salesOrderIdIdx: index("sales_order_items_order_idx").on(
			table.salesOrderId,
		),
		productIdIdx: index("sales_order_items_product_idx").on(table.productId),
		serviceIdIdx: index("sales_order_items_service_idx").on(table.serviceId),
		appointmentIdIdx: index("sales_order_items_appointment_idx").on(
			table.appointmentId,
		),
		taxRateIdIdx: index("sales_order_items_tax_rate_idx").on(table.taxRateId),
	}),
);
