# Package Instances Protocol

**Page:** `/dashboard/packages/instances/view`
**Covers:** PI1, PI2, PI3, PI4 (from `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §4.8)
**Authoring reference:** `zhub/pages/web-dashboard-packages-instances-view.md`

> Setup, login, MCP cheat sheet, seed fixtures, cleanup rules, results-file naming, and the runtime-UUID resolver (`js` snippet) all live in `docs/testing/_setup.md`. This protocol DOES NOT duplicate them — every `<fixture>.id` placeholder below is resolved via `_setup.md` §1.2.

---

## Pre-conditions

- **Stack up:** `_setup.md` §0.1 passed (`curl` sanity checks).
- **Seed:** `cd apps/server && bun run scripts/seed-business-data.ts` has been run. No leftover rows from a previous run of this protocol (see Cleanup §5 — re-run if any exist).
- **Login:** Admin (`franchisee@gmail.com`) via `_setup.md` §2.1.
- **Resolved fixture IDs:** Run `_setup.md` §1.2 resolver snippet. Record at least `organizationId`, `serviceId` (= "E2E Test Session"), `clientUserId` (= e2e.client user id), `planHalfId`.
- **Seed state assertion:** Exactly one seeded package instance for `clientUserId` with `paymentPlanType === "half"`, `creditsTotal === 10`, `creditsUnlocked === 5`, `installmentsPaid === 1`, `installmentsTotal === 2`, `status === "active"`, `isLocked === false`.

Fail-fast snippet (paste into `mcp__claude-in-chrome__javascript_tool` after the resolver):

```js
const overview = await fetch("/rpc/installments/adminOverview", {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: { organizationId, limit: 50, offset: 0 } }),
}).then(r => r.json()).then(j => j.json);
const seeded = overview.items.find(i => i.clientId === clientUserId && i.paymentPlanType === "half");
console.assert(seeded, "Seeded half-plan instance missing — re-run seed");
console.assert(seeded.creditsUnlocked === 5, `creditsUnlocked expected 5, got ${seeded.creditsUnlocked}`);
console.assert(seeded.installmentsPaid === 1, `installmentsPaid expected 1, got ${seeded.installmentsPaid}`);
seededInstanceId = seeded.id; // reuse in Cleanup and cross-references
return { seededInstanceId, creditsUnlocked: seeded.creditsUnlocked };
```

---

## §1. List + status tabs + client name resolution (PI1)

Verifies: rows filter by status tab; `services.list` fires on mount (always-on) regardless of tab; serviceName resolves through the in-memory `serviceNameById` map.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Navigate to the page | URL `/dashboard/packages/instances/view`; header "Package Instances"; five tabs visible: All / Active / Expired / Exhausted / Cancelled | `mcp__claude-in-chrome__navigate` to `http://localhost:3001/dashboard/packages/instances/view`, then `read_page` |
| 2 | Inspect network on mount | Two GETs fire even with no sheet open: `packageInstances/listAll` AND `services/list` (the always-on name-resolver query — note: `services/list` is fetched with NO `isActive` filter). The second `services/list` call (for the dropdown, with `isActive: true`) is NOT fired yet. | `mcp__claude-in-chrome__read_network_requests` — look for two distinct POSTs to `/rpc/services/list`; only one should exist at this point |
| 3 | Assert row for seeded half-plan instance | A row with Service = "E2E Test Session" (NOT a hex-prefix fallback like `a1b2c3d4…`), Source = "Assigned" or "Purchased" per seed, Credits Used column = "0 / 10", Remaining = `0` (half-plan forces `creditsRemaining=0`), Status = "Active" | `mcp__claude-in-chrome__javascript_tool`: `Array.from(document.querySelectorAll('tbody tr')).map(r => r.textContent)` — filter for "E2E Test Session" |
| 4 | Click the "Active" tab | Request URL body contains `"status":"active"`; tab button gets `border-primary` class; rows update to active-only | `mcp__claude-in-chrome__javascript_tool` → `document.evaluate("//button[normalize-space()='Active']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.click()`; then `read_network_requests` |
| 5 | Click the "Cancelled" tab | Request fires with `"status":"cancelled"`; table becomes empty (no cancelled seed rows) or shows only cancelled rows from prior contaminated runs | `javascript_tool` click + `read_network_requests` + `read_page` |
| 6 | Switch back to the "All" tab | Request body omits `status` key; all rows returned | `javascript_tool` click; `read_network_requests` |
| 7 | Verify `servicesList` name resolver still resolves after tab switches | The seeded row STILL shows "E2E Test Session" (not a UUID fallback). This proves the `allServices` query stays cached across tab toggles (does not refire on every tab click). | `javascript_tool` → count `/rpc/services/list` entries in `read_network_requests`; should NOT grow on tab clicks |

---

## §2. Create sheet — lazy services dropdown (PI2)

Verifies: opening the Assign Package sheet triggers the on-demand `services/list` query (filtered to `isActive: true`), and the dropdown contains only services with `sessionCount > 0` AND `isActive: true`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Count `/rpc/services/list` requests BEFORE opening sheet | Exactly one `services/list` call from §1 step 2 (the always-on name resolver). No second call yet. | `mcp__claude-in-chrome__read_network_requests` → filter path `/rpc/services/list` |
| 2 | Click "Assign Package" button | Sheet opens; title "Assign Package"; form fields: Package (Select), Client ID, Source, Credits, Start/Expiry Dates, Total Price, Payment Status, Remark | `javascript_tool` → `document.evaluate("//button[normalize-space()='Assign Package']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue.click()`; `read_page` |
| 3 | Re-count `/rpc/services/list` requests | Now TWO requests — the new one has `isActive: true` in its body (the lazy dropdown query). This proves `enabled: !!organizationId && createOpen` fired on sheet open. | `mcp__claude-in-chrome__read_network_requests` — new entry's body: `"isActive":true` |
| 4 | Open the Package select dropdown | Dropdown shows only services where `sessionCount != null && sessionCount > 0` AND `isActive === true`. At minimum: "E2E Test Session" is present. | `javascript_tool` click the `SelectTrigger#inst-package`, then `read_page` |
| 5 | Verify a non-package service is hidden | A known session-less service (e.g. one with `sessionCount == null` — pick any seeded service without package fields) does NOT appear in the dropdown | Cross-check against the resolver's services list: any service with `sessionCount === null` should be absent |
| 6 | Close sheet via Cancel | Sheet closes; form resets to EMPTY_FORM (Package select is empty on next open) | `javascript_tool` → click the Cancel button; then `read_page` |

---

## §3. Manual assign — full credits (PI3)

Verifies: a full-credit manual assignment creates a row with `creditsRemaining === creditsTotal` and `source === "assigned"`. The UI form does NOT expose `paymentPlanType` — this path exercises the non-installment branch only.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click "Assign Package" to reopen the sheet | Sheet open; form empty | `javascript_tool` click |
| 2 | Select package "E2E Test Session" | `form.serviceId` = the resolved `serviceId` | `javascript_tool` — use `SelectTrigger` click then click the matching `SelectItem` (shadcn Select is a portal; find in `[role="listbox"]`) |
| 3 | Fill Client ID = `clientUserId` (from resolver) | Input value matches the UUID | `mcp__claude-in-chrome__form_input` on `#inst-client` |
| 4 | Keep Source = "Assigned (by staff)" (default) | Select reads "Assigned (by staff)" | `read_page` to confirm |
| 5 | Fill Credits = 10 | Input value = `10` | `form_input` on `#inst-credits` |
| 6 | Fill Start Date = today (default is today; leave unchanged) | `form.startsAt` = today ISO-date | — |
| 7 | Fill Expiry Date = today + 90 days | Input value = `YYYY-MM-DD` 90 days out | `form_input` on `#inst-expiry` (compute date in `javascript_tool`) |
| 8 | Fill Total Price (RM) = `500` | Input value = `500` | `form_input` on `#inst-price` |
| 9 | Leave Payment Status = "Pending" | — | — |
| 10 | Submit (click "Assign Package") | Network POST `/rpc/packageInstances/create`; response 200; toast "Package assigned successfully."; sheet closes; a new row appears in the table with Credits Used = "0 / 10", Remaining = "10", Total (MYR) = "RM 500.00" | `javascript_tool` click the submit button; `read_network_requests`; `read_page` |
| 11 | Record the new instance id | Parse `overviewData.items[].id` where `clientId === clientUserId` AND the row is NOT the seeded half-plan instance (different `paymentPlanType === null`). Store as `createdInstanceIdPI3`. | `javascript_tool` fetch `/rpc/packageInstances/listAll` or diff against `seededInstanceId` |
| 12 | Cross-check the row | `creditsRemaining === creditsTotal === 10`, `paymentPlanType === null`, `source === "assigned"`, `installmentsTotal === 1` (plan-less rows get default 1), `creditsUnlocked === null` | `javascript_tool` fetch `/rpc/packageInstances/getById` with the recorded id |

---

## §4. Create with `paymentPlanType = "half"` — installment schedule auto-generated (PI4)

Verifies: when `paymentPlanType === "half"` is supplied, `creditsRemaining` is forced to 0, `creditsUnlocked` starts at 0, and `createInstallmentSchedule` runs server-side producing 2 installment rows.

> **The UI form does NOT expose `paymentPlanType`.** It is accepted by the oRPC router (`packageInstances.create`) but the `<Sheet>` form (lines 80–90, 388–549 in `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`) only sends the subset of fields listed in the form state. This phase therefore tests the BACKEND behavior directly via `fetch` to `/rpc/packageInstances/create`. The native purchase flow is the only first-class UI surface that sets `paymentPlanType`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Build the request body | `{ organizationId, serviceId, clientId: clientUserId, source: "assigned", creditsTotal: 10, totalPrice: 50000, startsAt: <today ISO>, expiresAt: <today+90d ISO>, paymentStatus: "pending", paymentPlanType: "half" }`. Note `totalPrice` is cents (not RM). | `javascript_tool` — compose the object in JS |
| 2 | POST `/rpc/packageInstances/create` | HTTP 200; response `json` contains the new instance: `paymentPlanType === "half"`, `creditsRemaining === 0`, `creditsUnlocked === 0`, `installmentsTotal === 2` (resolved from plans DB — `half` plan has `numInstallments === 2`), `installmentsPaid === 0` | `javascript_tool` → `fetch("/rpc/packageInstances/create", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({json: <body>}) }).then(r=>r.json())` |
| 3 | Record new instance id as `createdInstanceIdPI4` | — | — |
| 4 | Fetch the generated installment schedule | `/rpc/installments/listByPackageInstance` with `packageInstanceId: createdInstanceIdPI4` returns **exactly 2 rows**, both `status === "pending"`, `installmentNumber` 1 and 2. Installment 1's `dueDate` ≈ today (purchaseDate offset 0 days), installment 2's `dueDate` ≈ today + 30 days (the `half` plan's `defaultIntervalDays`). Sum of `amount` = totalPrice in cents = 50000. | `javascript_tool` → `fetch("/rpc/installments/listByPackageInstance", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({json:{organizationId, packageInstanceId: createdInstanceIdPI4}}) }).then(r=>r.json())` |
| 5 | Reload the page, find the new row | Table row exists; Status badge = "Active"; Credits = "0 / 10"; Remaining = 0 | `navigate` → same URL; `read_page` |

---

## §5. Cleanup

Every created row in this run is hard-deleted. Seed rows (`seededInstanceId` and its 2 installments) MUST remain untouched.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Collect the IDs created during this run: `createdInstanceIdPI3`, `createdInstanceIdPI4`. For PI4 also collect the 2 installment IDs generated in §4 step 4. | Two instance IDs + two installment IDs recorded | `javascript_tool` variables |
| 2 | There is no `/rpc/packageInstances/delete` endpoint. Hard-delete via Drizzle Studio OR via a direct SQL run in `bun db:studio`. Run: `DELETE FROM installments WHERE package_instance_id IN ('<PI4_id>');` then `DELETE FROM package_instances WHERE id IN ('<PI3_id>','<PI4_id>');` | Both rows gone | `bun db:studio` — manual SQL; record the exact SQL run in the results file |
| 3 | Post-cleanup assertion | Fetch `/rpc/packageInstances/listAll` with `clientId: clientUserId`. The only row should be `seededInstanceId`. `creditsUnlocked === 5`, `installmentsPaid === 1`, `status === "active"` — unchanged by this run. | `javascript_tool` fetch |
| 4 | If post-assertion fails | Stop. Run `bun run scripts/seed-business-data.ts` to restore. Document in results file. | — |

---

## Notes

- The `creditsRemaining = 0` for half-plan instances is enforced server-side in `createPackageInstance` (`packages/services/src/package-instance.service.ts`) when `installmentsTotal > 1`. Do NOT assert the creation RPC *input* includes `creditsRemaining` — the router re-derives it.
- `services.list` caching: the page uses two TanStack Query keys (`services-packages` for the dropdown with `createOpen` as an enable gate, and `services-all` for the always-on name map). Both share the same `services.list` RPC but with different input shapes. When counting network calls, filter by request body — not just path.
- If a future UI change adds a `paymentPlanType` select to the form, move §4 to a UI-driven table.
