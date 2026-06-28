# DNS Backup — avantej.com

- **Captured:** 2026-06-27
- **Source:** Namecheap Advanced DNS (registrar account: wilfredfoo96)
- **Registrar:** Namecheap
- **DNSSEC:** OFF
- **Nameservers (current):** Namecheap default ("Standard Nameservers" — BasicDNS)
- **Purpose:** Pre-migration snapshot before moving avantej.com to Cloudflare (Ngchwanlii@zhiyuantech.ai's Account, ID a9c786e2839df3157985b75b9195a5dd).

> Restore plan: if anything goes wrong, set Namecheap nameservers back to **Namecheap BasicDNS**
> (Domain → Nameservers → "Namecheap BasicDNS") and these host records reappear. If they don't,
> re-enter the records below exactly.

## Host Records (Advanced DNS)

| Type             | Host                | Value                                                                 | TTL          | Notes |
|------------------|---------------------|----------------------------------------------------------------------|--------------|-------|
| A Record         | @                   | 31.43.160.6                                                           | Automatic    | Namecheap URL-redirect server IP (not a real origin) |
| A Record         | @                   | 31.43.161.6                                                           | Automatic    | Namecheap URL-redirect server IP (not a real origin) |
| CNAME Record     | athory              | sites.ludicrous.cloud.                                                | Automatic    | |
| CNAME Record     | explore             | sites.ludicrous.cloud.                                                | Automatic    | |
| CNAME Record     | physio2entrepreneur | sites.ludicrous.cloud.                                                | Automatic    | |
| CNAME Record     | www                 | sites.framer.app.                                                     | Automatic    | **Legacy site (Framer)** |
| TXT Record       | @                   | google-site-verification=2xVbj2RpdNsWNxTRcmpIoC-DbGKnagg3c57wz9FZqNA  | Automatic    | Google site verification |
| URL Redirect     | @                   | https://www.avantej.com/                                             | Permanent (301) | Namecheap-only feature; recreate on Cloudflare as a Redirect Rule |

## Mail Settings

| Type      | Host | Value             | Priority | TTL       | Notes |
|-----------|------|-------------------|----------|-----------|-------|
| MX Record | @    | smtp.google.com.  | 1        | Automatic | **Gmail / Google Workspace email — must be preserved** |

## Migration Notes (what changes vs. what must survive)

**Target state**
- Root `avantej.com` → stays on the **legacy** site (Framer, via `www` + apex→www redirect).
- `www.avantej.com` → `sites.framer.app` (unchanged).
- `move.avantej.com` (NEW) → the project app (`avantej-core` Cloudflare Worker, custom domain).
- Gmail MX + Google TXT + the 3 `*.ludicrous.cloud` CNAMEs → preserved.

**Gotchas when recreating on Cloudflare**
1. **Drop the two `@` A-records (31.43.x)** — they're Namecheap redirect servers, not a real origin.
2. **Recreate the apex→www 301 redirect** as a Cloudflare **Redirect Rule** (Namecheap's URL-redirect record does not migrate).
3. **Keep MX → smtp.google.com (priority 1)** so email keeps working.
4. Cloudflare's auto-scan will import the CNAMEs/TXT/MX; verify each against this table before cutover.

---

## Post-migration state (Cloudflare — completed 2026-06-27)

- **Nameservers:** bayan.ns.cloudflare.com / jacqueline.ns.cloudflare.com (zone ACTIVE, account a9c786e2… Ngchwanlii)
- **Apex `avantej.com`:** A → 192.0.2.1 (proxied placeholder) + **Redirect Rule** "Apex to www (legacy site) 301" → `https://www.avantej.com/` (preserve query). Verified 301.
- **`www`:** CNAME → sites.framer.app (proxied) — legacy site, HTTP 200.
- **`move.avantej.com`:** Worker Custom Domain → `avantej-core` (proxied, cert issued). HTTP 200.
- **`athory` / `explore` / `physio2entrepreneur`:** CNAME → sites.ludicrous.cloud (DNS-only) — re-added (auto-scan had missed them).
- **MX `@`:** smtp.google.com (pri 1) — preserved (Gmail).
- **TXT `@`:** google-site-verification=2xVbj2Rp… — preserved.
- Removed the two original Namecheap redirect-server A records (31.43.160.6 / 31.43.161.6) and the extra 162.255.119.132; consolidated to the single proxied placeholder above.

### Follow-ups
- Rotate the Cloudflare tokens pasted during setup (cfut_, cfat_, and the cfoat_/cfort_ OAuth pair).
- `.cf-token` and `.cf-token-staging` are gitignored; delete them when no longer needed.
