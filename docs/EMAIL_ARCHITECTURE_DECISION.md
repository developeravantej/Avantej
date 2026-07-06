# Email Architecture Decision — Resend → Cloudflare Email (multi-tenant)

Status: **in progress** (Phase 1–2 done, Phase 3 starting). Owner: platform.

## Decision

Migrate transactional email from **Resend** to **Cloudflare Email Sending**, keeping
a flag-gated fallback during migration. Reason: **cost + scale**.

| | Cloudflare Email Sending | Resend (current) |
|---|---|---|
| **Per-domain fee** | **none** — unlimited sending domains | tiered domain limits (super-charge risk at scale) |
| **Volume** | 3,000/mo free, then **$0.35 / 1,000** | free 3k, Pro $20/mo, then per-volume |
| **Auth** | native Workers `send_email` binding (no key) | REST API key |
| **Constraint** | sending domain **must be a Cloudflare DNS zone** in our account | any DNS provider ✅ |

The per-domain-cost removal is decisive for a multi-tenant SaaS where every tenant
may want a white-label sending domain.

## The Cloudflare constraint + how we work around it

Cloudflare Email onboards a **sending subdomain of a zone that lives in Avantej's
Cloudflare account** (`POST /zones/{zone}/email/sending/subdomains`; it auto-adds
`cf-bounce.*` SPF/DKIM/DMARC/MX). So a tenant domain must reach our CF account.
Three tiers, increasing tenant effort:

| Tier | Sender | Tenant DNS effort | Notes |
|---|---|---|---|
| **Default (all tenants)** | `support@<tenant>.avantej.com` | **none** | subdomain of `avantej.com` (already our CF zone); onboard freely, $0 |
| **Custom subdomain** | `support@send.<tenant>.com` | delegate `send.<tenant>.com` **NS** → Cloudflare (in Avantej's account) | keeps their registrar; onboard the delegated zone |
| **Bare custom domain (Option B)** | `support@<tenant>.com` | move `<tenant>.com` **nameservers** → Cloudflare | full DNS to CF; heaviest |

Cloudflare **for SaaS custom hostnames = HTTP/TLS only**, does NOT cover email — so
the DNS-in-our-account requirement is unavoidable for CF Email.

## What's done

- **Phase 1 (infra):** Email Sending enabled on the account (200/day quota, scales);
  `send.avantej.com` onboarded (DKIM/SPF/DMARC live); live send from
  `noreply@send.avantej.com` succeeded.
- **Phase 2 (platform sender):** `apps/server/src/lib/cloudflare-email.ts` sends via
  the `send_email` binding, selected by `EMAIL_PROVIDER=cloudflare` (default stays
  Resend). The binding is only on the per-request `c.env`, so a middleware in
  `index.ts` stashes it (`rememberEmailBinding`). Verified end-to-end on prod
  (messageId from `noreply@send.avantej.com`). `send_email` binding + `CLOUDFLARE_EMAIL_FROM`
  in `apps/server/wrangler.jsonc` (both envs).

## Phase 3 — tenant custom domains on Cloudflare (the multi-tenant piece)

Rework the tenant email-domain system (currently 100% Resend) onto Cloudflare:

1. **Onboarding backend** — replace `resend-domains.ts` (`resend.domains.create`) with a
   `cloudflare-domains.ts` that onboards a tenant sending (sub)domain via CF
   `sending/subdomains`, returns DNS records, and reports verification.
2. **Data model** — `email_domains` keeps DNS-records + status; add a `provider`
   column so Resend + CF rows coexist during migration.
3. **Tenant dispatch** — `email-send-tenant.ts` sends `from @<tenant-domain>` via the
   (now-working) CF binding when the domain's provider is `cloudflare`, else Resend.
4. **Verification** — CF auto-creates DNS in our zone (for `<tenant>.avantej.com`), or
   the tenant adds NS/records (custom domain); poll CF for `verified`.
5. **UI** — Email settings onboarding presents the CF flow + the 3 tiers.
6. **Migration + Phase 4** — migrate existing verified tenants, then retire Resend.

## Deliverability (blocker for cutover)

`send.avantej.com` is **brand-new = no reputation → lands in spam**. Before cutting
platform email over to Cloudflare: warm up the domain, confirm DKIM/SPF/DMARC
alignment (DMARC currently `p=reject` on `send.avantej.com`), and monitor bounces.
**Do not flip production auth email to Cloudflare until warmed up.**

## Rollback

`EMAIL_PROVIDER` unset (or `resend`) → everything reverts to Resend instantly. The
Resend integration stays intact until Phase 4.
