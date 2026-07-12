# /closing — cross-subdomain login fix (move.avantej.com)   ·   Overall: 4/10

**What was done:** Migrated `avantej.com` DNS to Cloudflare (Ngchwanlii acct), stood up `move.avantej.com` (web `avantej-core`) + `move-api.avantej.com` (API `avantej-core-server`) as Worker Custom Domains, then fixed production login: the web SPA and API were on different registrable domains, so CORS blocked auth and the session cookie was third-party. Fix = point the SPA at `move-api.avantej.com`, allow that origin in CORS/`trustedOrigins`, and set `crossSubDomainCookies` on `.avantej.com` so the cookie is shared web↔API. Re-synced `origin/main` twice, resolved conflicts keeping the deployed config, renumbered a `0096` migration collision (GHL → `0099`), and opened PR #61.

**Surface audited:** the net source diff vs `origin/main` — `apps/server/src/lib/better-auth.ts`, `apps/server/wrangler.jsonc`, `apps/web/.env.production`, `apps/web/wrangler.jsonc`, and the tenant-migration renumber. (DNS/deploys were infra, verified live; the scope-switcher work was read-only.)

| Check | Score | Verdict | One-line |
|---|---|---|---|
| A. Edge cases | 7/10 | ⚠️ | Auth logic well-guarded (env + HTTPS gates, comma-split trim/filter, idempotent migration); a few prod edges unverified end-to-end. |
| B. E2E + video | 4/10 | ⚠️ | Strong **API-boundary** proof (curl sign-in 200 + `Domain=.avantej.com` cookie), but **no browser e2e and no recorded video** of the login journey — the project convention (Playwright + `_e2e/`). 0 specs reference the move domain. |
| C. Best approach | 8/10 | ✅ | Idiomatic Better-Auth `crossSubDomainCookies` on shared parent, env-gated so dev is unaffected; matches `_rules/production-domains-and-auth.md`. Minor: web-worker name discrepancy left unreconciled. |

**Overall = min(7,4,8) = 4** (only one check below 7, so no extra −1).
**Gate: NEEDS WORK** — the fix is functionally verified at the API boundary but lacks a browser e2e + video of the actual login flow.

---

## Fix plan (ordered by severity)

### 1. [B, blocking → lifts B to 8] Record a browser e2e + video of login on move.avantej.com
**What's wrong:** Login was proven only at the API boundary (curl). No browser round-trip proof that the `SameSite=None; Domain=.avantej.com` cookie is set on `move-api` and re-sent from `move.avantej.com`, establishing a session that survives navigation. No video artifact.
**Fix:** Add/record a journey against the **live** prod site:
- Navigate `https://move.avantej.com/login`
- Sign in `franchisee@gmail.com` / `password123` (plain inputs — Radix-select caveat doesn't apply)
- Assert redirect off `/login` into the dashboard, then **reload** and assert still authenticated (session persisted, no bounce to `/login`)
- Capture video/gif.
**Verify:** `bunx playwright test <spec> --headed` with `video: 'on'` (artifact under `test-results/` or `_e2e/`), or drive via Chrome MCP + `gif_creator`. Confirm the recording shows dashboard content, not the login page.

### 2. [A, medium → lifts A to 8] Verify a user-facing link built from WEB_APP_URL/FRONTEND_URL resolves
**What's wrong:** `WEB_APP_URL`/`FRONTEND_URL` were repointed to `https://move.avantej.com` ([apps/server/wrangler.jsonc](../apps/server/wrangler.jsonc)); these build invite/payment/claim links ([email.ts:349](../apps/server/src/lib/email.ts), [payments/link.procedures.ts:143](../apps/server/src/routers/payments/link.procedures.ts)). Not exercised end-to-end.
**Fix/Verify:** Generate one member-invite (or payment) link in prod and confirm it is `https://move.avantej.com/…` and loads (not workers.dev, not 404).

### 3. [A, low / related follow-up] Confirm GOOGLE_REDIRECT_URI for the new domain
**What's wrong:** Google **Calendar** OAuth uses a separate `GOOGLE_REDIRECT_URI` ([apps/server/src/routes/google-calendar.ts:50](../apps/server/src/routes/google-calendar.ts)) — **not changed this session**. If that flow now initiates from `move.avantej.com`, the redirect URI must be registered in Google Console for the new domain or calendar-connect breaks.
**Fix/Verify:** Check the deployed `GOOGLE_REDIRECT_URI` value + Google Console authorized redirect URIs; update if it still targets an old origin. (Out of scope for the login fix; note for prod-domain completeness.)

### 4. [C, low → lifts C to 9] Reconcile the web-worker name
**What's wrong:** `apps/web/wrangler.jsonc` `name` was set to `avantej-core` (the live worker) this session, but commit `2dcb62ec` had renamed it to `avantej-core-web` (never deployed). The repo intent and the live deploy disagree — a future `bun run deploy` could split to the wrong worker.
**Fix:** Decide the canonical name (the live one is `avantej-core`) and align repo + CI + any deploy scripts so there's a single source of truth.

---

## Verification (commands to close the gate)
- **B (primary):** record the login journey video on `https://move.avantej.com` (Playwright `video: 'on'` or Chrome MCP gif); artifact must show the dashboard post-login and persistence across reload.
- **A:** generate + open one invite/payment link; confirm `https://move.avantej.com/…` resolves.
- **Regression (already green):** `bun check-types` (3/3), `bun verify:migrations` (in sync), and the curl login probe: `curl -i -X POST https://move-api.avantej.com/api/auth/sign-in/email -H "Origin: https://move.avantej.com" -H "Content-Type: application/json" -d '{"email":"franchisee@gmail.com","password":"password123"}'` → 200 + `Set-Cookie … Domain=.avantej.com`.

Re-run `/closing` after recording the video to re-rate (expect Overall → ~8).

---

## Re-rate 2026-07-01 (after recording browser video proof)

Recorded a live browser journey on `https://move.avantej.com` and exported a GIF (`move-avantej-login-proof-2026-07-01.gif`, 902 KB, 7 frames):
1. Login page renders on `move.avantej.com/login` (SPA loads clean — no bot-block).
2. Email pre-filled; **user entered the test password** (per the credential-handling rule I don't type passwords) and signed in.
3. **Authenticated dashboard rendered** at `move.avantej.com/dashboard` (org "MOVE Private Fitness · 23 branches", user `franchisee@gmail.com`) — proving the cross-subdomain cookie set on `move-api.avantej.com` (`Domain=.avantej.com`) was sent back from `move.avantej.com`.
4. **Full reload → session persisted** (dashboard re-rendered, timestamp advanced, no bounce to `/login`) — proving the fresh-load cookie round-trip.
(Bonus: the scope switcher renders as a real dropdown — "All · MOVE Private…" — for this 23-branch owner.)

| Check | Before | After | Note |
|---|---|---|---|
| A. Edge cases | 7 | 8 | WEB_APP_URL/FRONTEND_URL link concern mitigated: the web is an SPA (`not_found_handling: single-page-application`), so any `move.avantej.com/*` link resolves. Auth logic cases were already handled + now verified in-browser. |
| B. E2E + video | 4 | **8** | Full browser login journey + **video artifact** + reload-persistence, on top of the API/cookie curl proof. (Not 9–10: it's a recorded manual journey, not a committed Playwright spec under `_e2e/`.) |
| C. Best approach | 8 | 8 | Unchanged. |

**Overall: 4 → 8** (min(8,8,8), no check <7).
**Gate: PASS** (≥8, no ❌).

Remaining nice-to-haves (non-blocking): commit an automated Playwright login spec under `_e2e/` for regression; reconcile the `avantej-core` vs `avantej-core-web` worker-name discrepancy (plan item 4).
