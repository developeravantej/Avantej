# E2E Loop — LEARNINGS (persistent, per-project)

This file is the loop's memory. It is **read at the start of every run** (Phase 0) and
**merged at the end** (Phase 5 Reflect) — never wiped. Copy to `_e2e/loop/LEARNINGS.md`,
commit it, and let it grow. Keep it deduped and pruned; stale entries mislead future runs.

> How the loop uses each section:
> - **false-positive signatures** → the verify pass auto-drops matching findings.
> - **flaky routes** → pre-apply the noted stabilization (e.g. `waitForWithReload`) and don't
>   report the known flake as a bug.
> - **param recipes** → fill route params / forms safely without guessing.
> - **known bugs** → don't re-file; track whether each is still reproducing (regression view).
> - **tuning** → adjust caps/scope next run.

## Machine-readable (verify pass + orchestrator read this block)

```json
{
  "falsePositiveSignatures": [
    { "match": "Download the React DevTools", "reason": "dev-only info log, not a bug" },
    { "match": "infinite-spinner on first paint", "reason": "dev-server cold-start; use waitForWithReload, not a product bug — confirm with a reload before filing" }
  ],
  "flakyRoutes": [
    { "path": "/admin/*", "note": "TanStack Start cold-start can wedge or 404 a valid route; reload unsticks it. Treat first-load failures as flake unless they persist after 2 reloads." }
  ],
  "paramRecipes": [
    { "pattern": "/shipment/:id", "how": "open /shipments, click the first row to get a real id; never invent one" }
  ],
  "skipRoutes": ["/admin/billing", "/logout"]
}
```

## Confirmed bugs (regression tracker)

<!-- One line each: [severity] route — symptom — first-seen run — still reproducing? -->
- _(none yet)_

## Flaky / environmental (NOT product bugs)

- Dev server (`bun run dev`) intermittently wedges on cold start — global spinner or transient
  404. The warden restarts it; the crawl should reload-and-retry before filing anything.

## Good selectors / testids discovered

<!-- route -> stable selector that worked, so next run is faster + less flaky -->
- _(add as found)_

## Param-fill recipes

- _(how to safely reach parameterized routes — derive ids from list pages, never fabricate)_

## Tuning notes

- _(caps that were too low/high, scope that was too wide/narrow, time budget per route)_

## Skill-improvement ideas (proposed — review before applying to the skill)

<!-- These describe changes to the e2e-loop SKILL itself. They are NOT auto-applied;
     the loop writes proposals to _e2e/loop/SKILL-IMPROVEMENTS.md for the user to review. -->
- _(e.g. "add a check for duplicate React keys", "capture HAR not just network.txt")_

<!-- ===== run 2026-06-03 (Avantej dashboard) ===== -->

## Confirmed bugs (regression-track)
- **google-calendar 500** — `/dashboard/settings/google-calendar`: `googleCalendar.orgStatus` + `listConnectedCalendars` return 500. Still reproduces. [blocker]
- **stuck client-side load** — `/dashboard/{brands,categories,suppliers,uom,uom-conversions,stock-requests,transfer-orders,payment}/view`, `/dashboard/settings/installment-plans`, `/dashboard/inventory-options`: persistent spinner, content never renders on direct navigation, **no failing network request**. [high]
- **inventory-options** also throws `[pageerror] undefined`. [high]
- **Radix DialogContent missing DialogTitle** — `/dashboard/{packages,memberships}/view`. [low a11y]
- **React duplicate key** — `CancelledSalesTab` (`/dashboard/cancelled-sales/view`). [low]

## falsePositiveSignatures (auto-drop next run)
- `a11y-blocker` "icon-only button without accessible label" → **TanStackRouterDevtoolsPanel** (dev-only, not in prod build).
- `console-error` matching `TanStack Router Devtools|writeText.*Clipboard|NotAllowedError` → dev devtools under headless.
- `console-error` matching `Failed to load resource.*500` → browser echo of a network-5xx; dedupe into the network finding.
- `dead-control` with no other symptom → low-confidence; most need preconditions (selected row/loaded data).
- `infinite-spinner`/`slow` that CLEARS on a warm isolated reload → Vite dev cold-compile, not a product bug. (Only real if it persists after networkidle+3s on warm reload, like the inventory pages above.)

## paramRecipes / flakyRoutes / env
- **AUTH HOST GOTCHA:** e2e auth state (`e2e/.auth/tenant-admin.json`) is seeded against `localhost:3021` (playwright default baseURL) → cookies are host-scoped to `localhost`. Explore at **`http://localhost:3021`**, NOT `avantej.localhost` (Better-Auth cookies won't carry to the subdomain; you'll silently get the login page). Refresh auth with `bunx playwright test --project=setup`.
- **Warden unusable here:** its Node-`fetch` health probe can't resolve `.localhost` subdomains (ENOTFOUND) and thrash-kills `bun dev`. Run `bun dev` manually; gate on `curl localhost:3021`.
- **Explorer auth check must run AFTER networkidle** — SPA redirects to /login post-hydration; an early URL check misses expiry.
- Param routes still need recipes: `branch/$id`, `customers/$id`, `sales/$id`.
