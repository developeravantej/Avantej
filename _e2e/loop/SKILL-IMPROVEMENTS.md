# e2e-loop — proposed skill improvements (review-gated; NOT applied to installed skill)

Found during the 2026-06-03 Avantej dashboard run. Editing the global skill affects every project, so these are left for the user to apply.

1. **server-warden health probe fails on `.localhost` subdomains.** Node's `fetch`/DNS does not special-case `*.localhost` (returns ENOTFOUND) the way browsers/curl do. The warden therefore reports a healthy dev server as down, tree-kill-restarts it, and eventually "gives up" — taking the working server with it. Fix options: (a) document that `server.healthUrl` must use plain `localhost` (or `127.0.0.1`), not a tenant subdomain; (b) fall back to a `curl`/`node:http` probe; (c) add a `127.0.0.1` host override.

2. **Per-route auth-expiry check runs too early.** A sub-agent that checks `page.url().includes('/login')` right after `goto(...,{waitUntil:'domcontentloaded'})` misses SPA auth gates that redirect *after* hydration — so an expired session is silently crawled as if authenticated (uniform login-page "findings"). Recommend: re-check for `/login` URL **and** a visible `input[type=password]` AFTER `networkidle`. Add an early kill-switch: if N consecutive routes return identical interactable counts, abort and re-seed auth.

3. **Auth storageState host must match the explore baseURL.** Better-Auth (and most cookie auth) scopes cookies to the host the session was created on. If `global-setup` seeds against `localhost` but the loop explores a tenant subdomain, every route silently shows the login page. The skill should assert host-match (or warn) before the run.

4. **Cold-compile vs genuine stuck-load disambiguation.** Dev servers (Vite) compile routes on first request, producing >15s "infinite spinner" false positives under crawl load. The verify pass should re-open the route on a *warm* reload and only confirm the finding if the spinner persists past `networkidle + Ns` with no failing request — distinguishing dev-compile latency from a real stuck client-side load.

5. **Report clustering key includes `module`, scattering identical cross-route findings.** The same defect (e.g. one shared component) on routes with different first path-segments produces N separate clusters. Consider clustering primarily on `category + normalized(observed)` with module as a secondary label only.
