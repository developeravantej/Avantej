# RULE: Production domains & cross-subdomain auth (avantej.com)

> Established 2026-06-27 when `move.avantej.com` login broke after the DNS cutover.
> This is the canonical reference for how the live app is wired. Read before
> changing any public domain, auth origin, or deploying web/server.

## Live topology

| Hostname | Serves | Cloudflare Worker | Notes |
|---|---|---|---|
| `avantej.com` (apex) | 301 → `https://www.avantej.com/` | — (Redirect Rule) | Apex A `192.0.2.1` (proxied placeholder) + Redirect Rule. Root = **legacy Framer site**. |
| `www.avantej.com` | Legacy marketing site | — | CNAME → `sites.framer.app` (proxied). Framer only serves `www`, **not** the apex (apex 400s) → must redirect. |
| `move.avantej.com` | **The app — web SPA** | **`avantej-core`** | Worker Custom Domain. |
| `move-api.avantej.com` | **The app — API** | **`avantej-core-server`** | Worker Custom Domain. |
| `athory` / `explore` / `physio2entrepreneur` | external funnels | — | CNAME → `sites.ludicrous.cloud` (DNS-only). |
| `@` MX | Gmail/Workspace | — | MX → `smtp.google.com` (pri 1). **Never drop.** |

- **Cloudflare account:** `Ngchwanlii@zhiyuantech.ai` — id `a9c786e2839df3157985b75b9195a5dd`. Nameservers `bayan` / `jacqueline`. The zone and the workers **must** be in this same account (Worker Custom Domains require it).
- **Account workers.dev subdomain is `zhiyuantech`** (e.g. `avantej-core-server.zhiyuantech.workers.dev`). The old `developer-avantej.workers.dev` strings were stale — do not reintroduce them.

## Worker-name gotcha (IMPORTANT)

- The deployed **web** worker is named **`avantej-core`** (this is what `move.avantej.com` routes to).
- `apps/web/wrangler.jsonc` was once renamed to `avantej-core-web` (commit 2dcb62ec) but that was **never deployed** — `avantej-core-web` does not exist. The repo file is now pinned back to `name: "avantej-core"` + `account_id`.
- **Always deploy web to `avantej-core`.** Deploying to any other name leaves `move.avantej.com` on the old build.

## Why login works (cross-subdomain cookie)

The web origin (`move.avantej.com`) and API origin (`move-api.avantej.com`) are different subdomains of the **same registrable domain** `avantej.com`. For Better-Auth login to work across them, ALL of these must hold:

1. `apps/server/wrangler.jsonc` vars:
   - `CORS_ORIGIN = https://move.avantej.com` (comma-separate if more web origins)
   - `BETTER_AUTH_URL = https://move-api.avantej.com`
   - `COOKIE_DOMAIN = .avantej.com`
2. `apps/server/src/lib/better-auth.ts`:
   - `advanced.crossSubDomainCookies` enabled with `domain` from `COOKIE_DOMAIN` → cookie is `Domain=.avantej.com; Secure; SameSite=None`.
   - `trustedOrigins` splits `CORS_ORIGIN` on commas (so each web origin is trusted).
3. `apps/web/.env.production`: `VITE_SERVER_URL = https://move-api.avantej.com`.

If the API is ever moved to a different registrable domain than the web (e.g. back to `*.workers.dev`), login **will** break: CORS blocks it and the cookie becomes third-party (browser-dropped).

## Rules when changing domains / deploying

- **Adding a new public web domain?** Add it to `CORS_ORIGIN` (server) AND ensure it shares the `COOKIE_DOMAIN` parent, then **redeploy the server**.
- **The web SPA bakes `VITE_SERVER_URL` at build time.** Any API-URL/origin change needs a **web rebuild + redeploy** (`bun run deploy` in `apps/web`), not just a server deploy.
- **Deploy order:** server first (`apps/server` → `bun run deploy`), then web (`apps/web` → `bun run deploy`).
- **Web custom-domain target must be the same Cloudflare account** as the zone (`a9c786e2…`).
- **DNS safety:** never remove the Gmail MX, `www` CNAME, or the apex redirect. Pre-cutover snapshot lives at repo root `dns-backup-avantej.com-2026-06-27.md`; restore by reverting Namecheap nameservers to "Namecheap BasicDNS".
- **Verify login after any auth/domain change** with:
  `curl -i -X POST https://move-api.avantej.com/api/auth/sign-in/email -H "Origin: https://move.avantej.com" -H "Content-Type: application/json" -d '{"email":"franchisee@gmail.com","password":"password123"}'`
  → expect `HTTP 200` + `Set-Cookie … Domain=.avantej.com`.
