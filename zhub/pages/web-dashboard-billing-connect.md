# Billing — Stripe Connect (Multi-Country)

**Route:** `/billing/connect`
**File:** `apps/web/src/routes/_authenticated/billing.connect.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-15

---

## 1. What It Does

**Purpose (user perspective):** Tenant admin onboards Stripe Connect accounts for each country their business operates in (one acct per country, settled in native currency). Page lists existing country accounts with verification flags + an "Add country" dialog for new onboarding.

**Produces:**
- OAuth redirect to `connect.stripe.com/oauth/authorize` (with optional `stripe_user[country]` prefill)
- After successful onboarding callback: pre-seeded `org_country_stripe_accounts` row + verified `account.updated` flags via webhook

**On success:** Card row shows green "Active" badge, "Charges enabled = Yes / Payouts enabled = Yes". Polled at 3s while `?return=1` is in URL until webhook flips state.

**On failure / error states:**
- `?oauth_error=<reason>` → toast.error with message
- `?refresh=1` → toast.info "Onboarding link expired — generate a new one"
- Stripe-side restrictions surface as `chargesEnabled=false`; UI shows "Onboarding incomplete" badge + "Continue onboarding" button

---

## 2. How It Works

**Execution flow:**
1. `useAuth` returns user → derive `currentOrganizationId` from `user.current_organization_id || user.organizations[0]?.id`
2. `stripeConnect.listCountryAccounts({ organizationId })` query → list of country acct rows
3. Render `<CountryAccountCard>` per row (status badge + 3 flag cells + Continue button if pending)
4. "Add country" button opens `<AddCountryDialog>` with country `<Select>` filtered to non-linked countries
5. On submit → `stripeConnect.createOnboardingUrl({ organizationId, countryCode })` → `window.location.assign(onboardingUrl)`
6. Stripe handles OAuth → redirects to `/api/stripe/connect/oauth/callback?code=&state=&country=`
7. Server callback verifies state HMAC, exchanges code for `stripe_user_id`, UPSERTs `org_country_stripe_accounts` row, redirects to `/billing/connect?return=1&country=<CC>`
8. Webhook (`/webhooks/stripe/connect`) handles `account.updated` → mirrors verification flags into the same row
9. UI polls until `chargesEnabled=true`

**Inputs:**
- URL search params: `return=1`, `refresh=1`, `oauth_error=<reason>`, `country=<CC>`
- User session (current organization)

**State management:**
- TanStack Query (`["stripe-connect-countries", organizationId]`)
- Local state: `addOpen` (dialog open flag), `selected` (country code in dialog)

**Outputs:**
- `org_country_stripe_accounts` row per country (control-panel DB)
- Webhook-driven UI updates

**Side effects:**
- Stripe Connect OAuth flow (out-of-app navigation)
- Background webhook deliveries from Stripe

---

## 3. What Depends On It

| Caller | Path | Why |
|--------|------|-----|
| Charge procs (`payments.createPaymentIntent`, `payments.sendPaymentLink`) | `apps/server/src/routers/payments.ts` | Resolve Connect acct per branch country at charge time |
| POS sales (`payments.createSalesOrderPaymentLink`) | same | Same — links sales orders to country-aware acct |
| Webhook handler (account.updated) | `apps/server/src/routes/webhooks.routes.ts` | Mirrors verification flags into the table read by this page |

---

## 4. What It Depends On

| Dependency | Type | Path |
|------------|------|------|
| `stripeConnect.listCountryAccounts` | oRPC procedure | `apps/server/src/routers/stripe-connect.ts` |
| `stripeConnect.createOnboardingUrl` | oRPC procedure | same |
| OAuth callback handler | Hono route | `apps/server/src/routes/stripe-connect-oauth.routes.ts` |
| `org_country_stripe_accounts` | Control-panel table | `packages/db/src/schema/control-panel/org-country-stripe-accounts.ts` |
| HMAC state helpers | Web Crypto | `apps/server/src/routers/stripe-connect.ts` (`signOAuthState` / `verifyOAuthState`) |
| `STRIPE_CONNECT_CLIENT_ID` | env var | `.dev.vars` / production env |
| `BETTER_AUTH_SECRET` | env var | HMAC signing key for OAuth state |
| `WEB_APP_URL` | env var | Used in OAuth callback redirect |

---

## 5. Gotchas / Limitations

- **Country-locked Stripe accounts.** Each acct is country-locked at Stripe's side. Re-onboarding to fix a wrong country choice requires dissolving the Stripe-side acct (manual via Stripe support) before retrying.
- **Phase 4 legacy fallback.** `organizations.stripe_connect_account_id` still exists as fallback for orgs not yet migrated. The `listCountryAccounts` proc does NOT surface that fallback as a synthetic row — orgs that only have the legacy acct see an empty list and must re-onboard via this page (which writes to the new table). Phase 4.5 (deferred) will drop the legacy column after a 1-release window.
- **OAuth state TTL.** State expires after 60 min. Slow onboarders (Stripe form takes >60 min) get `?oauth_error=invalid_state`. Mitigation: state is replayable if re-clicked from the same page.
- **No country re-selection in UI.** Once a country is linked, it disappears from the "Add country" dialog. Future: allow re-onboarding for the same country (e.g. tenant changed legal entity).
- **Webhook race.** Account flags pre-seeded by OAuth callback (`stripeConnectStatus = "pending"`) get overwritten by the first `account.updated` event. Brief window where UI shows `Pending` before flipping to `Active`. 3s polling masks this.

---

## 6. Related Docs

- ADR-0001 — Direct Charges on Connect (foundation)
- ADR-0008 — Tenant Connect Onboarding (original single-acct design, superseded by ADR-0017 for multi-country)
- ADR-0017 — Per-Country Stripe Connect Accounts (this page's architecture)
- ADR-0014 — Refund Snapshot Pattern (why country resolution doesn't override historical snapshots)
- `shared/api-overview.md` — full list of `stripeConnect.*` procedures
