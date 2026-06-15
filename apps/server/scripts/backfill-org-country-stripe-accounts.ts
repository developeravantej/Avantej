/**
 * Phase 4.5 — Backfill script DEPRECATED.
 *
 * Original purpose: backfill org_country_stripe_accounts from the legacy
 * organizations.stripe_connect_account_id field. That field was dropped in
 * migration 0020 (Phase 4.5), so the source of truth no longer exists.
 *
 * Keeping this stub so:
 *   - The script path doesn't 404 on existing operational runbooks.
 *   - Future maintainers know the migration is one-way (4.1/4.2 already ran;
 *     there's nothing left to backfill).
 *
 * If you need to seed a known test acct after a DB reset, use
 *   apps/server/scripts/seed-dev-connect.ts
 * instead — it writes to org_country_stripe_accounts directly.
 */

console.warn(
	"[deprecated] backfill-org-country-stripe-accounts.ts is a no-op as of Phase 4.5.",
);
console.warn(
	"Use apps/server/scripts/seed-dev-connect.ts to seed test acct linkages.",
);
process.exit(0);
