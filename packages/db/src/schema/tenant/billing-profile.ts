/**
 * Tenant Billing Profile
 *
 * Singleton row (id = 'singleton') holding the legal identity printed on
 * invoices and receipts: legal name, SSM registration number, document
 * address, footer note, and the R2 key of the uploaded logo. The tenant DB is
 * per-organization, so one row covers the whole org. Absent row = fall back
 * to the control-panel organization name with no logo / reg-no line.
 *
 * logo_content_type lives here because the R2 binding surface only exposes
 * arrayBuffer() — the MIME type can't be recovered from the object itself.
 */

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const orgBillingProfile = pgTable("org_billing_profile", {
	id: text("id").primaryKey().default("singleton"),
	legalName: text("legal_name"),
	registrationNo: text("registration_no"),
	address: text("address"),
	footerNote: text("footer_note"),
	logoKey: text("logo_key"),
	logoContentType: text("logo_content_type"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});
