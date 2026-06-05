# E2E Loop — findings

_Report-only. Clustered by root cause; diffed vs last run._

**5 new · 0 regressed · 0 recurring · 0 resolved**
**Coverage:** 56 explored, 0 skipped, 0 not reached (of 56). 5 clusters / 14 raw.

## NEW (5)
### [BLOCKER] Google Calendar settings page fails with 500 (orgStatus + listConnectedCalendars)  ·  1 route(s)
- **Category:** network-5xx  ·  **Routes:** `/dashboard/settings/google-calendar`
- **Observed:** `500 POST http://localhost:3021/rpc/googleCalendar/orgStatus || 500 POST http://localhost:3021/rpc/googleCalendar/listConnectedCalendars || 500 POST http://localhost:3021/rpc/googleCalendar/orgStatus |`
- **Evidence:** [screenshot](evidence/dashboard_settings_google_calendar/shot.png) · [console](evidence/dashboard_settings_google_calendar/console.txt) · [network](evidence/dashboard_settings_google_calendar/network.txt) · [trace](evidence/dashboard_settings_google_calendar/trace.zip)

### [HIGH] Route shows a persistent spinner and never renders its content (direct navigation)  ·  9 route(s)
- **Category:** infinite-spinner  ·  **Routes:** `/dashboard/brands/view`, `/dashboard/categories/view`, `/dashboard/payment/view`, `/dashboard/settings/installment-plans`, `/dashboard/stock-requests/view`, `/dashboard/suppliers/view`, `/dashboard/transfer-orders/view`, `/dashboard/uom-conversions/view`, `/dashboard/uom/view`
- **Observed:** `Loading spinner remains visible after networkidle + 3s; main content (list/table) never appears; no failing network request — a stuck client-side load.`
- **Evidence:** [screenshot](evidence/dashboard_brands_view/shot.png) · [console](evidence/dashboard_brands_view/console.txt) · [network](evidence/dashboard_brands_view/network.txt) · [trace](evidence/dashboard_brands_view/trace.zip)

### [HIGH] inventory-options throws an undefined page error and content never renders  ·  1 route(s)
- **Category:** unhandled-exception  ·  **Routes:** `/dashboard/inventory-options`
- **Observed:** `[pageerror] undefined`
- **Evidence:** [screenshot](evidence/dashboard_inventory_options/shot.png) · [console](evidence/dashboard_inventory_options/console.txt) · [network](evidence/dashboard_inventory_options/network.txt) · [trace](evidence/dashboard_inventory_options/trace.zip)

### [LOW] Radix DialogContent missing a DialogTitle (screen-reader a11y)  ·  2 route(s)
- **Category:** console-error  ·  **Routes:** `/dashboard/memberships/view`, `/dashboard/packages/view`
- **Observed:** `'DialogContent' requires a 'DialogTitle' for the component to be accessible for screen reader users.`
- **Evidence:** [screenshot](evidence/dashboard_memberships_view/shot.png) · [console](evidence/dashboard_memberships_view/console.txt) · [network](evidence/dashboard_memberships_view/network.txt) · [trace](evidence/dashboard_memberships_view/trace.zip)

### [LOW] React duplicate/missing key warning in CancelledSalesTab  ·  1 route(s)
- **Category:** console-error  ·  **Routes:** `/dashboard/cancelled-sales/view`
- **Observed:** `[error] Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information. 

Check the render method of 'CancelledSalesTab'. `
- **Evidence:** [screenshot](evidence/dashboard_cancelled_sales_view/shot.png) · [console](evidence/dashboard_cancelled_sales_view/console.txt) · [network](evidence/dashboard_cancelled_sales_view/network.txt) · [trace](evidence/dashboard_cancelled_sales_view/trace.zip)

---

## Coverage & methodology (honest limits)

**Scope:** all 56 `/dashboard/*` routes (read-only + non-persisting interactions). Auth: pre-seeded tenant-admin (`franchisee@gmail.com`) against `localhost:3021`. Server run manually (`bun dev`); the bundled warden was disabled — its Node-`fetch` health probe can't resolve the `.localhost` tenant subdomain and thrash-killed the dev server.

**What was driven:** 56/56 routes opened; ~9 avg interactions/page (tabs, non-destructive buttons, open/close dialogs & menus). Each page checked for console errors, 4xx/5xx, page exceptions, infinite spinners, broken renders (NaN/undefined/[object Object]), broken images, error boundaries, and a11y-blockers.

**Depth limits (not covered):**
- **No write-flows submitted.** Despite `safe-writes` mode, generic form submission across 56 unknown forms can't be reliably self-cleaned, so no records were created/edited/deleted. POS sale completion, payments, approvals, deletes, sends — **not exercised**. Use the curated `e2e` skill for those journeys.
- **Param routes skipped** (no id recipe): `branch/$id`, `customers/$id`, `sales/$id`. Detail pages untested.
- **platform-admin/* excluded** — out of tenant-admin scope (control-panel role).
- **Test tenant has sparse data** — empty tables mean row-level actions (edit/expand/row menus) were largely unexercised.

**False positives dropped by the verify pass (100 raw → 14 confirmed):**
- **a11y icon-only button (×41)** — belongs to `TanStackRouterDevtoolsPanel`, a **dev-only** tool absent from production builds.
- **"TanStack Router Devtools: Failed to copy / clipboard permission denied" console errors** — dev devtools under headless Chromium, not the app.
- **dead-control (×41)** — buttons that produced no *visible* effect; most require preconditions (selected row, loaded data). Not evidence of breakage → dropped per "default to drop when uncertain."
- **slow / cold-spinner (×14)** — Vite dev-mode on-demand route compilation under crawl load; **not** the same as the confirmed stuck-render bug (which persists on warm reload with no failing request).

**Run integrity note:** the first attempt silently crawled the **login page** 56× because the 3-day-old auth cookie had expired and the SPA redirected to `/login` *after* DOMContentLoaded (the explorer's URL check ran too early). Caught via an interactables-uniformity anomaly, fixed (post-redirect auth re-check + auth refresh), and the run was redone. The findings above are from the valid authenticated run.
