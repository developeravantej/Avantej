# Dynamic Per-Tenant Subdomain — Implementation Plan

> Goal: every tenant gets `<slug>.avantej.com` automatically (move.avantej.com, kfc.avantej.com…) with **zero per-tenant infra**. New tenant = a DB row + their Neon branch; the subdomain works instantly.
> Status: DRAFT for review. Grounded in code via 4-agent investigation.

## Target architecture
| Piece | Value | Why |
|---|---|---|
| Web | **wildcard `*.avantej.com`** → web worker | one route serves all tenants |
| API | **fixed `api.avantej.com`** → server worker | shared; ONE OAuth callback for all tenants |
| Session | cookie domain **`.avantej.com`** | login shared across subdomains |
| Tenant | `Host` subdomain → `slug` → org | subdomain decides the tenant (Phase B) |
| apex `avantej.com` + `www` | Framer marketing site (untouched) | app lives on subdomains |

## Two origin gates (BOTH must widen — key finding)
1. **Manual CORS** — `apps/server/src/index.ts` `getAllowedOrigin()` (62-97), exact-match only.
2. **Better-Auth `trustedOrigins`** — `apps/server/src/lib/better-auth.ts` (307-314), exact-match. Sign-in 403s if origin not listed, even if CORS header is right.

---

## ✅ Phase A — DONE + VERIFIED (2026-06-30)
Built + live. Verified: login from `Origin: https://kfc.avantej.com` → 200, `access-control-allow-origin: https://kfc.avantej.com`, `set-cookie ... Domain=.avantej.com; Secure; SameSite=None`, returns MOVE Owner.

**Code (UNCOMMITTED — commit with branch):**
- `apps/server/src/index.ts` `getAllowedOrigin()` — reflect any `https://*.avantej.com` (+ apex) after exact-match.
- `apps/server/src/lib/better-auth.ts` — `trustedOrigins` += `https://*.avantej.com`; enabled `crossSubDomainCookies { enabled:true, domain:".avantej.com" }`. (better-auth 1.5.5 supports both.)
- `apps/server/wrangler.jsonc` prod env — `BETTER_AUTH_URL=https://api.avantej.com`, `CORS_ORIGIN=https://app.avantej.com`.
- web-prod rebuilt with `VITE_SERVER_URL=https://api.avantej.com` (`.env.production` swap at build).

**Cloudflare (avantej.com zone `77c5e829...`):**
- `api.avantej.com` → server-prod: custom domain **+ explicit route `api.avantej.com/*`** (the route is load-bearing — a wildcard route BEATS a custom domain, so the explicit specific route is required).
- `*.avantej.com/*` route → `avantej-core-web-prod` + wildcard DNS `*` (proxied).
- `www.avantej.com/*` → **(none)** route (omit `script`, don't pass `""`) — protects the Framer marketing site.

**Gotchas:** wildcard route > custom domain (needed explicit api route); `(none)` exclusion = POST route with NO `script` field; routes take ~30-60s to propagate.

**⚠️ move.avantej.com:** left on the OLD `avantej-core` worker (user: don't delete; CF custom domains are 1:1, can't re-point without delete). To serve the new app, its custom domain must be removed → then the wildcard covers it. New tenants are unaffected.

---

## Phase A — Foundation (subdomains resolve + shared auth) [original plan below]
*Outcome: any `*.avantej.com` serves the app, login + cookies shared, API on `api.avantej.com`. Tenant still from login (vanity subdomains).*

**Cloudflare (infra):**
1. Wildcard DNS `*` A-record (proxied) on `avantej.com`
2. Wildcard Worker route `*.avantej.com/*` → `avantej-core-web-prod`
3. Fixed custom domain `api.avantej.com` → `avantej-core-server-prod`

**Server code:**
4. `apps/server/src/index.ts` `getAllowedOrigin()` — after exact-match, reflect `requestOrigin` when its host is `avantej.com` or `*.avantej.com` (https only). Keep localhost-dev branch. Update SI-009 comment (55-58) to document the relaxation.
5. `apps/server/src/lib/better-auth.ts`:
   - `trustedOrigins` (307-314) → add `https://*.avantej.com` (⚠️ verify wildcard syntax for installed better-auth version; else use a function form)
   - enable `advanced.crossSubDomainCookies: { enabled: true, domain: ".avantej.com" }` (currently commented, 527-530)
6. `packages/auth/src/index.ts` — mirror (type-only, keep in sync)

**Config:**
7. `apps/server/wrangler.jsonc` prod env (53-61): `BETTER_AUTH_URL` → `https://api.avantej.com`, `CORS_ORIGIN` → `https://app.avantej.com` (canonical; arbitrary tenant subdomains covered by code wildcard)
8. `apps/web/.env.production` `VITE_SERVER_URL` → `https://api.avantej.com` (flows to `orpc.ts:8` + `auth-client.ts:10`)
9. `apps/web/src/utils/orpc.ts` — stop falling back to `window.location.origin`; always use the fixed api host

---

## Phase B — Subdomain → tenant enforcement
*Outcome: `kfc.avantej.com` serves KFC only; user must be a KFC member. True per-URL isolation.*

**Server:**
10. New `resolveOrgFromHost(host)` (e.g. `apps/server/src/lib/db.ts`): strip `.avantej.com` → `SELECT org WHERE slug = sub`. Skip for apex/`app`/`www`/workers.dev/`avantej.localhost`.
11. `apps/server/src/middleware/orpc-tenant.middleware.ts` (99-100) + `tenant.middleware.ts` — when body `organizationId` absent (or to enforce), resolve org from Host. Keep body override for API clients.
12. `apps/server/src/routers/auth/user-context.procedures.ts` (291) — replace "first active membership" default with org-from-Host.
13. Public **slug→org resolver** endpoint — web needs the org identity from the subdomain *before* login (branding, which org to log into).

**Web:**
14. `apps/web/src/hooks/useUserContext.ts` (66-69) — parse slug from `window.location.host`, match `organizations[].slug`, set `current_organization_id` to that org (fall back to first on apex).
15. Reconcile **scope-switcher / impersonation** (also set `current_organization_id`) with subdomain-forced org.
16. `apps/web/vite.config.ts` `allowedHosts` (76) — add `*.avantej.localhost` for local multi-tenant dev.

---

## Decisions needed (yours)
1. **Tenancy model (Phase B):** subdomain = **THE** org (strict — KFC user can't use move.avantej.com) OR subdomain = **default** (pre-selected but user can switch via scope switcher)? Strict = cleaner isolation; default = looser, simpler.
2. **Web URL scheme:** per-tenant `move.avantej.com` (white-label, each client "their own app") OR single `app.avantej.com` portal + optional subdomains? (Both supported by the wildcard.)
3. **Phase split:** ship **Phase A only** first (subdomains + shared auth, tenant from login), then Phase B later? Or build A+B together?

## Risks / notes
- Better-Auth wildcard `trustedOrigins` syntax is version-dependent → verify against `node_modules/better-auth`; function form is the fallback. The manual CORS change is the load-bearing browser gate regardless.
- `crossSubDomainCookies` needs secure cookies → **https only**. Local http `avantej.localhost` won't share the `.avantej.com` cookie (dev caveat).
- Many call sites build outbound links from `CORS_ORIGIN` (emails/invites — `email.ts:348`, `invitations.routes.ts:46`, `google-calendar.ts:62`, etc.). They'll emit the canonical host, not the tenant's own subdomain. Fine for Phase A; revisit if per-tenant link hosts wanted.
- Add a unit test for `getAllowedOrigin`: reflects `https://acme.avantej.com`, rejects `https://evil.com` + `http://acme.avantej.com.evil.com`, keeps localhost in dev.
- `organizations.slug` must be unique + DNS-safe (already unique constraint; confirm slug charset).
- Native app (`apps/native`) auth-client base URL may also need the fixed api host (not inspected).
