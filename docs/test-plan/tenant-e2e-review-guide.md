# Tenant E2E — Review Guide (URLs, credentials, how to run)

Companion to the screenshot suite. The rendered review page
(`docs/test-plan/tenant-e2e-screenshots.html`, **local only — gitignored, embeds
tenant staff PII**) shows 32 journeys with before/after screenshots. This guide
is what a human reviewer needs to **re-run or spot-check** those journeys on
prod.

> ⚠️ **No secrets in this file.** The prod site needs no secrets to test — you
> log in as a user. Local dev needs `.dev.vars`; copy `apps/server/.dev.vars.example`
> and get the real values from the team secret store (1Password/Doppler) — **never
> from git**.

## URLs (prod)

| Purpose | URL |
|---|---|
| **Tenant app (branded — use this)** | https://move.avantej.com |
| Tenant app (generic, same stack) | https://app.avantej.com |
| Backend API | https://api.avantej.com |
| Marketing site (not the app) | https://www.avantej.com |

Any `*.avantej.com` except `www` resolves to the tenant app via the wildcard
route. The tenant shown is decided by **who you log in as** (Host→tenant binding
= Phase B, not yet built), so `move.avantej.com` + the MOVE login below = the
MOVE tenant.

## Credentials (test only)

| Role | Login | Password | Notes |
|---|---|---|---|
| **MOVE tenant owner** | `franchisee@gmail.com` | `password123` | The account every journey uses. Admin of MOVE Private Fitness. |
| Platform admin (control panel) | `developer.avantej@gmail.com` | `password1234` | Cross-tenant / platform-admin surfaces only. |

These are throwaway test credentials (already in `CLAUDE.md`), not real
customer identities. Do not use for anything but testing.

## Tenant data state (what you should see)

MOVE is a freshly-migrated, **pristine** tenant:
- **Reference data present:** 23 branches / 33 hierarchy nodes, 124 staff (114 coaches w/ tiers), 70 services + 4 categories, 3 installment plans (Full / Half 2× / Quarterly 4×), a **0% default tax rate** ("No Tax (SST 0%)" — placeholder; set the real SST before charging tax).
- **Transaction surfaces empty (0-state) on purpose:** 0 customers, 0 sales, 0 commissions, 0 payouts, 0 packages. The `RM 0.00` / "No … found" states are the expected proof the queries are wired to the new Neon branch — do not read them as broken.

## How to run the review

1. **Fast path:** open the screenshot suite and scan the 32 cards (each has the journey steps + before/after shots + a "Reviewed" checkbox that persists):
   ```
   open docs/test-plan/tenant-e2e-screenshots.html
   ```
2. **Live spot-check:** log in at https://move.avantej.com as the MOVE owner, then walk any journey. Each test's `steps[]` in `e2e-web/tenant/run-results.tenant.json` is the click-by-click script.

### Journeys worth a live re-check
- **Scope switcher isolation** — header combobox → country→state→branch tree shows **only MOVE's 23 branches** (tenant isolation). Pick a branch → dashboard/rosters re-scope; reset to "All".
- **The 3 previously-blocked pages** (fixed) — Sales & Payments, Class Slots, Tax Rates should all load (they redirected to `?unauthorized=true` before the RBAC fix).
- **POS write path** — New Sale → member → a Personal Training service → Quarterly installment → Cash → confirm. Assert **per-installment amount** (e.g. RM1,800 of RM7,200), not the full price. Commission for service items is **delivery-deferred** (earns when the session/appointment is delivered to the assigned trainer), so expect 0 commission at point-of-sale.
  > ⚠️ A committed sale writes real rows into the MOVE tenant. Prefer stopping at the Review & Confirm screen, or clean up any test sale afterward.

## Local dev (optional — to run the app yourself)

```
bun install
cp apps/server/.dev.vars.example apps/server/.dev.vars   # then fill real values from the team secret store
bun dev                                                   # web :3021, server :3020
```
Required var names are in `apps/server/.dev.vars.example`. Real values live in the
team secret store and in Cloudflare Worker secrets (`wrangler secret list --env prod`),
**not in git.**
