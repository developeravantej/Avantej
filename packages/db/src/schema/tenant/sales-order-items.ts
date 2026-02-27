import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { salesOrders } from "./sales-orders";
import { products } from "./products";
import { services } from "./services";
import { appointments } from "./appointments";

export const salesOrderItems = pgTable("sales_order_items", {
	id: uuid("id").primaryKey().defaultRandom(),
	salesOrderId: uuid("sales_order_id")
		.notNull()
		.references(() => salesOrders.id, { onDelete: "cascade" }),
	productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
	serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
	appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
	description: text("description").notNull(),
	quantity: integer("quantity").notNull(),
	unitPrice: integer("unit_price").notNull(),
	totalPrice: integer("total_price").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
	salesOrderIdIdx: index("sales_order_items_order_idx").on(table.salesOrderId),
	productIdIdx: index("sales_order_items_product_idx").on(table.productId),
	serviceIdIdx: index("sales_order_items_service_idx").on(table.serviceId),
	appointmentIdIdx: index("sales_order_items_appointment_idx").on(table.appointmentId),
}));
