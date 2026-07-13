# Cloudflare domain migration + cross-subdomain login fix

- **Session id:** ac32acfa-6773-492e-a250-0289ca530b81
- **Date:** 2026-07-01 12:55
- **Branch:** checkpoint-6-22 @ 6b0fa8d0
- **Status:** in-progress
- **/closing:** Overall 8/10 (A 8 · B 8 · C 8) — gate PASS

## Scope
Connect `avantej.com` to Cloudflare (Ngchwanlii/zhiyuan account), point the root at the legacy Framer site and the `move` subdomain at the project app; then fix "can't login" on `move.avantej.com`; audit the merged scope switcher; merge latest `main`; open a PR to main; and pass the `/closing` quality gate with video proof.

## What was done
- **DNS migration (Cloudflare, Ngchwanlii acct `a9c786e2`):** created the `avantej.com` zone, switched Namecheap NS → `bayan`/`jacqueline`. Apex → 301 Redirect Rule to `www` (legacy Framer). Preserved Gmail MX, Google TXT, `www`→Framer, and re-added the 3 `*.ludicrous.cloud` CNAMEs the auto-scan missed. Attached Worker Custom Domains: `move.avantej.com`→`avantej-core` (web), `move-api.avantej.com`→`avantej-core-server` (API). Pre-migration DNS snapshot saved.
- **Login fix (cross-subdomain auth):** web SPA and API were on different registrable domains → CORS blocked + third-party cookie. Fix in `apps/server/src/lib/better-auth.ts` (`crossSubDomainCookies` gated on `COOKIE_DOMAIN`, `trustedOrigins` comma-split), `apps/server/wrangler.jsonc` (`CORS_ORIGIN`/`BETTER_AUTH_URL`/`COOKIE_DOMAIN=.avantej.com` + `WEB_APP_URL`/`FRONTEND_URL`→prod domain), `apps/web/.env.production` (`VITE_SERVER_URL=move-api`), `apps/web/wrangler.jsonc` (name pinned to live worker `avantej-core`). **Redeployed both workers.**
- **Scope-switcher audit (read-only):** verified all 19 spec modules feed the active scope into their queries (page or delegated hook). No inert switchers; Commissions disputes/review/liability tabs are by-design. No code changes.
- **Merged `origin/main` twice** (Cloudflare feature-set had advanced), resolved conflicts keeping the deployed config, renumbered a `0096` tenant-migration collision (GHL → `0099`), regenerated + verified migrations.
- **Docs:** `_rules/production-domains-and-auth.md` (+ `_rules/INDEX.md`) as the canonical domain/auth reference, `CLAUDE.md` pointer, DNS backup doc, and memory files.
- **PR #61** opened (`checkpoint-6-22` → `main`).
- **/closing:** ran gate (4/10 → **8/10 PASS** after recording browser video proof).

## Files changed (session's auth surface; other files are concurrent-session WIP)
```
apps/server/src/lib/better-auth.ts        | 33 +++++-----
apps/server/wrangler.jsonc                | 13 ++--
apps/web/.env.production                   |  2 +-
apps/web/wrangler.jsonc                    |  3 +-
packages/db/src/migrations/tenant/{0096_ghl...→0099_ghl_pending_contacts}.sql
_rules/production-domains-and-auth.md, _rules/INDEX.md, CLAUDE.md, dns-backup-*.md  (new/edited)
```

## Commits (this session)
- `1074b342` chore(checkpoint): Cloudflare domain + login fix, plus shared-tree WIP
- `9fd2bd50` Merge origin/main into checkpoint-6-22 (+ conflict/migration resolution)
- `b44c5835` Merge origin/main into checkpoint-6-22 (re-sync)
- (`6905d401`, `6b0fa8d0` on HEAD are a concurrent session's POS work)

## Commands run
- `bun check-types` → green (3/3), after `turbo build --filter=./packages/*` to refresh stale dist `.d.ts`
- `bun verify:migrations` → in sync
- `wrangler deploy` (server + web) → deployed `avantej-core-server` + `avantej-core`
- curl sign-in probe → 200 + `Set-Cookie … Domain=.avantej.com`
- Browser (Chrome MCP): login journey recorded → `move-avantej-login-proof-2026-07-01.gif` (dashboard + reload-persistence)
- `git push origin checkpoint-6-22`; `gh pr create` → PR #61

## Decisions
- API on `move-api.avantej.com` (same parent as web) so a `.avantej.com` cookie is first-party across web↔API — the crux of the login fix.
- Conflict resolution kept the **deployed** move/move-api config over main's workers.dev vars (main's would re-break login).
- Renumbered **main's** GHL migration to `0099` (not ours) to preserve the commission chain's internal order.
- Landed via **PR** (protected main + PR workflow), not a direct push.
- Did not type the password in-browser (credential rule) — pre-filled email, user entered the password for the recorded login.

## Open threads
- **PR #61 awaiting review/merge** into `main` (CI runs on it).
- **Rotate** the Cloudflare tokens pasted this session (`cfut_`, `cfat_`, `cfoat_`/`cfort_`); **delete** local `.cf-token` / `.cf-token-staging` (gitignored).
- Reconcile the `avantej-core` vs `avantej-core-web` worker-name mismatch (repo vs live). — [closing plan #4](closing-2026-07-01_12-48_cross-subdomain-login-fix.md)
- Commit an automated Playwright login spec under `_e2e/` (regression; today's proof was a manual recording).
- Verify `GOOGLE_REDIRECT_URI` (Google Calendar OAuth) is registered for the new domain. — closing plan #3
- Fix plan / full scorecard: [closing-2026-07-01_12-48_cross-subdomain-login-fix.md](closing-2026-07-01_12-48_cross-subdomain-login-fix.md)
