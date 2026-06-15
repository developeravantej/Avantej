# Class Slots — Admin Flow Test Protocol

> Executable protocol for `/dashboard/appointment/class-slots/view`.
> Assumes `docs/testing/_setup.md` has been read in full. Do not duplicate login, fixture, or cleanup conventions here — link back.

- **Page:** `/dashboard/appointment/class-slots/view`
- **Covers behaviors:** CS1, CS2, CS3, CS4, CS5 (see `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §4.2).
- **Execution role:** Admin (`franchisee@gmail.com`).

---

## Pre-conditions

1. Dev stack up and seed-verified — see `_setup.md §0` (`curl -I :3001`, `curl :3000/ping`, `bun run scripts/seed-business-data.ts`).
2. Logged in as admin per `_setup.md §2.1`.
3. Resolved fixture IDs via the `_setup.md §1.2` snippet. This protocol uses:
   - `organizationId`
   - `serviceId` — resolved from name "E2E Test Session" (must be a group-schedulable service; if seed's "E2E Test Session" is `schedulingType: "appointment"`, the service still appears in the filter/create dropdown because the backend does not filter by scheduling type, but the created slot will be technically orphaned from a classSlot POV — fine for a protocol run).
   - `branchId` — resolved via `rpc("hierarchy/listNodes", {})` and filtering `type === "branch"`. Record the primary branch id.
   - `trainerMemberId` — the deterministic trainer member id.
4. Assert no leftover slots from a previous run on the **test date** (`2026-05-01`, hard-coded — never use "today + N days"). If `rpc("classSlots/list", { from, to })` returns non-empty for that date, run §5 Cleanup of the last failed protocol first.
5. Known constraint: this page has **no `data-testid`** attributes — assertions rely on text content, button text, and computed CSS. See §0 below.

### 0. Selector cheat sheet (page-specific)

| Element | How to locate (stable today) |
|---|---|
| Create sheet "Create Class Slot" button | `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create Class Slot')` |
| Row | Locate by the service-name cell text, then walk up to the `<tr>`: `[...document.querySelectorAll('tr')].find(r => r.textContent.includes('<serviceName>') && r.textContent.includes('<startTime>'))` |
| Row Edit button | Within row: `row.querySelector('button:nth-of-type(1)')` — first button in the Actions cell is Edit |
| Row Cancel Class button | Within row: `row.querySelector('button:nth-of-type(2)')` — the destructive text button |
| Cancel dialog reason textarea | `document.querySelector('#cancel-reason')` |
| Apply button (filter bar) | `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Apply')` |
| Status badge (row) | The span/badge inside the "Status" column — text is "Available", "Full", or "Cancelled" |

> If any of these cease to resolve, the page source has drifted — update the cheat sheet before updating any step.

---

## §1 — Create a class slot (CS1)

**Goal:** Open the Create sheet, fill the required fields, submit, verify the row appears with `booked=0` and `available=capacity`.

**Uses:** hard-coded test date `2026-05-01`, `startTime=10:00`, `endTime=11:00`, `capacity=10`, location `"Protocol Test"`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Navigate to `http://localhost:3001/dashboard/appointment/class-slots/view` | Page renders; heading "Class Slots"; "Create Class Slot" button visible | `mcp__claude-in-chrome__navigate` |
| 2 | Record baseline row count via `document.querySelectorAll('tbody tr').length` | Record value as `N0` | `mcp__claude-in-chrome__javascript_tool` |
| 3 | Click "Create Class Slot" button | Right-side Sheet opens; title "Create Class Slot"; Service dropdown visible | `find` + `javascript_tool` `.click()` |
| 4 | In the Sheet, open the Service Select and click the "E2E Test Session" option | Select trigger now shows "E2E Test Session"; `createForm.serviceId === serviceId` (not directly inspectable — infer from the trigger text) | `find` + `javascript_tool` `.click()` |
| 5 | Fill Branch ID input with the resolved `branchId` | Field value matches the branch UUID | `mcp__claude-in-chrome__form_input` (name/id `create-branch`) |
| 6 | Fill Date input with `2026-05-01` | Field value = `2026-05-01` | `form_input` (`create-date`) |
| 7 | Fill Start Time input with `10:00` | Field value = `10:00` | `form_input` (`create-start`) |
| 8 | Fill End Time input with `11:00` | Field value = `11:00` | `form_input` (`create-end`) |
| 9 | Overwrite Capacity input with `10` | Field value = `10` | `form_input` (`create-capacity`) |
| 10 | Fill Location input with `"Protocol Test"` | Field value = `Protocol Test` | `form_input` (`create-location`) |
| 11 | Click "Create" button in the Sheet footer | Sheet closes; toast "Class slot created successfully."; no console error | `find` + `javascript_tool` `.click()`; then `mcp__claude-in-chrome__read_page` + `read_console_messages` |
| 12 | Assert row count increased by 1 | `document.querySelectorAll('tbody tr').length === N0 + 1` | `javascript_tool` |
| 13 | Locate the new row by its date cell and startTime, then read its cells | Row contains `"5/1/2026"` (or locale equivalent), `"10:00 – 11:00"`, Capacity `10`, Booked `0`, Available `10`, Status badge text `"Available"` | `javascript_tool` — scan the new `<tr>` via `row.innerText.split('\n')` or per-cell `td.textContent` |
| 14 | Record the new slot id | The page does not render the id — resolve via `rpc("classSlots/list", { serviceId, from: "2026-05-01T00:00:00.000Z", to: "2026-05-01T23:59:59.999Z" })` and pick the row whose `startTime === "10:00"` | `javascript_tool` (use the resolver pattern from `_setup.md §1.2`) |

**Pass criteria:** row appears, available badge shown, console clean.

---

## §2 — Filter is apply-only, NOT reactive (CS2)

**Goal:** Prove that changing filter values alone does not trigger a new `classSlots.list` request — only the Apply button does. This documents the deliberate manual-apply behavior the page ships today.

**Why it matters:** several seed rows may exist; a reactive filter would visibly refetch on each keystroke. The page's design is intentional (see the class-slots view route source under `apps/web/src/routes/` and plan §6 Phase 6.1.2), but a future refactor could silently regress it.

**Preparation:** still on the page from §1. At least one slot now exists (§1 created it); ideally a second service's slot exists too — if not, the assertion "filter narrows" at step 7 just reduces to "filter is applied on click" which is still meaningful.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Clear any prior network capture, then read current network history | Baseline recorded; note count of `POST /rpc/classSlots/list` entries — call it `C0` | `mcp__claude-in-chrome__read_network_requests` |
| 2 | Open the "Service" filter Select in the filter bar and click a non-default service option (any seed service that is NOT "E2E Test Session") | Select trigger text changes to the new option; no spinner; no re-render of table rows beyond the select re-render | `find` + `javascript_tool` `.click()` |
| 3 | Wait ~1 second, then re-read network history | **Critical:** the count of `POST /rpc/classSlots/list` is still `C0` (NO new request was dispatched) | `read_network_requests` |
| 4 | Also change the "From" input to `2026-05-01` | Field value `2026-05-01`; still no new list request | `form_input` (`filter-from`) |
| 5 | Also tick the "Show available only" checkbox | Checkbox checked; still no new list request | `find` + `javascript_tool` `.click()` (checkbox) |
| 6 | Re-read network history | `POST /rpc/classSlots/list` count remains `C0`. **This is the non-reactive filter assertion.** | `read_network_requests` |
| 7 | Click the "Apply" button | A single new `POST /rpc/classSlots/list` fires; request body `json` object contains `serviceId`, `from: "2026-05-01T00:00:00.000Z"`, `isAvailable: true` (or matches whichever filters were set). Table rerenders with the filtered result set (which may be empty for the non-E2E service on that date). | `find` + `javascript_tool` `.click()` + `read_network_requests` |
| 8 | Re-read network history | `POST /rpc/classSlots/list` count is now `C0 + 1` | `read_network_requests` |
| 9 | Click the "Clear" button | All four filter inputs reset to empty/false; **NO** new list request fires (same rule — clear is also apply-only) | `find` + `javascript_tool` `.click()` + `read_network_requests` |
| 10 | Click Apply again to restore the default unfiltered view for §3 | Table shows all slots again, including the one created in §1 | `find` + `javascript_tool` `.click()` |

**Pass criteria:** steps 3, 6, and 9 show zero new `classSlots.list` requests; only step 7 (and step 10) fire. If step 3 or 6 shows a new request, the page has regressed to reactive filtering — flag as a regression, not a protocol failure.

---

## §3 — Cancel a slot with reason; assert action buttons disabled (CS3, CS4)

**Goal:** Cancel the slot created in §1, confirm the row's status changes to "Cancelled" and both Edit and Cancel Class buttons on that row become disabled.

**Note:** the cancellation reason field is optional in the UI, but the protocol fills it with `"protocol-test"` so future runs can grep for this marker in the DB if a state got contaminated.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Locate the §1 row (by date `5/1/2026` + startTime `10:00`) and record its position | `<tr>` handle resolved; Actions cell contains two buttons, both currently enabled | `javascript_tool` (see §0 selector cheat sheet) |
| 2 | Click the row's "Cancel Class" button (the second button in the Actions cell) | Confirmation `Dialog` opens; title "Cancel Class Slot"; description mentions the date and startTime; Textarea placeholder "e.g. Instructor unavailable" visible | `find` + `javascript_tool` `.click()` |
| 3 | Fill the "Cancellation reason (optional)" textarea with `"protocol-test"` | `document.querySelector('#cancel-reason').value === 'protocol-test'` | `form_input` (id `cancel-reason`) |
| 4 | Click the destructive "Cancel Class" button in the dialog footer | Dialog closes; toast "Class slot cancelled."; no console error | `find` + `javascript_tool` `.click()` + `read_console_messages` |
| 5 | Verify row status badge | The same row's Status cell now contains `"Cancelled"` (destructive variant badge) | `javascript_tool` — re-resolve the row and read the status cell textContent |
| 6 | Verify both Edit and Cancel Class buttons on that row are disabled (CS4) | `row.querySelector('button:nth-of-type(1)').disabled === true` AND `row.querySelector('button:nth-of-type(2)').disabled === true` | `javascript_tool` — return both booleans |
| 7 | Defensive: click the disabled Edit button (should be a no-op) | No Sheet opens; `document.querySelector('[role="dialog"]')` for the edit sheet remains absent | `find` + `javascript_tool` `.click()` |

**Pass criteria:** step 5 shows "Cancelled" badge, step 6 returns `[true, true]`, step 7 produces no state change.

---

## §4 — RBAC scope — out-of-scope branchId on create (CS5)

**Goal:** Verify the server rejects a `classSlots.create` call with a `branchId` the admin's `accessibleNodeIds` does not cover. We issue the call via `fetch` directly rather than through the UI — the UI has a plain text input with no client-side scope enforcement, so it would let the payload through and the backend response is what we want to assert.

**Caveat:** the zero-UUID used below (`00000000-0000-0000-0000-000000000000`) does not exist anywhere, so the backend may reply with `NOT_FOUND` rather than `FORBIDDEN`. Both are acceptable failure modes — we only assert that it **does not succeed**. For a stricter cross-org test (where the branchId is real but belongs to another org), manual setup is required (seed a second org); out of scope for this protocol run.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | From the dashboard page (cookies attached), run: `await fetch("/rpc/classSlots/create", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json: { organizationId, serviceId, branchId: "00000000-0000-0000-0000-000000000000", date: "2026-05-01T00:00:00.000Z", startTime: "12:00", endTime: "13:00", capacity: 5 } }) }).then(r => ({ status: r.status, body: await r.text() }))` | `status` is one of `400`, `403`, `404`, or `500`; `body` contains an error descriptor — likely `FORBIDDEN`, `branch not in scope`, `NOT_FOUND`, or a validation error. **Must not** be `200`. | `javascript_tool` |
| 2 | Confirm no new row appeared in the table | `document.querySelectorAll('tbody tr').length` unchanged from §3 end state | `javascript_tool` |
| 3 | Console messages | No uncaught-promise errors; any `Uncaught (in promise)` related to the above fetch is a soft fail worth flagging but not a protocol blocker | `mcp__claude-in-chrome__read_console_messages` |

**Pass criteria:** step 1 status ≠ 200 AND step 2 row count unchanged. If status === 200 with a slot actually created, file a critical RBAC-bypass regression and halt.

---

## §5 — Cleanup

**Goal:** Reverse the §1 creation. §3 already cancelled the §1 slot, so no extra cancel call is needed — but we confirm the state is consistent and, if §3 did not run (e.g. §3 failed before cancel), we cancel it here.

Follows `_setup.md §3` (LIFO, run-on-failure, verify-with-post-assertion, never touch seed rows).

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Check whether the §1 slot is still not-cancelled by querying: `rpc("classSlots/list", { serviceId, from: "2026-05-01T00:00:00.000Z", to: "2026-05-01T23:59:59.999Z" })`, find the row with `startTime === "10:00"` and inspect `isCancelled` | If `isCancelled === true`, skip step 2. Otherwise proceed to step 2. | `javascript_tool` |
| 2 | **Only if not already cancelled:** POST `/rpc/classSlots/cancel` with `{ organizationId, id: <slotId>, cancellationReason: "protocol-cleanup" }` | Response `status === 200` | `javascript_tool` |
| 3 | Re-fetch the list for `2026-05-01`; confirm the §1 slot is now `isCancelled: true` | Assertion passes | `javascript_tool` |
| 4 | Assert no stray rows created by §4 | The fetch from §4 step 1 did not succeed (asserted there). As a final check: `rpc("classSlots/list", { serviceId, from: "2026-05-01T00:00:00.000Z", to: "2026-05-01T23:59:59.999Z" })` returns exactly one row (the §1 slot, now cancelled). | `javascript_tool` |

**Post-run note:** class_slots rows are NOT hard-deleted by the UI or this protocol. The `isCancelled: true` state is the terminal cleanup. If DB contamination builds up over many runs, manually delete the rows in Drizzle Studio — the seed script does not touch `class_slots`.

---

## Run report

On completion, write the result file per `zdocs/testing-results/README.md` template:
`zdocs/testing-results/<YYYY-MM-DD-HHMM>_class-slots.md`.

Record the resolved fixture IDs at the top (per `_setup.md §1.2`). Pass/fail each numbered step. If any step failed, still execute §5 Cleanup before writing the report — per `_setup.md §3` rule 2.

---

### See Also
- Empty-state room flow from Appointments: `appointment-view.md §2`
- Cross-flow integration: `cross-flow_service-to-booking.md`
