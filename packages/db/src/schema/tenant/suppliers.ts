import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const suppliers = pgTable("suppliers", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	description: text("description"),
	accountNumber: text("account_number"),
	paymentTerms: text("payment_terms"),
	contactPerson: text("contact_person"),
	contactPhone: text("contact_phone"),
	officePhone: text("office_phone"),
	email: text("email"),
	website: text("website"),
	barcode: text("barcode"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	nameIdx: index("suppliers_name_idx").on(table.name),
	isActiveIdx: index("suppliers_is_active_idx").on(table.isActive),
}));
