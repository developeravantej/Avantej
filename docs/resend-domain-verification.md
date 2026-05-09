# Resend Domain Verification Runbook

Current state: `RESEND_FROM_EMAIL=onboarding@resend.dev`. Resend's shared sandbox sender — only delivers to the account-owner email, rate-limited, no custom branding. Must be replaced before staging/prod.

## Why

- Free-tier sandbox refuses delivery to non-owner recipients (`You can only send testing emails to your own email address`).
- E2E spec 08 hits a 24s retry window before Resend rejects — flaky.
- Production invitations and password resets fail silently for any external recipient.

## Prerequisites

- Domain you control DNS for (recommend a subdomain like `mail.avantej.com` or `notifications.avantej.com`; keeps apex SPF/MX intact).
- Resend account access: https://resend.com/domains
- DNS provider login (Cloudflare, Route53, Namecheap, etc.).

## Steps

### 1. Add domain in Resend

1. https://resend.com/domains → **Add Domain**
2. Enter the subdomain (e.g. `mail.avantej.com`)
3. Region: pick one close to Cloudflare Workers location (e.g. `ap-southeast-1` if APAC traffic)
4. Resend displays 3 DNS records to add: SPF (TXT), DKIM (TXT), MX

### 2. Add DNS records

| Record | Host | Value | TTL |
|--------|------|-------|-----|
| MX | `mail` (or as shown) | `feedback-smtp.<region>.amazonses.com` priority `10` | Auto |
| TXT (SPF) | `mail` | `v=spf1 include:amazonses.com ~all` | Auto |
| TXT (DKIM) | `resend._domainkey.mail` | `<long DKIM key from Resend>` | Auto |

Cloudflare quirk: turn off the orange-cloud proxy on these records (DNS-only).

### 3. Verify

Resend dashboard → click **Verify DNS Records**. Propagation usually < 5 min, sometimes up to 1 hr.

### 4. (Recommended) DMARC

Add a DMARC TXT record on the apex or subdomain to prevent spoofing:

```
Host: _dmarc.mail.avantej.com
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@avantej.com; pct=100
```

Start with `p=none` for monitoring, escalate to `quarantine` then `reject` after a week of clean reports.

### 5. Update env

Update **all** environments:

```bash
RESEND_FROM_EMAIL=noreply@mail.avantej.com   # or notifications@...
RESEND_FROM_NAME=Avantej
```

Files / locations:
- `apps/server/.dev.vars` (local dev)
- Cloudflare Worker secrets via `wrangler secret put RESEND_FROM_EMAIL` and `wrangler secret put RESEND_FROM_NAME` for each environment (staging, production)
- Any CI/CD secret store

### 6. Smoke test

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"noreply@mail.avantej.com","to":["any@example.com"],"subject":"verify","html":"<p>ok</p>"}'
```

Expected: HTTP 200 with `{ "id": "..." }`. Then re-run `bun playwright test e2e/tests/08-staff-ghl-sync-real-crud.spec.ts` against staging — should not hit the 24s sendEmail retry.

## Rollback

If verification stalls or breaks delivery:
1. Revert env back to `RESEND_FROM_EMAIL=onboarding@resend.dev` (sandbox still works for owner email)
2. Leave DNS records in place — they don't conflict with the sandbox sender

## Notes

- `apps/server/src/lib/email.ts` already reads `RESEND_FROM_EMAIL` env at runtime — no code change needed.
- Better-Auth password reset, email verification, and invitation emails all share this sender.
- Resend's free tier: 100/day, 3000/mo. Paid tier needed for prod volume; pricing at https://resend.com/pricing.
