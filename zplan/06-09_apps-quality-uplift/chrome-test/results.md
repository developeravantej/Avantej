# Chrome Verification Results — apps-quality-uplift

## Run: 2026-06-09 (blocked — environment, not code)
**Trigger:** /chrome-run → fell back to Claude Preview MCP (Chrome extension unreachable)
**Plan file:** chrome-test/plan.md
**Overall status:** BLOCKED at login — Better-Auth `INVALID_ORIGIN` for the tenant subdomain

### Execution trace
| Step | Tool | Result |
|------|------|--------|
| dev server | bun dev:web | ✅ 3021 UP (200); 3020 already running |
| Chrome extension | tabs_context_mcp ×3 | ❌ "not connected"; list_connected_browsers → [] |
| Fallback: Preview MCP | preview_start "web" | ✅ serverId attached, port 3021 |
| Navigate tenant | preview_eval → avantej.localhost:3021 | ✅ landing page renders |
| Login page | preview_snapshot | ✅ "Welcome back" form renders |
| Fill + submit (React events) | preview_eval | form submits but stays on /login |
| Probe auth API | POST /api/auth/sign-in/email | ❌ **403 `{"message":"Invalid origin","code":"INVALID_ORIGIN"}`** |

### Root cause (environment, unrelated to the refactor)
- `apps/server/src/lib/better-auth.ts:188` builds `trustedOrigins` from `getEnvVar("CORS_ORIGIN")` + a static list (`localhost:3001/3021/4001`). The static list does NOT include the tenant subdomain `http://avantej.localhost:3021`.
- `.dev.vars` sets `CORS_ORIGIN=http://avantej.localhost:3021` (correct), but the **3020 server was already running before this session** and apparently loaded a different/stale env (`.env` has `CORS_ORIGIN=http://localhost:3001`). So the running server rejects the tenant-subdomain origin.
- The real form-submit hit the same 403 silently → why login appeared to "do nothing".

### Verification checkpoints
| # | Check | Result |
|---|-------|--------|
| V1–V7 | POS installment / commission / members / decomposed pages | DID NOT EXECUTE — could not authenticate. No evidence synthesized. |

### Standing proof (automated, already green)
The domain invariants the browser run would confirm are asserted by the committed test suites:
- `pos-workflow.test.tsx` 4/4 — installment amount shown (NOT full price) + commission routes to rotation AND requested trainer.
- `members-tab.test.tsx` 16/16 — list/empty/error + gated actions.
- server isolated unit suite 67/67 (incl. orpc-tenant.middleware exercising the auth-helper refactor).
- type-check 0, oxlint 0.

### To resume the browser run
Either (a) restart the 3020 backend with `.dev.vars` loaded so `CORS_ORIGIN=http://avantej.localhost:3021` takes effect, or (b) add `"http://avantej.localhost:3021"` to the static `trustedOrigins` array in better-auth.ts and restart 3020 — both require restarting the shared backend (a concurrent session may depend on it). Then re-run `/chrome-run zplan/06-09_apps-quality-uplift`.

---
