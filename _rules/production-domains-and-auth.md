# RULE: Production domains & cross-subdomain auth (avantej.com)

> Established 2026-06-27 (when `move.avantej.com` login broke after the DNS cutover).
> **Updated 2026-07-13** to the current `app.*` / `api.*` topology after the P9b
> split — the earlier `move.avantej.com` / `move-api.avantej.com` stack is being
> decommissioned (see "Legacy stack" below). This is the canonical reference for
> how the live app is wired. Read before changing any public domain, auth origin,
> or deploying web/server. Facts here were verified live on 2026-07-13.

## Live topology (current production)

| Hostname | Serves | Cloudflare Worker | Notes |
|---|---|---|---|
| `avantej.com` (apex) | 301 → `https://www.avantej.com/` | — (Redirect Rule) | Root = **legacy Framer site**. |
| `www.avantej.com` | Legacy marketing site | — | CNAME → `sites.framer.app` (proxied). Framer serves `www` only, not the apex. |
| `app.avantej.com` | **The app — web SPA** | **`avantej-core-web-prod`** | Worker Custom Domain. |
| `api.avantej.com` | **The app — API** | **`avantej-core-server-prod`** | Worker Custom Domain. Deployed with `wrangler deploy --env prod`. |
| `@` MX | Gmail/Workspace | — | MX → `smtp.google.com` (pri 1). **Never drop.** |

- **Cloudflare account:** `Ngchwanlii@zhiyuantech.ai` — id `a9c786e2839df3157985b75b9195a5dd`. The zone and the workers **must** be in this same account (Worker Custom Domains require it).
- **Account workers.dev subdomain is `zhiyuantech`** (e.g. `avantej-core-server-prod.zhiyuantech.workers.dev`).

## Legacy stack (being decommissioned — do not deploy here)

- `move.avantej.com` → worker **`avantej-core`** (top-level name in `apps/web/wrangler.jsonc`).
- `move-api.avantej.com` → worker **`avantej-core-server`** — **this worker is now the DEV/staging server** (per `_rules/database-environments.md`). When removing `move-api.avantej.com`, **unbind the custom domain only; do NOT delete the worker** (that breaks dev).
- Before removing either `move.*` domain, verify nothing still depends on it (GHL webhooks, native app, integrations, bookmarks).

## Deploy commands (IMPORTANT — the web `--env` gotcha)

- **Server (API):** from `apps/server` → `wrangler deploy --env prod` → deploys to `avantej-core-server-prod` (`api.avantej.com`). ✓ `--env prod` works here (server `wrangler.jsonc` `env.prod.name` = `avantej-core-server-prod`).
- **Web (SPA):** from `apps/web` → `bun run deploy:prod`, i.e.
  `VITE_SERVER_URL=https://api.avantej.com CF_DEPLOY=true vite build && wrangler deploy --name avantej-core-web-prod`.
  - **Use explicit `--name avantej-core-web-prod`, NOT `--env prod`.** For the assets web worker, `wrangler deploy --env prod` misroutes the upload to the **top-level `avantej-core`** worker (which serves `move.avantej.com`), leaving `app.avantej.com` on the old build. Verified 2026-07-13.
  - Confirm the right API URL got baked: `grep -o 'https://api\.avantej\.com' apps/web/dist/assets/*.js` should hit, and `move-api` should NOT appear.
- **Deploy order:** server first, then web.

## Why login works (cross-subdomain cookie)

The web origin (`app.avantej.com`) and API origin (`api.avantej.com`) are different subdomains of the **same registrable domain** `avantej.com`. For Better-Auth login to work across them, ALL of these must hold:

1. `avantej-core-server-prod` vars (server `wrangler.jsonc` `env.prod`):
   - `CORS_ORIGIN = https://app.avantej.com` (comma-separate if more web origins)
   - `BETTER_AUTH_URL = https://api.avantej.com`
   - `COOKIE_DOMAIN = .avantej.com`
2. `apps/server/src/lib/better-auth.ts`:
   - `advanced.crossSubDomainCookies` enabled with `domain` from `COOKIE_DOMAIN` → cookie is `Domain=.avantej.com; Secure; SameSite=None`.
   - `trustedOrigins` splits `CORS_ORIGIN` on commas (so each web origin is trusted).
3. `apps/web/.env.production`: `VITE_SERVER_URL = https://api.avantej.com` (the web SPA bakes this at build).

If the API is ever moved to a different registrable domain than the web (e.g. back to `*.workers.dev`), login **will** break: CORS blocks it and the cookie becomes third-party (browser-dropped).

## Rules when changing domains / deploying

- **Adding a new public web domain?** Add it to `CORS_ORIGIN` (server) AND ensure it shares the `COOKIE_DOMAIN` parent, then **redeploy the server**.
- **The web SPA bakes `VITE_SERVER_URL` at build time.** Any API-URL/origin change needs a **web rebuild + redeploy**, not just a server deploy.
- **Web custom-domain target must be the same Cloudflare account** as the zone (`a9c786e2…`).
- **DNS safety:** never remove the Gmail MX, `www` CNAME, or the apex redirect. Pre-cutover snapshot lives at repo root `dns-backup-avantej.com-2026-06-27.md`.
- **Verify login after any auth/domain change** with:
  `curl -i -X POST https://api.avantej.com/api/auth/sign-in/email -H "Origin: https://app.avantej.com" -H "Content-Type: application/json" -d '{"email":"franchisee@gmail.com","password":"password123"}'`
  → expect `HTTP 200` + `Set-Cookie … Domain=.avantej.com`.
