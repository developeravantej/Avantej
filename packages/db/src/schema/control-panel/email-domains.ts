/**
 * Control Panel — Per-tenant Resend sending domains
 *
 * Each row is an org's sending domain (e.g. `mail.movefitness.com`) registered
 * with the platform's single Resend account. DNS records are returned by
 * `resend.domains.create()` and snapshotted here so the tenant UI can render
 * them without re-fetching Resend. Sends are gated on `status === "verified"`.
 *
 * Lives in control-panel DB (not tenant) so the webhook handler can resolve
 * tenant routing before any tenant-DB connection is established, and so admin
 * + billing views can aggregate across orgs.
 */

import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const emailDomains = pgTable("email_domains", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	// Resend domain id (e.g. "d_xxx") — unique per Resend account.
	resendDomainId: text("resend_domain_id").notNull().unique(),
	// The sending domain itself (e.g. "mail.movefitness.com").
	domain: text("domain").notNull(),
	// Default from-name used when building "<fromName> <support@domain>".
	fromName: text("from_name").notNull(),
	// Default local-part for the sender address (e.g. "support", "noreply").
	// Nullable on purpose — null means "fall through to the platform default
	// 'support'", which is distinct from an admin explicitly typing 'support'.
	defaultLocalPart: text("default_local_part"),
	// pending: row created, DNS not yet seen.
	// verifying: verify triggered, waiting for Resend ack.
	// verified: Resend reports SPF/DKIM/DMARC pass; safe to send.
	// failed: verification gave up; tenant must retry.
	status: text("status").notNull().default("pending"),
	// Verbatim DNS records payload from resend.domains.create() — TXT/MX/DKIM/DMARC.
	// Stored as-is so the tenant UI can render rows without re-fetching Resend.
	dnsRecords: jsonb("dns_records"),
	verifiedAt: timestamp("verified_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	organizationIdIdx: index("email_domains_organization_idx").on(table.organizationId),
	statusIdx: index("email_domains_status_idx").on(table.status),
	// One sending domain string per org (a tenant cannot register the same
	// domain twice). Different orgs can theoretically register different
	// subdomains of the same root domain; uniqueness is scoped to (org, domain).
	orgDomainUniqueIdx: uniqueIndex("email_domains_org_domain_unique_idx").on(
		table.organizationId,
		table.domain,
	),
}));

export const emailDomainsRelations = relations(emailDomains, ({ one }) => ({
	organization: one(organizations, {
		fields: [emailDomains.organizationId],
		references: [organizations.id],
	}),
}));
