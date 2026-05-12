# Rooms — Admin Flow Test Protocol

> Executable protocol for `/dashboard/rooms/view`.
> Assumes `docs/testing/_setup.md` has been read in full. Do not duplicate login, fixture, or cleanup conventions here — link back.

- **Page:** `/dashboard/rooms/view`
- **Covers behaviors:** R1, R2, R3, R4 (see `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §4.3).
- **R4 note:** the returnTo banner behavior is shared with `appointment-view.md §2`. This protocol's §3 exercises the banner in isolation — the full empty-state flow from Appointments (where the fix actually matters) is covered there.
- **Execution role:** Admin (`franchisee@gmail.com`).

---

## Pre-conditions

1. Dev stack up and seed-verified — see `_setup.md §0`.
2. Logged in as admin per `_setup.md §2.1`.
3. Resolved fixture IDs via the `_setup.md §1.2` snippet. This protocol uses:
   - `organizationId`
   - At least **two branches** must exist in the tenant's hierarchy. Confirm via `rpc("hierarchy/listNodes", {})` filter `type === "branch"` returns `.length >= 2`. If only one branch exists, the R1 combobox filter assertion reduces to "combobox selectable" — note in the run report and still execute. If zero branches exist, abort — the page renders the empty-branches hint and create is impossible.
   - Record the first branch id as `branchAId` and a second as `branchBId`.
4. Assert no leftover rooms named `"Protocol Test Room"` from a previous run. If `rpc("rooms/list", {})` includes one, run §4 Cleanup of the last failed protocol first, OR manually mark it `isActive: false` and proceed (the create test uses the exact name and would succeed either way, but a duplicate obscures the assertion).
5. Known constraint: this page has **no `data-testid`** attributes — assertions rely on text content, `role="alert"`, and button text. See §0.

### 0. Selector cheat sheet (page-specific)

| Element | How to locate (stable today) |
|---|---|
| returnTo banner | `document.querySelector('[role="alert"]')` — the shadcn `Alert` component renders `role="alert"`. Fallback: `document.querySelector('.bg-yellow-50')`. |
| "Back to appointment" link inside banner | Within the banner: `banner.querySelector('a[href]')` — should have `href` starting with the `returnTo` value |
| "Create Room" button (header) | `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Create Room'))` |
| Status tab buttons | `[...document.querySelectorAll('button')].filter(b => ['Active','All','Inactive'].includes(b.textContent.trim()))` |
| Room row | Locate by name cell text: `[...document.querySelectorAll('tbody tr')].find(r => r.textContent.includes('Protocol Test Room'))` |
| Row action dropdown trigger | Within row: the dropdown trigger is the last button (ellipsis menu) — `row.querySelector('button:last-of-type')` — opens the DropdownMenu with Edit / Deactivate / Reactivate |
| Deactivate / Reactivate confirmation `Dialog` | `document.querySelector('[role="dialog"]')` after the menu item is clicked |
| Sheet (create/edit) | `document.querySelector('[role="dialog"]')` — shadcn Sheet also uses `role="dialog"` — distinguish by the visible heading text ("Create Room" vs "Deactivate Room") |
| Form — Name input | `document.querySelector('#room-name')` |
| Form — Capacity input | `document.querySelector('#room-capacity')` |
| Form — Type Select / Branch Combobox | No stable id — locate via Label text, then the neighboring control |

> If any selector fails, the page source has drifted — update the cheat sheet before updating any step.

---

## §1 — List, branch combobox filter, create (R1, R2)

**Goal:** Confirm the list renders across all branches (admin scope), the Create sheet writes a row, and the new row becomes visible.

**Uses:** `name = "Protocol Test Room"`, `type = training`, `capacity = 15`, `branchId = branchAId`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Navigate to `http://localhost:3001/dashboard/rooms/view` | Page renders; heading "Rooms"; status tabs (Active/All/Inactive) visible; "Active" tab selected by default; a badge shows "<N> room(s)"; table lists seed rooms including `"Main Room - <Branch Name>"` entries for every branch that has a seeded room | `mcp__claude-in-chrome__navigate` |
| 2 | Record baseline active-tab row count via `document.querySelectorAll('tbody tr').length` | Record value as `N0` | `mcp__claude-in-chrome__javascript_tool` |
| 3 | (R1 — per-branch filter confirmation) Note: the page has no top-level branch combobox filter in the current code; filtering happens via the DataTable's built-in Name column filter + the Branch column shows branch names resolved client-side via `hierarchy.listNodes`. The "branch combobox" in this protocol refers to the one inside the Create/Edit sheet — see step 7. If a future build adds a top-level branch filter, add it here. For now, verify admin scope by checking that the table contains rooms from at least two distinct branches (if seed provides multiple). | `javascript_tool`: extract the Branch column text of all rows and assert `new Set(branches).size >= 1` (or `>= 2` when multiple branches are seeded) | `javascript_tool` |
| 4 | Click "Create Room" button in the header | Right-side Sheet opens; heading "Create Room"; Name, Type, Capacity, Branch fields visible; no "Active" checkbox (edit-only) | `find` + `javascript_tool` `.click()` |
| 5 | Fill Name input with `"Protocol Test Room"` | Input value matches | `mcp__claude-in-chrome__form_input` (`room-name`) |
| 6 | Open the Type Select and click "Training" | Select trigger text = "Training" | `find` + `javascript_tool` `.click()` |
| 7 | Open the Branch combobox: focus the input under the "Branch" Label; it clears the search and shows the branch list | Dropdown popover appears with all branches | `find` + `javascript_tool`: set focus via `.focus()` on the Input whose Label's `textContent` starts with "Branch" |
| 8 | Click the first branch option (`branchAId`) | Combobox closes; input shows the branch name | `find` + `javascript_tool` `.click()` |
| 9 | Fill Capacity input with `15` | Input value = `15` | `form_input` (`room-capacity`) |
| 10 | Click "Create Room" button in the Sheet footer | Sheet closes; toast "Room created successfully"; no console error | `find` + `javascript_tool` `.click()` + `read_page` + `read_console_messages` |
| 11 | Assert row appears | `document.querySelectorAll('tbody tr').length === N0 + 1` AND a row exists with cell text "Protocol Test Room"; its Type cell reads "Training" (Badge), Capacity `15`, Status "Active"-variant badge | `javascript_tool` |
| 12 | Record the new room id | `rpc("rooms/list", { organizationId })` → find the row with `name === "Protocol Test Room"` and `isActive === true`; record `id` for later steps | `javascript_tool` |

**Pass criteria:** steps 10–12 succeed; no duplicate row.

---

## §2 — Deactivate / tabs / reactivate (R3)

**Goal:** Verify the soft-delete lifecycle: the row disappears from Active, appears on Inactive with a "Reactivate" action, and can be restored.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Locate the "Protocol Test Room" row and open its action dropdown (the ellipsis button in the Actions cell) | DropdownMenu opens with items including "Edit", "Deactivate" (no "Reactivate" — row is active) | `find` + `javascript_tool` `.click()` on the row's `button:last-of-type` |
| 2 | Click "Deactivate" | Confirmation `Dialog` appears; title mentions the room name | `find` + `javascript_tool` `.click()` |
| 3 | Confirm deactivate in the Dialog (click the destructive "Deactivate" button) | Dialog closes; toast `Room "Protocol Test Room" deactivated`; the row disappears from the Active-tab table | `find` + `javascript_tool` `.click()` + `read_page` |
| 4 | Assert row gone from Active tab | No `<tr>` whose textContent includes "Protocol Test Room" remains in the table | `javascript_tool` |
| 5 | Click the "Inactive" tab | URL unchanged; tab underline moves to "Inactive"; a new `POST /rpc/rooms/list` fires with `isActive: false` in the body; table rerenders with inactive rooms only, including "Protocol Test Room" | `find` + `javascript_tool` `.click()` + `read_network_requests` |
| 6 | Locate the "Protocol Test Room" row under Inactive tab | Row present; Status badge shows "Inactive" | `javascript_tool` |
| 7 | Open the row's action dropdown | Menu now contains "Reactivate" (instead of "Deactivate"). Edit may still be present but is gated by `canUpdate` — present for admin. | `find` + `javascript_tool` `.click()` |
| 8 | Click "Reactivate" | Confirmation `Dialog` appears | `find` + `javascript_tool` `.click()` |
| 9 | Confirm in the Dialog | Dialog closes; toast `Room "Protocol Test Room" reactivated`; row disappears from Inactive tab (now active, no longer matches this tab's filter) | `find` + `javascript_tool` `.click()` |
| 10 | Click "Active" tab | `POST /rpc/rooms/list` with `isActive: true` fires; "Protocol Test Room" is back in the Active table | `find` + `javascript_tool` `.click()` + `read_network_requests` |

**Pass criteria:** steps 4 (gone from Active), 6 (visible on Inactive), 10 (back on Active) all hold.

---

## §3 — Integration with appointments — returnTo banner (R4)

**Goal:** Verify the banner renders when `?returnTo=` is present, and that clicking its link navigates back to the appointments page without leaving a stale `AddAppointmentModal` open.

**Caveat (important for reviewers):** navigating directly to `/dashboard/rooms/view?returnTo=...` does NOT exercise the "modal-closed-before-navigate" fix — that fix lives in the empty-state flow from the Appointments page (see `appointment-view.md §2`), where the modal is actually open. This §3 tests only the **rendering and link targeting** of the banner. The strict end-to-end proof of the fix is in `appointment-view.md §2` scenarios A4/A5. A §3 pass here is necessary but not sufficient — do not treat it as proof the fix is intact.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Navigate directly to `http://localhost:3001/dashboard/rooms/view?returnTo=/dashboard/appointment/view` | Page renders; a yellow `Alert` (banner) is present at the top with `role="alert"`; text contains "Creating a room to complete an appointment" and the link text "Back to appointment →" (the plan's "Return to Appointments" phrasing is indicative — actual text is "Back to appointment →" per source) | `mcp__claude-in-chrome__navigate` |
| 2 | Assert banner presence and text | `const b = document.querySelector('[role="alert"]'); b !== null && b.textContent.includes("Back to appointment")` returns `true`. If `role="alert"` finds an empty Alert from a toast system instead, fall back to `document.querySelector('.bg-yellow-50')`. | `javascript_tool` |
| 3 | Assert the banner link targets the returnTo path | `document.querySelector('[role="alert"] a').getAttribute('href') === '/dashboard/appointment/view'` (TanStack `Link` renders an `<a>` with `href` matching the target) | `javascript_tool` |
| 4 | Click the "Back to appointment →" link | URL changes to `http://localhost:3001/dashboard/appointment/view`; appointment calendar page mounts | `find` + `javascript_tool` `.click()` + `read_page` |
| 5 | Assert no `AddAppointmentModal` is open on arrival | `[...document.querySelectorAll('[role="dialog"]')].filter(d => d.textContent.includes('Add Appointment')).length === 0`. In other words: no dialog with the Add Appointment title is in the DOM. | `javascript_tool` |
| 6 | Navigate back to `/dashboard/rooms/view` (without `returnTo`) to continue the run | Page renders; **no banner** (`document.querySelector('[role="alert"]')` either null or not the yellow variant) | `mcp__claude-in-chrome__navigate` + `javascript_tool` |

**Pass criteria:** steps 2, 3, 5 all return `true` / `0`. A step 5 failure would directly contradict the fix (`zplan` plan A5) — flag critical and investigate `AddAppointmentModal` empty-state `onClose()` call ordering.

---

## §4 — Cleanup

**Goal:** Soft-delete the room created in §1. `_setup.md §3` rule 3 prefers soft-delete over hard-delete — we comply. No hard-delete UI exists for rooms in any case.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | On `/dashboard/rooms/view` Active tab, locate the "Protocol Test Room" row. If absent, check Inactive tab — if already inactive, skip to step 4. | Row found on exactly one tab | `javascript_tool` |
| 2 | Open the row's dropdown and click "Deactivate" | Confirmation Dialog appears | `find` + `javascript_tool` `.click()` |
| 3 | Confirm deactivate | Toast `Room "Protocol Test Room" deactivated`; row disappears from Active tab | `find` + `javascript_tool` `.click()` |
| 4 | Post-assert: query `rpc("rooms/list", { organizationId, isActive: true })` and verify no row with `name === "Protocol Test Room"` is returned | Query result confirms the room is no longer active | `javascript_tool` |
| 5 | Optional final hygiene: also verify the row still exists with `isActive: false` via `rpc("rooms/list", { organizationId, isActive: false })` (not hard-deleted, just soft-removed) | Exactly one row with that name, `isActive === false` | `javascript_tool` |

**Post-run note:** the deactivated `"Protocol Test Room"` remains in the tenant DB. Subsequent runs' step §Pre-conditions.4 will flag it — the recommended response is either a) proceed without blocking (the create uses the same name which the backend allows because soft-deleted rows don't block insert by name uniqueness — there is no unique index on name), or b) manually purge via Drizzle Studio before an especially clean run. If you chose (a) repeatedly, the Inactive tab will accumulate "Protocol Test Room" entries — that's a cosmetic contamination, not a functional one.

---

## Run report

On completion, write the result file per `zdocs/testing-results/README.md` template:
`zdocs/testing-results/<YYYY-MM-DD-HHMM>_rooms.md`.

Record the resolved fixture IDs (branchAId, branchBId, new roomId from §1) at the top. Pass/fail each numbered step. If any step failed, still execute §4 Cleanup before writing the report — per `_setup.md §3` rule 2.

---

### See Also
- Empty-state room flow from Appointments: `appointment-view.md §2`
- Cross-flow integration: `cross-flow_service-to-booking.md`
