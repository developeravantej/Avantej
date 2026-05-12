# Schema Drift Audit
**Session:** 04-24_11-22_web-modularity-refactor
**Findings:** 3 (1 critical · 0 high · 0 medium · 0 low · 2 info)

## Findings

### [CRITICAL] `organizations.defaultCurrency` does not exist
**Plan claims:** Section 3.4 / 6 / Phase 6 risks: `moneyColumn` default currency pulls from `useUserContext().currentOrganization.defaultCurrency`; plan §6 "Nullable/optional assumptions" says to "verify in `packages/db/src/schema/control-panel/organizations.ts` during task 1.5. If nullable, hard-fallback to `"MYR"`."
**Actual:** The `organizations` table has NO `defaultCurrency` column at all. Columns present: `id, name, slug, neonProjectId, connectionString, subscriptionId, paymentStatus, createdAt, updatedAt, ownerUserId, stripeConnectAccountId, stripeConnectStatus, stripeConnectAccountType, stripeConnectOnboardingCompletedAt, schemaVersion`. A project-wide grep for `defaultCurrency|default_currency` returned only the plan file itself — zero hits in schema, services, API, or web code. The assumed per-tenant currency source does not exist.
**File:** `packages/db/src/schema/control-panel/organizations.ts:14-40`
**Fix:** Either (a) scope-extend the plan to add `defaultCurrency text default 'MYR' not null` to `organizations` (DB migration — breaks the "web-only" claim, see INFO below), or (b) hard-fallback `moneyColumn` to `"MYR"` and remove references to `organizations.defaultCurrency` / `currentOrganization.defaultCurrency` throughout §3.4, §6 "Nullable/optional assumptions", and §6 domain-breakage table. Recommended: option (b) to preserve web-only scope; revisit multi-currency in a dedicated session.
---

### [INFO] Plan introduces no migrations / enums / columns / FKs — confirmed (with one caveat)
**Plan claims:** "Scope — Out: Backend/services/API changes." Phases 1–7 list only `apps/web/src` paths. §7 "Performance & Scalability" items 1–9 all N/A for DB.
**Actual:** Verified — no phase task modifies `packages/db`, `drizzle*.config.ts`, or `apps/server/src/schema`. Files created/modified are all under `apps/web/src/`. The only DB-schema mention is the read-only nullability check on `organizations.defaultCurrency` (see CRITICAL above). Caveat: if the team resolves the CRITICAL via option (a), the web-only claim breaks and this plan would silently expand into a migration session.
**File:** `zplan/04-24_11-22_web-modularity-refactor/plan/plan.md:47-57, 199-349`
**Fix:** Keep scope as-is; resolve CRITICAL via hard-fallback path to preserve the invariant.
---

### [INFO] Basis-points convention is already established in existing schemas
**Plan claims:** §3.3 introduces `zPercentageBp = z.number().int().min(0).max(10_000); // basis points`.
**Actual:** The basis-points convention (integer, 10000 = 100%) is already used in tenant schemas: `packages/db/src/schema/tenant/tax-rates.ts:9,40` (rate in bp), `packages/db/src/schema/tenant/promotions.ts:10,48` (percentage type stored as bp, 2000 = 20%), `packages/db/src/schema/tenant/commission-tier-rates.ts:14` (variable payment type bp), `packages/db/src/schema/tenant/installment-plans.ts:50` (price premium bp), and the migration file `packages/db/src/migrate-tenant.ts:2068` (commission percentage comment). `zPercentageBp` aligns perfectly — no drift.
**File:** `packages/db/src/schema/tenant/tax-rates.ts:9`; `packages/db/src/schema/tenant/promotions.ts:10`
**Fix:** No fix needed. Consider adding a JSDoc to `zPercentageBp` citing these existing schemas so frontend devs see the source of truth.
---

## Summary
One critical issue: the plan builds `moneyColumn`'s default-currency behavior on `organizations.defaultCurrency`, a column that does not exist anywhere in the schema or codebase. Either the web-only scope must be broken to add the column + migration (not recommended — expands blast radius materially), or §3.4 / §6 references must be replaced with a hardcoded `"MYR"` fallback. Otherwise, the plan correctly avoids DB changes, and its `zPercentageBp` basis-points convention mirrors existing tenant-schema usage in `tax-rates`, `promotions`, `commission-tier-rates`, and `installment-plans` — so that validator is drift-free.
