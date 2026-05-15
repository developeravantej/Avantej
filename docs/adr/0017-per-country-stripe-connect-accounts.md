# ADR 0017 — Per-Country Stripe Connect Accounts

Date: 2026-05-15
Status: Accepted

## Context

Phase 1-3 of Plan B onboarded ONE Stripe Connect Standard account per organization, with the account id stored on `organizations.stripe_connect_account_id`. This worked while Avantej only operated in Malaysia (single platform jurisdiction, single tenant country).

Reality check: target franchises operate across countries (MY / SG / TH branches under one franchise brand). Stripe Connect Standard accounts are **country-locked**:
- An MY-based acct charges natively in MYR; SGD/THB charges go through Stripe's auto-FX with ~2% fee + restrictions.
- Settlement is always in the acct's country currency.
- KYC / tax / banking are jurisdiction-specific.

For franchises with multi-country operations, the correct model is one Stripe acct per country (= per legal entity in that country, since franchises typically have one local entity per country for tax compliance).

## Decision

Introduce `org_country_stripe_accounts(organization_id, country_code, stripe_account_id, currency, charges_enabled, payouts_enabled, details_submitted, status, ...)` as the source-of-truth for tenant Connect accounts. Each row is one country's acct for one org.

Resolution at charge time:
- `appointment.branch_id` → `hierarchy_nodes.country_node_id` (denormalized FK from Phase G0) → country node's `name` → ISO 3166-1 alpha-2 code via `nameToCountryCode` mapping.
- `getConnectAccountForOrgCountry(orgId, countryCode, db)` reads `org_country_stripe_accounts`; if no row, falls back to legacy `getConnectAccountForOrg` (with `console.warn`).

OAuth flow updates (Phase 4.3):
- State now encodes optional countryCode as a 4-part HMAC payload (`orgId.country.ts.sig`). Legacy 3-part state still accepted on verify.
- `createOnboardingUrl` accepts optional `countryCode` → adds `stripe_user[country]=<CC>` to the OAuth authorize URL so the hosted onboarding form pre-fills the country.
- OAuth callback reads countryCode from state, pre-seeds an `org_country_stripe_accounts` row keyed on `(org, country)`. The `account.updated` webhook then keeps it in sync with Stripe's view.

Caller migration (Phase 4.4):
- `createPaymentIntent` + `sendPaymentLink` → branch-country resolver.
- `refund` → snapshot only (ADR-0014).
- `createSetupIntent` + `chargeSavedCard` + `listSavedCards` → customer's snapshot acct (saved PMs are scoped to the acct that issued the SetupIntent).
- `purchasePackage` → legacy for now, TODO for v2 to derive country from service_prices or customer's primary branch.

UI (Phase 4.3 UI):
- `/billing/connect` rewritten from single-account view to multi-country list. Each country's account is a row with status, flags, and "Continue onboarding" button. "Add country" dialog lets tenant pick a new country to onboard (from a supported-countries table — MY/SG/TH/ID/PH/HK/AU/NZ/US/GB/JP).

Legacy `organizations.stripe_connect_account_id` is preserved for a 1-release deprecation window. All callers now read via the country-aware helper (which falls back to legacy with a warn). Future cleanup (Phase 4.5) will drop the column after verifying no remaining callers / scripts hit it directly.

## Consequences

Positive:
- Multi-country franchises can onboard one Stripe acct per country, settle in native currency, comply with local tax/KYC.
- Each country's KYC restrictions surface as `chargesEnabled` flag per row — UI can disable charging for that country independently.
- Phase 4 migration is non-destructive: old single-acct orgs continue working via the fallback path.
- Snapshot pattern (ADR-0014) makes the migration safe for historical reconciliation.

Negative:
- Tenants with branches in N countries must complete onboarding N times.
- Cross-country tax / commission policy doesn't have a Stripe-level enforcement point — must be tenant policy.
- Country resolution depends on hierarchy node `name` matching the static ISO mapping (`nameToCountryCode`). Tenants who name their country nodes "MYS" or "M'sia" will fall through to legacy. Documented in code; should be standardized at hierarchy seed time.

## Alternatives considered

- **One global Stripe acct + auto-FX** — rejected because cross-currency settlement adds ~2% FX fee and Stripe has country-specific restrictions on what currencies can be charged on which platforms. Real-world cost would be paid by either Avantej (eating fee) or tenant (passed through, customer-visible).
- **Per-branch acct (not per-country)** — rejected as too granular. Each branch in the same country is typically the same legal entity sharing one bank account.
- **Defer to product market expansion** — rejected because the schema cost of doing it now is small (one new table + one helper), and migrating later (with historical charges already in flight) is much more expensive.
