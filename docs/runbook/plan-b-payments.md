# Plan B — Payments Operations Runbook

How to operate, debug, and reason about Plan B (Stripe Connect + payments) in
this codebase. Reading order: 1 → 2 → 3 → 4 → 5. Each section answers
a specific operational question.

---

## 1. Mental Model

Two payment domains, two Stripe accounts, two webhook endpoints:

| Domain | Who pays whom | Stripe account | Webhook endpoint |
|--------|---------------|----------------|------------------|
| **Layer 1** (Plan A) | Tenant → Avantej (SaaS) | Platform acct (`acct_1TWp7uB3sd6uw5s6` in dev-shared) | `POST /webhooks/stripe/platform` |
| **Layer 2** (Plan B) | Customer → Tenant (services/packages) | Connected acct per tenant per country (`acct_1TWwNZGk6ShaTZfV` for `test-fitness-franchise` MY) | `POST /webhooks/stripe/connect` |

The platform acct charges tenants for SaaS. Each tenant has 1+ connected accounts (one per country, see ADR-0017). The connected accounts charge end-customers; Avantej takes `application_fee_amount` per tier.

Resolution path at charge time:
```
appointment.branch_id
  -> hierarchy_nodes.country_node_id (tenant DB)
  -> hierarchy_nodes(country).name
  -> ISO 3166-1 alpha-2 (via nameToCountryCode)
  -> org_country_stripe_accounts(org_id, country_code)
  -> stripe_account_id
```

For saved cards (off-session): use `customer_profiles.stripe_connect_account_id_snapshot` instead — saved PMs are scoped to the acct that issued the SetupIntent (ADR-0014).

---

## 2. Local Development Setup

### Required terminals (3)

```bash
# T1 — Platform webhook listener (SaaS subscription events)
cd apps/server
make stripe-listen-platform
# Forwards customer.subscription.* + invoice.* + checkout.session.completed
# from your dev-shared platform account to localhost:3000/webhooks/stripe/platform

# T2 — Connect webhook listener (per-tenant events)
cd apps/server
make stripe-listen-connect
# Forwards payment_intent.* + charge.refunded + account.updated + payout.*
# + setup_intent.succeeded from ALL connected accounts to
# localhost:3000/webhooks/stripe/connect

# T3 — Dev server
bun dev
# Wrangler on :3000 (server), Vite on :3001 (web)
```

T1+T2 each print a `whsec_...` on startup. These MUST match `.dev.vars`:
- `STRIPE_PLATFORM_WEBHOOK_SECRET`
- `STRIPE_CONNECT_WEBHOOK_SECRET`

If they don't match, webhook signature verification will fail with 400 and the dedupe table will stay empty for the event.

### One-time tenant DB migration after pulling Plan B

Plan B added 3 tenant migrations (0060, 0061, 0062) and 1 control-panel migration (0019). The global migrate-all-tenants.ts runner has known drift on 0052 — use the per-org scripts instead:

```bash
cd apps/server

# Control-panel (one-shot, all orgs share this DB):
psql "$DATABASE_URL" -f packages/db/src/migrations/control-panel/0019_org_country_stripe_accounts.sql

# Tenant DBs (per-org, one of these per org):
bun run scripts/apply-migration-0060.ts <orgId>  # appointment payment columns
bun run scripts/apply-migration-0061.ts <orgId>  # customer_profile stripe fields
bun run scripts/apply-migration-0062.ts <orgId>  # payments link_url + snapshot

# After migrating, backfill org_country_stripe_accounts from legacy field:
bun run scripts/backfill-org-country-stripe-accounts.ts
```

### One-time Stripe sandbox setup

1. Use `dev-shared` sandbox (acct `acct_1TWp7uB3sd6uw5s6`).
2. Enable Connect: Dashboard → Connect → Get started. Pick Direct Charges, Hosted Onboarding, Stripe Dashboard for sellers. See ADR-0001.
3. Configure OAuth: Connect → Settings → OAuth → Set redirect URI to `http://localhost:3000/api/stripe/connect/oauth/callback`, enable OAuth. Copy `ca_...` client ID → `.dev.vars` as `STRIPE_CONNECT_CLIENT_ID`.
4. Seed SaaS products (one-time): `cd apps/server && bun stripe:seed`. Copies output prices into `.dev.vars` as `STRIPE_PRICE_BASIC` / `_PROFESSIONAL` / `_ENTERPRISE`.

---

## 3. Common Operations

### Onboard a new tenant (test mode)

Tenant clicks "Add country" on `/billing/connect`. Picks country. Fills Stripe-hosted form (test data is fine). After submit, redirected back. Country card flips Active within seconds of webhook delivery.

Faster shortcut for dev: `bun run scripts/seed-dev-connect.ts` re-links a previously-onboarded acct after DB resets. Mapping is in the script's `DEV_CONNECT_MAP`.

### Bump a test appointment's price so Stripe accepts the charge

Stripe minimum is ~50 cents. Test data often has session_total=1. Bump:

```bash
bun run apps/server/scripts/seed-test-appointment.ts <orgId> <appointmentId>
```

Sets `session_total = 10000` (RM100).

### Inspect a payment's state

```bash
bun run apps/server/scripts/inspect-appointment.ts <orgId> <appointmentId>
```

Returns all payment columns: status, paid_at, PI id, link URL, snapshot acct, etc.

### Trigger a payment_intent.succeeded webhook against a stale event

The dedupe table prevents replay by design. To force re-process:

```bash
# Clear the dedupe row first
psql "$DATABASE_URL" -c "DELETE FROM processed_webhook_events WHERE event_id = 'evt_XXX';"
# Then resend from Stripe Dashboard: Workbench → Events → click event → Resend
```

### Refund a paid appointment

UI: open appointment dialog → PaymentSection → "Refund" button → confirm.

Or via curl-against-orpc with session cookie (Playwright spec 96 shows the pattern). Refund uses `appt.stripe_connect_account_id_snapshot` — NEVER the country resolver (ADR-0014).

---

## 4. Debugging Recipes

### Webhook arrived but appointment didn't flip to paid

Check in this order:

1. **T2 terminal** — did Stripe CLI even forward the event? If no, listener filter doesn't include `payment_intent.succeeded`; see Makefile target.
2. **Wrangler T3** — did the request reach the server? Look for `[connect webhook] payment_intent.succeeded` log line + `rowsUpdated=N` count.
3. **`rowsUpdated=0`** — handler ran but UPDATE found no row to match. Common causes:
   - `metadata.appointmentId` empty on the PI. **Payment Link metadata does NOT propagate to the PI automatically** — must pass `payment_intent_data.metadata` at link create (see ADR-0015).
   - Appointment row already in non-pending state.
4. **Dedupe row exists with `error` set** — handler threw. Read the `error` text, fix the bug, clear the row, replay.
5. **Dedupe row exists with no error, `processed_at` set** — handler ran successfully but the body of the handler was a no-op (e.g. metadata missing → warn + skip). Re-run with fixed code; clear dedupe first.

### "Cannot perform I/O on behalf of a different request" Workers error

Tenant DB singleton being reused across requests. Fix: use `getControlPanelDb(c)` from request-scoped context. The webhook handler + all oRPC procs already do this. If you see this error on a NEW path, check that path doesn't import the deprecated `controlPanelDb` singleton from `@/lib/db`.

### Refund returns 400 from Stripe

Most common: `stripeAccount` passed to refunds.create doesn't match the acct that issued the original charge. Snapshot column was added in Phase 2 specifically to prevent this. If refund proc throws, check `appt.stripe_connect_account_id_snapshot` is non-null — if it IS null (legacy data pre-snapshot), refund must be issued manually via Stripe Dashboard.

### OAuth state HMAC mismatch

`[oauth-state] HMAC mismatch (likely BETTER_AUTH_SECRET changed)` log line means the secret used to sign and verify differs. Most common cause: wrangler restarted between sign and verify, with `.dev.vars` reloaded but session state cached. Restart bun dev cleanly + re-click "Connect Stripe" to issue fresh state.

### Charge saved card returns `requires_action`

Off-session charge hit SCA / 3DS challenge. In v1 we surface this to staff via toast and let them resolve out-of-band (call customer, ask them to confirm 3DS on the bank app). No in-app 3DS challenge UI yet (deferred to future phase per ADR-0016).

---

## 5. Schema Cheat Sheet

| Table | Database | Key columns | Purpose |
|-------|----------|-------------|---------|
| `subscriptions` | control-panel | `stripe_subscription_id`, `tier`, `status` | Plan A SaaS subs (tenant pays Avantej) |
| `organizations` | control-panel | `stripe_connect_account_id` (legacy, Phase 4.5 drops it) | Legacy single-acct |
| `org_country_stripe_accounts` | control-panel | `organization_id`, `country_code`, `stripe_account_id`, `currency` | Phase 4 per-country Connect accts |
| `processed_webhook_events` | control-panel | `event_id`, `source`, `processed_at`, `error` | Idempotency / dedupe |
| `appointments` | tenant | `stripe_payment_intent_id`, `payment_status`, `paid_at`, `payment_link_url`, `stripe_connect_account_id_snapshot`, `application_fee_amount`, `currency` | Phase 2 — one charge per appt |
| `customer_profiles` | tenant | `stripe_customer_id`, `default_payment_method_id`, `stripe_connect_account_id_snapshot` | Phase 3d — card-on-file |
| `payments` | tenant | `stripe_payment_intent_id`, `status`, `payment_link_url`, `stripe_connect_account_id_snapshot` | POS-side payment authoritative record |
| `package_instances` | tenant | `payment_id`, `payment_status`, `status`, `credits_total/used/remaining` | Phase 3c — package purchase |

### Snapshot pattern (ADR-0014)

`stripe_connect_account_id_snapshot` columns on `appointments`, `payments`,
and `customer_profiles` MUST be populated at charge / setup time. Refunds and
saved-card charges read these — never the country resolver — because the
resolved acct can change between charge and refund (branch reassignment,
multi-country onboarding) but Stripe rejects cross-acct refunds.

---

## 6. Phase Reference

| Phase | Commit | What it ships |
|-------|--------|---------------|
| 1 | `decde96` | Connect onboarding (OAuth, MY) |
| 2 backend | `7e2621b` | createPaymentIntent + sendPaymentLink + getPaymentStatus |
| 2 UI + I/O fix | `d529f55` | PaymentSection + ChargeDialog + request-scoped DB fix |
| 3a + 3b | `51951fc` | Side effects (auto-confirm + receipt) + refunds |
| 3d backend | `48634fa` | SetupIntent + listSavedCards + chargeSavedCard |
| 3d.1 UI + 3c backend | `d164cd3` | SavedCardsSection + purchasePackage |
| 4.1 | `b5a36a2` | org_country_stripe_accounts table + backfill |
| 4.2 | `d7b186d` | Country resolver + webhook mirror |
| 3c.1 | `b4186c6` | POS Stripe Payment Link |
| 4.4 | `477ceff` | Migrate remaining callers to country-aware |
| 3d.2 | `4f66315` | Charge-saved-card UI button |
| 4.3 BE | `3c19209` | Per-country onboarding backend |
| 4.3 UI | `5f16d17` | Per-country onboarding UI rewrite |
| ADRs | (in this session) | 0013-0017 documenting Phase 3-4 decisions |
| Tests | (in this session) | 21 unit tests for pure functions |

Deferred:
- **4.5** — drop legacy `organizations.stripe_connect_account_id` (1-release window)
- Integration tests for procs needing DB
- SCA challenge UI for 3DS-required cards
- Idempotency on Payment Link regenerate (currently orphans the old link on Stripe side)
- Partial refunds

---

## 7. Glossary

- **Connect** — Stripe Connect, multi-party payment platform feature.
- **Standard account** — Connected account type where the seller has their own Stripe Dashboard + handles their own KYC. Only Connect account type available for MY platforms (Express + Custom in private beta).
- **Direct Charge** — Charge created directly on the connected account (`stripeAccount` header). Statement descriptor + dispute / refund authority sits with the seller. See ADR-0001.
- **application_fee_amount** — How Avantej (platform) collects revenue on each Direct Charge. Per-tier basis points (3% / 2% / 1.5%). See ADR-0002.
- **Off-session** — Payment confirmation where customer is not present (e.g. membership renewal). Requires card collected via SetupIntent with usage="off_session". See ADR-0016.
- **SCA** — Strong Customer Authentication (3DS). PSD2 / EU regulation; some MY-issued cards also require. v1 surfaces "requires_action" status to staff for manual resolution.
- **OAuth state** — HMAC-signed token in OAuth authorize URL. Encodes orgId + optional countryCode. Prevents CSRF / cross-tenant replay. See `signOAuthState` in `apps/server/src/routers/stripe-connect.ts`.
- **Snapshot pattern** — `stripe_connect_account_id_snapshot` column on payment-tracking tables. Authoritative for refunds / saved-card charges. See ADR-0014.
