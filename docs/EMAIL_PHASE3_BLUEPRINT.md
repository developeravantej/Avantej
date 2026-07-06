# Phase 3 Implementation Blueprint: Resend → Cloudflare Email Sending Migration

## 1. Current State (End-to-End Summary)

Tenants self-onboard a sending domain via **Settings → Email**, which calls `emailDomainsRouter.create` (org-admin gated). This rate-limits (`checkEmailDomainCreateAllowed`: max 10 domains, 5/hour), then calls `resend.domains.create({name, region})` through the thin wrapper `apps/server/src/lib/resend-domains.ts`, persisting an `email_domains` row (control-panel DB) with the Resend `d_xxx` id in `resend_domain_id`, a verbatim `dns_records` JSONB snapshot (TXT/MX/DKIM/DMARC), and `status='pending'`. The tenant copies those DNS records into their provider; `verify` (`resend.domains.verify` + `.get`) and a background cron (`runEmailDomainRefresh` → `verifyResendDomain` + `getResendDomain`) plus a **Svix-signed Resend webhook** (`POST /resend` in `webhooks.routes.ts`) all funnel through `mapResendStatus` → `updateEmailDomainStatus`, flipping the row to `verified` (stamping `verified_at`). Sends are gated on `status==='verified'`: `sendTenantEmail` (`email-send-tenant.ts`) resolves the org's verified domain, computes a from-address via the chain `params.localPart > route.aliasLocalPart > aliasLabel > default_local_part > 'support'` `@domain` with from-name/subject overrides from `email_notification_routes`/`email_domain_aliases`, calls `getResendClient().emails.send({from: "Name <email>", to, subject, html, tags:[organization_id, notification_type]})`, and writes an `email_logs` row keyed by Resend's `re_xxx` message id (webhook idempotency key). The Better-Auth path (`dispatchAuthEmail`) resolves the recipient's primary org, calls `sendTenantEmail` with `allowPlatformFallback:false`, and on any failure falls back to the legacy platform sender. Aliases and notification routes are **pure control-panel DB CRUD with zero Resend calls** — they are already provider-agnostic.

---

## 2. File-by-File Change List

### New files

| File | Change |
|---|---|
| `apps/server/src/lib/cloudflare-domains.ts` | **NEW** — mirror `resend-domains.ts`'s exact 4-function surface: `createDomain`, `getDomain`, `verifyDomain`, `removeDomain`, returning the same `{id, name, status, records[]}` / `{id, name, status, records?}` shapes so `createEmailDomain`/`updateEmailDomainStatus`/`dns_records` persistence stay untouched. Internally: `createDomain` → `POST /zones/{zone}/email/sending/subdomains`; `getDomain` → `GET .../subdomains/{id}`; `verifyDomain` → no-op re-GET (CF has no separate re-check verb); `removeDomain` → `DELETE .../subdomains/{id}` preserving idempotent not-found=success. Add a `throwOnCfError(label, err)` mirroring `throwOnResendError` (`Cloudflare <label> failed: <msg>`). Reads a CF API token + target zone id from env, not `RESEND_API_KEY`. |
| `apps/server/src/lib/cf-domain-status.ts` | **NEW (optional but recommended)** — single `mapCfDomainStatus(cf) → 'pending'|'verifying'|'verified'|'failed'` to replace the two duplicated `mapResendStatus` copies. Derives `verified` when all required cf-bounce SPF/DKIM/DMARC/MX records validate, `verifying` while pending, `failed` on error. |
| `packages/db/src/migrations/control-panel/0037_email_domains_cf_provider.sql` | **NEW** — provider discriminator + CF identity columns (see §4). |

### Changed files

| File | Change |
|---|---|
| `apps/server/src/routers/email-domains.ts` | Replace `RESEND_REGIONS` enum + `region` create-input with a `tier`/`mode` enum (`default` \| `delegated` \| `bare`). Repoint `createResendDomain`→`createDomain`, `verifyResendDomain`/`getResendDomain`→`verifyDomain`/`getDomain`, `removeResendDomain`→`removeDomain` (behind a provider flag during coexistence — see §5). In `verify`, drop the double verify-then-get (CF re-check is a no-op) or keep both harmlessly. Replace inline `mapResendStatus` with the shared `mapCfDomainStatus`. Update `auditEmailDomainChange` `changes` payload key `resendDomainId`→`cfSubdomainId`. Keep `requireOrgAdmin`, `checkEmailDomainCreateAllowed`, aliases, and all notification-routing procedures **unchanged**. |
| `apps/server/src/lib/email-send-tenant.ts` | In the SEND step, gate on the `EMAIL_PROVIDER` flag (mirroring `email.ts:213`). When CF: keep resolved `fromEmail` + `name` **separate** and call `sendViaCloudflareEmail({to, subject, html, text, fromEmail, fromName})` instead of building `"Name <email>"` and calling `getResendClient().emails.send`. Capture `result.messageId` (not `result.data.id`) as the `email_logs` idempotency key; keep synthetic `failed:<uuid>` for failures. Drop reliance on Resend `tags` — org/notification correlation already lives in the `email_logs` row via `recordEmailLog`. Platform fallback `fromEmail` should read `CLOUDFLARE_EMAIL_FROM` when on CF. **Must ensure `rememberEmailBinding(c.env.EMAIL)` ran in middleware** so this context-less path can reach the `send_email` binding. |
| `apps/server/src/lib/cloudflare-email.ts` | Reference implementation (`sendViaCloudflareEmail`, `rememberEmailBinding`) — mostly reused as-is. Confirm `rememberEmailBinding` is invoked in middleware for **every** request path that can trigger a tenant send (auth callbacks, webhooks, crons); crons/queue consumers need the binding passed explicitly. |
| `apps/server/src/lib/email.ts` | `getResendClient` stays (needed while Resend coexists). Ensure `EMAIL_PROVIDER` flag + `CLOUDFLARE_EMAIL_FROM` are read here and exported/consistent. Add CF API-token env accessor if the domains wrapper reads it here. |
| `apps/server/src/services/email-domain-refresh.service.ts` | Replace `verifyResendDomain`+`getResendDomain` with `verifyDomain`+`getDomain` (behind provider flag). Replace local `mapResendStatus` with shared `mapCfDomainStatus`. Loop structure (list stale → query provider → map → `updateEmailDomainStatus` on change) is **structurally identical**. |
| `apps/server/src/routes/webhooks.routes.ts` | Retire the `event.type.startsWith('domain.')` branch (lines ~1510–1529), `getResendWebhookSecret`, `mapResendDomainStatus` for domain events. CF has **no** domain-verification webhook — the **poll path becomes authoritative** for verification. Keep Svix/webhook machinery only if still needed for delivery events (CF also does not provide Resend-shaped delivery webhooks, so plan to shrink or repurpose). |
| `packages/db/src/schema/control-panel/email-domains.ts` | Add `provider` (text, default `'resend'`), `cfZoneId` (text, nullable), `cfSubdomainId` (text, nullable), `onboardingTier` (text, nullable: `default`/`delegated`/`bare`). Make `resendDomainId` **nullable** for the CF era (drop NOT NULL; keep unique but partial). Update the schema header comments (lines 33–37) that describe Resend status semantics. |
| `packages/db/src/schema/control-panel/email-logs.ts` | Keep `resendMessageId` column (now holds the CF message id / generated `Message-ID`); update comment. Optionally add `provider` for auditability. Shrink the documented status enum comment to what CF can report (`queued|sent|bounced|failed`, complaint via routing). |
| `packages/db/src/schema/control-panel/email-domain-aliases.ts` | **No change** — provider-neutral. |
| `packages/db/src/schema/control-panel/email-notification-routes.ts` | **No change** — provider-neutral. |
| `packages/services/src/email-domain.service.ts` | Update `createEmailDomain` to write `provider`, `cfZoneId`, `cfSubdomainId`, `onboardingTier` and the CF id into `resendDomainId`/`cfSubdomainId`. `getEmailDomainByResendId` → generalize to `getEmailDomainByProviderId` keyed on `cfSubdomainId` (webhook lookup only matters if any provider still webhooks). `listStaleEmailDomains`, `updateEmailDomainStatus`, `getVerifiedEmailDomainForOrg`, alias/route resolvers are otherwise unchanged. |
| `packages/db/src/generated/control-panel-migrations.generated.ts` | Regenerate after adding `0037` (commit alongside SQL, per control-panel hand-written-SQL + `gen-control-panel-migrations.ts` workflow). |
| `apps/web/src/routes/_authenticated/dashboard/_layout/settings/email.tsx` | Rewrite Resend-specific copy (PageHeader "…via Resend", SendTestDialog "Resend delivery path", sendTest HTML strings). Replace `CreateDomainCard`'s single free-text field with a **tier chooser** (default/delegated/bare). Hide `DnsRecordsList`/`DmarcProgression` (show "Nothing to do — Avantej manages DNS") for the **default** tier; show CF-generated NS + records for **delegated**; show full CF record set for **bare**. Add `tier`, `cfZoneId` to `EmailDomainRow` type. Remap the `DnsRecord` TS type to CF's record shape. "Verify now" → "Check DNS status". Keep `statusBadgeVariant` (still `pending|verifying|verified|failed`). Aliases + `NotificationRoutingCard` unchanged. |
| `apps/web/src/lib/email-dmarc.ts` | `parseDmarcPolicy`/`DMARC_STEPS` still work against CF-returned TXT records; make the stepper informational/read-only for default+delegated tiers, interactive only for bare. |
| `apps/server/src/lib/resend-domains.ts` | **Retire after cutover** — kept during coexistence, deleted in the final Resend-removal step. |

---

## 3. New Onboarding Flow (All 3 Tiers)

**Common preconditions:** org admin, `checkEmailDomainCreateAllowed` gate runs **before** any CF API call (CF has no per-domain fee, so relax to abuse-cap only later). Every tier ends with an `email_domains` row and a `status` driven by CF, gated to `verified` before sends.

### Tier 1 — DEFAULT `<tenant>.avantej.com` (zero-touch)
1. Admin picks "Use an Avantej subdomain (recommended)"; UI derives `domain = <tenant>.avantej.com`.
2. Server: `createDomain({ zone: AVANTEJ_ZONE_ID, subdomain: '<tenant>.avantej.com', tier:'default' })` → `POST /zones/{avantej-zone}/email/sending/subdomains`. CF auto-provisions cf-bounce SPF/DKIM/DMARC/MX **inside Avantej's own zone** — no tenant DNS.
3. Persist row: `provider='cloudflare'`, `cfZoneId=AVANTEJ_ZONE_ID`, `cfSubdomainId=<returned id>`, `onboardingTier='default'`, `dns_records=[]` (nothing to show), likely `status='verified'` immediately (or a fast poll).
4. UI hides DNS/DMARC panels. Send-test works as soon as CF reports active.

### Tier 2 — DELEGATED `send.<tenant>.com` (NS delegation)
1. Admin enters their apex `<tenant>.com`; UI proposes `send.<tenant>.com`.
2. Server: `createDomain` onboards `send.<tenant>.com` as a CF-managed subdomain zone; CF returns **NS delegation records** + auto-managed cf-bounce SPF/DKIM/DMARC/MX. Persist `onboardingTier='delegated'`, `dns_records=<CF NS + records>`, `status='pending'`.
3. Tenant adds only the **NS delegation records** at their DNS provider for `send.<tenant>.com`.
4. `status='verifying'`; the refresh cron polls `getDomain` until CF reports the subdomain active → `verified` (`verified_at` set). No webhook.
5. Sends go from `<localPart>@send.<tenant>.com`.

### Tier 3 — BARE `<tenant>.com` (full external DNS)
1. Admin onboards their apex zone; UI shows the **complete CF-returned record set** (cf-bounce SPF/DKIM/DMARC/MX) exactly like today's flow.
2. Server: `createDomain` returns all records; persist `onboardingTier='bare'`, `dns_records=<full CF set>`, `status='pending'`.
3. Tenant manually publishes every record at their DNS provider (DMARC hardening stepper stays fully interactive).
4. Refresh cron polls `getDomain` → `verifying` → `verified`.
5. Sends go from `<localPart>@<tenant>.com`.

**Send path (all tiers, once verified):** `sendTenantEmail` resolves from-address as today, then `env.SEND_EMAIL.send(EmailMessage)` via `sendViaCloudflareEmail({email: fromEmail, name: fromName})`, capturing CF's `messageId` into `email_logs`.

---

## 4. DB Migration Sketch (`0037_email_domains_cf_provider.sql`)

Idempotent, additive, dual-write-safe.

```sql
-- Provider discriminator + CF identity on email_domains
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'resend';
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS cf_zone_id text;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS cf_subdomain_id text;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS onboarding_tier text; -- 'default' | 'delegated' | 'bare'

-- Relax the Resend NOT NULL so CF rows don't need a d_xxx id
ALTER TABLE email_domains ALTER COLUMN resend_domain_id DROP NOT NULL;

-- Preserve uniqueness on the CF identity (partial, only when set)
CREATE UNIQUE INDEX IF NOT EXISTS email_domains_cf_subdomain_unique_idx
  ON email_domains (cf_subdomain_id) WHERE cf_subdomain_id IS NOT NULL;

-- Keep the existing resend_domain_id unique constraint working for legacy rows
--   (existing UNIQUE stays; nullable columns allow multiple NULLs in Postgres)

-- email_logs: provider tag (message-id column reused, semantics documented)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'resend';
COMMENT ON COLUMN email_logs.resend_message_id IS
  'Provider message id / idempotency key: Resend re_xxx or CF Message-ID (synthetic failed:<uuid> on failure)';
```

**Backfill/cutover note:** existing rows stay `provider='resend'` and keep working. New CF rows write `provider='cloudflare'`, populate `cf_zone_id`/`cf_subdomain_id`/`onboarding_tier`, and leave `resend_domain_id` NULL. A later migration (post-cutover) can drop `resend_domain_id`'s unique index and the column once all rows are CF. Aliases/routes tables need **no migration**.

---

## 5. Ordered, Incremental Implementation Checklist

Each item is small and independently testable; provider selection is flag-gated (`EMAIL_PROVIDER`) so Resend and CF coexist until the final retire step.

1. **Env + secrets** — add CF API token, `AVANTEJ_ZONE_ID`, `CLOUDFLARE_EMAIL_FROM`, keep `EMAIL_PROVIDER` flag. *Test:* boot the Worker; assert env accessors return values.
2. **DB migration `0037`** — author idempotent SQL, run `bun gen:migrations`/control-panel generator, `bun verify:migrations`. *Test:* apply to a control-panel dev DB; existing rows untouched, new columns present.
3. **Schema + service writes** — update `email-domains.ts` schema + `createEmailDomain` to accept/write `provider`, `cfZoneId`, `cfSubdomainId`, `onboardingTier`. *Test:* unit-insert a CF-shaped row.
4. **`cloudflare-domains.ts` wrapper** — implement 4 functions + `throwOnCfError`, matching return shapes. *Test:* unit tests with a mocked CF API for create/get/delete happy-path + not-found-swallow on delete.
5. **`cf-domain-status.ts`** — shared `mapCfDomainStatus`; dedupe the two `mapResendStatus` copies behind it. *Test:* table-driven mapping unit test.
6. **Backend onboarding (create)** — repoint `emailDomainsRouter.create` behind provider flag; swap `region`→`tier` input; keep rate-limit gate. *Test:* oRPC call creates a `provider='cloudflare'` row for each tier (mock CF).
7. **Verification via CF poll** — repoint `runEmailDomainRefresh` + `verify`/`get(refresh)` to `verifyDomain`/`getDomain`; retire the webhook domain branch. *Test:* cron flips a pending CF row to verified against mocked CF status.
8. **Dispatch (send)** — flag-gate `sendTenantEmail` to `sendViaCloudflareEmail`; separate from-email/name; capture CF messageId; ensure `rememberEmailBinding` in middleware + crons. *Test:* `sendTest` from a verified CF domain writes a `sent` `email_logs` row; auth path fallback still works.
9. **UI onboarding tiers** — tier chooser in `CreateDomainCard`; conditional DNS/DMARC panels; copy rewrite; type remap. *Test:* Chrome MCP at `http://avantej.localhost:3021/` — create each tier, verify DNS panel visibility, run "Send test".
10. **Migrate live tenants** — for each existing verified Resend domain, onboard the CF equivalent (choose tier), flip `provider='cloudflare'` after CF verifies, keep Resend row until confirmed. *Test:* send-test through CF for a migrated tenant before flipping the flag org-wide.
11. **Flip `EMAIL_PROVIDER=cloudflare`** globally once all tenants migrated. *Test:* `/audit-prove` POS + auth emails end-to-end.
12. **Retire Resend** — delete `resend-domains.ts`, the webhook domain branch, `RESEND_*` env, the `resend` dep; final migration to drop `resend_domain_id`. *Test:* `bun check-types`, `bun check`, full e2e green.

---

## 6. Risks & Gotchas

- **CF DNS-in-our-account constraint (biggest):** CF Email Sending onboards subdomains **per-zone inside a Cloudflare account you control**. Tier 1 requires Avantej's own `avantej.com` zone to hold every tenant's cf-bounce records — the platform account becomes a shared multi-tenant DNS surface. Tiers 2/3 require the tenant to either NS-delegate a subdomain to CF or onboard their whole zone to CF; unlike Resend (single account, tenant just adds TXT records), CF needs a real zone relationship. Verify the CF plan/account supports the volume of subdomains and any per-account subdomain limits.
- **Per-tenant zone creation & API-token scope:** the CF API token must be scoped to create/read/delete sending subdomains across the relevant zones. Tier-3 tenants each imply a distinct zone id you must capture and store (`cf_zone_id`) — plan how a tenant's zone gets added to the account (self-serve vs. support-assisted).
- **No verification webhook — poll is authoritative:** removing the Svix domain webhook means verification latency now depends entirely on the refresh cron cadence. Ensure the cron interval is tight enough that tier-2/3 tenants don't wait hours after publishing DNS; consider an on-demand "Check DNS status" button (already present as re-purposed "Verify now") that calls `getDomain` synchronously.
- **No delivery webhooks / tracking:** CF gives no Resend-shaped delivered/opened/clicked/bounced/complained events. `email_logs` status effectively shrinks to `queued|sent|failed` (+ bounce/complaint only if you build a CF Email Routing Worker parsing the cf-bounce mailbox). Don't leave UI promising open/click analytics.
- **Binding availability in context-less paths:** `sendTenantEmail` runs deep inside `dispatchAuthEmail` and crons with **no Hono request context**; `getEnvVar`'s module-global env does **not** expose `send_email`. `rememberEmailBinding(c.env.EMAIL)` MUST run in middleware on every triggering request, and crons/queue consumers must pass the binding explicitly — a missed path silently breaks tenant/auth email.
- **From-address shape change:** CF wants structured `{email, name}`, not Resend's `"Name <email>"` string. A missed concatenation will produce malformed senders — keep them separate through the whole resolution chain.
- **Send-test recipient constraint:** CF `send_email` may require the recipient be an allowed destination in Email Routing for the zone (especially default/delegated tiers). Surface a "recipient must be a verified destination" hint in `SendTestDialog`.
- **Deliverability / warm-up:** moving off Resend's shared/managed IP reputation to CF means new DKIM signatures and sending identity. Expect a reputation warm-up; monitor bounce/complaint via the cf-bounce mailbox and stage the cutover per-tenant rather than flipping globally on day one.
- **Coexistence correctness:** during migration both providers are live. The `provider` column must be the single source of truth for which wrapper each row uses — never infer from `resend_domain_id` presence alone. Rate-limit gate and audit writes are provider-agnostic; just ensure the `changes` payload records the CF id, and that `email_logs` idempotency keys don't collide across providers.
- **Idempotency-key format shift:** `resend_message_id` uniqueness must hold for CF ids too. If CF's `messageId` isn't guaranteed unique/stable, generate and persist your own `Message-ID` header at send time and key on that.