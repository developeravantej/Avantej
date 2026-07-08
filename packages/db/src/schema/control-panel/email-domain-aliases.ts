/**
 * Control Panel — Curated sending-address aliases per email_domain.
 *
 * Resend itself doesn't have an "alias" concept — once a domain is verified,
 * sends can come from ANY `<local-part>@<domain>`. This table is purely a
 * UI/UX layer: tenants curate the local-parts they actually want their flows
 * to use (e.g. "support", "noreply", "billing"), so callers can pick one
 * by label instead of hardcoding strings.
 *
 * The send helper resolution chain stays:
 *   params.localPart > resolved(aliasLabel) > email_domains.defaultLocalPart > "support"
 */

import {
	pgTable,
	uuid,
	text,
	timestamp,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { emailDomains } from "./email-domains";

export const emailDomainAliases = pgTable(
	"email_domain_aliases",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		emailDomainId: uuid("email_domain_id")
			.notNull()
			.references(() => emailDomains.id, { onDelete: "cascade" }),
		localPart: text("local_part").notNull(),
		// Optional human label (e.g. "Support team", "Marketing blasts"). Callers
		// can pass this to sendTenantEmail({ aliasLabel: ... }) to pick the alias.
		label: text("label"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		emailDomainIdIdx: index("email_domain_aliases_domain_idx").on(
			table.emailDomainId,
		),
		// Two aliases on the same domain can't share a local-part.
		domainLocalPartUniqueIdx: uniqueIndex(
			"email_domain_aliases_domain_local_unique_idx",
		).on(table.emailDomainId, table.localPart),
	}),
);

export const emailDomainAliasesRelations = relations(
	emailDomainAliases,
	({ one }) => ({
		emailDomain: one(emailDomains, {
			fields: [emailDomainAliases.emailDomainId],
			references: [emailDomains.id],
		}),
	}),
);
