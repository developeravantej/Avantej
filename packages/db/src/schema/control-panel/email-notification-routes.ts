/**
 * Control Panel — Per-tenant notification → sender routing.
 *
 * One row binds a notification type (member_invitation, payment_receipt,
 * auth_*) for an org to an optional sending-address alias + from-name +
 * subject-line override. Unbound types fall through to the domain default
 * sender. Lives in control-panel DB so routing resolves before any tenant
 * connection (auth callbacks, webhook).
 *
 * Resolution order (see apps/server/src/lib/email-send-tenant.ts):
 *   local-part: params.localPart > route.alias.localPart > params.aliasLabel
 *               > email_domains.defaultLocalPart > "support"
 *   from-name:  params.fromName > route.fromNameOverride > domain.fromName > platform
 *   subject:    route.subjectOverride (rendered + sanitized) > caller subject
 */

import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { emailDomainAliases } from "./email-domain-aliases";

export const emailNotificationRoutes = pgTable("email_notification_routes", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	// member_invitation | payment_receipt | auth_verification |
	// auth_password_reset | auth_magic_link (plain text — house style).
	notificationType: text("notification_type").notNull(),
	// Nullable: null = "use the domain default sender". ON DELETE SET NULL so
	// deleting/re-registering a domain (which cascade-deletes its aliases)
	// silently falls the route back to the default instead of dangling.
	aliasId: uuid("alias_id").references(() => emailDomainAliases.id, {
		onDelete: "set null",
	}),
	fromNameOverride: text("from_name_override"),
	subjectOverride: text("subject_override"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	organizationIdIdx: index("email_notification_routes_organization_idx").on(
		table.organizationId,
	),
	// One route per (org, type) — the upsert conflict target.
	orgTypeUniqueIdx: uniqueIndex("email_notification_routes_org_type_unique_idx").on(
		table.organizationId,
		table.notificationType,
	),
}));

export const emailNotificationRoutesRelations = relations(
	emailNotificationRoutes,
	({ one }) => ({
		organization: one(organizations, {
			fields: [emailNotificationRoutes.organizationId],
			references: [organizations.id],
		}),
		alias: one(emailDomainAliases, {
			fields: [emailNotificationRoutes.aliasId],
			references: [emailDomainAliases.id],
		}),
	}),
);
