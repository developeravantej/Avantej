# Appointment View — Test Protocol

**Page:** `/dashboard/appointment/view`
**Covers behaviors:** A1–A14 (see `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §4.1)
**Blast radius:** HIGH — `appointment.service.ts` converges buffer, credit deduction, and package-lock evaluation here
**Expected runtime:** ~15 min
**Prerequisite:** Seed data loaded (`_setup.md` §0), admin logged in (`_setup.md` §2.1)
**Result file:** `zdocs/testing-results/<YYYY-MM-DD-HHMM>_appointment-view.md`

---

## Preamble — selector strategy

The components under test (`TrainerSidebar`, `AddAppointmentModal`, `AppointmentCalendar`) ship no `data-testid` attributes today. This protocol uses **text-based and structural DOM queries** — button text, rendered placeholder strings, and `get_page_text` substring matches. Every assertion is observable from outside the React state tree. If `data-testid` attributes are later added (see plan.md §8 Q4 follow-up), selectors in this doc can tighten.

### Pre-run resolver (run once, record output)

Log in as admin (`_setup.md` §2.1), open DevTools console or use `javascript_tool`, then run the resolver block from `_setup.md` §1.2. Record the returned object; subsequent steps reference keys such as `serviceId`, `trainerMemberId`, `clientUserId`, `roomId`, `categoryId`.

### Locally-used RPC helper

Several steps call the shared helper loaded in `_setup.md` §1.2 (`rpc(path, input)`). If the browser was reloaded since the resolver ran, re-paste it before executing a phase that uses it.

---

## §1 — Role-aware calendar view (A1, A2)

**Goal:** Admin sees "Appointments" + TrainerSidebar (with real name strings, no UUIDs). Trainer sees "My Schedule" with sidebar hidden.

### Pre-conditions

- Admin logged in per `_setup.md` §2.1.
- Resolver has been run; `trainerMemberId` recorded.

### Steps

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1.1 | Navigate to `/dashboard/appointment/view` | Page loads; `<h1>` contains text `Appointments` (NOT `My Schedule`) | `mcp__claude-in-chrome__navigate` |
| 1.2 | `get_page_text` on page | Contains the heading word `Trainers` (rendered by `TrainerSidebar` `CardTitle`) and `All Trainers` button label | `mcp__claude-in-chrome__get_page_text` |
| 1.3 | `javascript_tool`: `Array.from(document.querySelectorAll('button span.block.truncate')).map(n => n.textContent)` | Returns an array with at least one entry; each entry is a non-empty string | `mcp__claude-in-chrome__javascript_tool` |
| 1.4 | Assert no UUID-shaped strings in sidebar. `javascript_tool`: `Array.from(document.querySelectorAll('button span.block.truncate')).map(n => n.textContent).filter(s => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(s))` | Returns `[]` (empty array) — protects against the 2026-04-16 regression where sidebar fell back to `member.userId` | `mcp__claude-in-chrome__javascript_tool` |
| 1.5 | `read_console_messages` | No red errors since navigation | `mcp__claude-in-chrome__read_console_messages` |
| 1.6 | Sign out. `javascript_tool`: `await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }); document.cookie.split(';').forEach(c => { document.cookie = c.split('=')[0].trim() + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });` then `location.assign('/login');` | Lands on `/login` | `mcp__claude-in-chrome__javascript_tool` |
| 1.7 | Trainer login per `_setup.md` §2.3 (`trainer.deterministic@test.com` / `password123`) | Post-login URL is `/dashboard/...`; cookie `better-auth.session_token` set | `form_input` + `find` + `javascript_tool` |
| 1.8 | Navigate to `/dashboard/appointment/view` | `<h1>` text is `My Schedule` | `mcp__claude-in-chrome__navigate` + `read_page` |
| 1.9 | `javascript_tool`: `Array.from(document.querySelectorAll('h3, .text-base')).map(n => n.textContent)` — look for the word "Trainers" (sidebar card title) | The title `Trainers` is NOT present (sidebar is hidden for trainer role) | `mcp__claude-in-chrome__javascript_tool` |
| 1.10 | Additional assertion: `get_page_text` | Does NOT contain the literal `All Trainers` button label | `mcp__claude-in-chrome__get_page_text` |
| 1.11 | Sign out (repeat step 1.6) and log back in as admin (`_setup.md` §2.1) | Admin session restored; `/dashboard/appointment/view` shows `Appointments` heading again | `form_input` + `javascript_tool` |

**Soft-fail note:** if `get_page_text` returns stale content immediately after navigation, wait ~1s and retry. Router transitions are sometimes interleaved with calendar fetches.

---

## §2 — AddAppointmentModal state machine (A3, A6, A7)

**Goal:** Prove the empty-state rooms hint renders with the correct `returnTo` link, and the Employee dropdown enables/disables based on Room selection with the right placeholder text.

### Pre-conditions

- Admin logged in (from §1.11).
- Resolver has been run; `roomId` recorded for the "Main Room" fixture.
- **Runtime branch:** if rooms exist (the default post-seed state), this phase tests A6/A7 first, then temporarily soft-deletes rooms to test A3, then restores them. If rooms are already empty, swap the order.

### 2.A — Employee state machine (A6, A7) — with rooms present

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 2.1 | From `/dashboard/appointment/view`, click "Add Appointment" button. `javascript_tool`: `Array.from(document.querySelectorAll('button')).find(b => /add appointment/i.test(b.textContent))?.click()` | Modal opens; `get_page_text` includes labels `Area` and `Employee` | `javascript_tool` + `read_page` |
| 2.2 | Before any room is selected, assert Employee placeholder. `javascript_tool`: `document.querySelector('[aria-labelledby*="employeeId" i], [id="employeeId"] ~ *, [data-radix-select-trigger]')?.textContent` OR `get_page_text` containing the exact string `Select an area first` | Placeholder text equals `Select an area first` (from `employeePlaceholder` memo, `add-appointment-modal.tsx:383`) | `get_page_text` |
| 2.3 | Assert Employee Select is `disabled`. `javascript_tool`: `Array.from(document.querySelectorAll('[data-radix-select-trigger], button[role="combobox"]')).map(n => ({ text: n.textContent, disabled: n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('disabled') }))` | At least one trigger with text containing `Select an area first` has `disabled === true` | `javascript_tool` |
| 2.4 | Open Area `<Select>` and pick the seeded Main Room. `javascript_tool` (open): `Array.from(document.querySelectorAll('[role="combobox"], [data-radix-select-trigger]')).find(n => /please choose|select/i.test(n.textContent))?.click()` then click item whose text equals resolver's `Main Room - ...` | Area trigger text updates to the room's name | `javascript_tool` |
| 2.5 | Re-assert Employee placeholder. `get_page_text` | Now contains `Select an employee` (NOT `Select an area first`, NOT `There are no employees available`) | `get_page_text` |
| 2.6 | Assert Employee Select is now enabled. `javascript_tool`: same query as 2.3 | Trigger whose text contains `Select an employee` has `disabled === false` | `javascript_tool` |
| 2.7 | Close the modal. `javascript_tool`: press Escape or click the sheet close button: `document.querySelector('[data-state="open"] button[aria-label*="close" i]')?.click()` | Modal closes; calendar visible | `javascript_tool` |

### 2.B — Empty-state rooms hint (A3)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 2.8 | Record IDs of all currently-active rooms: `javascript_tool`: `const r = await rpc("rooms/list", {}); window.__rooms_backup__ = r; r.map(x => x.id)` | Array of UUIDs captured; save for cleanup in §7 | `javascript_tool` |
| 2.9 | Soft-delete every room: `javascript_tool`: `for (const room of window.__rooms_backup__) { await rpc("rooms/delete", { id: room.id }); }` then re-fetch `await rpc("rooms/list", {})` | Returns empty array | `javascript_tool` |
| 2.10 | Reopen "Add Appointment" modal (click the button as in 2.1) | Modal opens | `javascript_tool` |
| 2.11 | Assert empty-state hint renders. `get_page_text` | Contains the exact text `No rooms available.` and `Create one →` | `get_page_text` |
| 2.12 | Assert link href. `javascript_tool`: `document.querySelector('a[href*="/dashboard/rooms/view"]')?.getAttribute('href')` | Returns `/dashboard/rooms/view?returnTo=%2Fdashboard%2Fappointment%2Fview` (or the decoded equivalent `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`) | `javascript_tool` |
| 2.13 | Click the "Create one →" link. `javascript_tool`: `document.querySelector('a[href*="/dashboard/rooms/view"]')?.click()` | Navigates to `/dashboard/rooms/view`; the appointment modal is closed (`onClose()` fires on click per `add-appointment-modal.tsx:2263`) | `javascript_tool` + `read_page` |
| 2.14 | Assert no modal in DOM. `javascript_tool`: `document.querySelector('[role="dialog"][data-state="open"]')` | Returns `null` | `javascript_tool` |
| 2.15 | Navigate back to `/dashboard/appointment/view` | Calendar loads | `mcp__claude-in-chrome__navigate` |

### 2.C — No employees for a room (A7)

The seeded fixture has trainers; `employees` is `teamMembers` from `members.list` (org-wide today, not room-filtered). To reproduce `employees.length === 0`, soft-delete/suspend all member rows EXCEPT the current admin — this is destructive and out of scope for the standard run. We stub this behavior via the empty-placeholder assertion instead:

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 2.16 | **TODO (deferred)** — A7 full reproduction requires suspending all non-admin members, which contaminates seed state. For now, assert the rendered placeholder contract from the source: `get_page_text` after grepping the AddAppointmentModal source confirms the string `There are no employees available` is reachable (line 2304 of `add-appointment-modal.tsx`). Full behavioral assertion of A7 tracked in plan.md §8 Q1. | The literal string `There are no employees available` is present in the component source as the empty-case placeholder | `Grep` (offline) |
| 2.17 | **TODO (multi-appointment mode)** — the multi-appointment codepath at `add-appointment-modal.tsx:~1828` has a separate always-empty dropdown that was **not** updated in the 2026-04-17 Rooms fix. Out of scope for this run; track in plan.md §8 Q1. | n/a — documented gap | — |

### 2.D — Restore rooms

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 2.18 | Restore each room by re-enabling. `javascript_tool`: `for (const room of window.__rooms_backup__) { await rpc("rooms/update", { id: room.id, isActive: true }); }` then `await rpc("rooms/list", {})` | Returns a list including the Main Room fixture by name | `javascript_tool` |

---

## §4 — Buffer enforcement (A8, A9, A10) — REGRESSION-CRITICAL

**Goal:** Confirm the buffer cascade at the booking boundary: category default (15 min) blocks 11:05 and allows 11:15 exactly; trainer's per-service override of 10 min also blocks 11:05 but with the override value echoed in the error.

**Why this matters:** `packages/services/src/buffer-time.service.ts:86–88` computes `bufferedEnd = endTime + bufferMinutes`. A regression here silently drops double-booking protection for every trainer.

### Pre-conditions

- Admin logged in; resolver has been run.
- Seed state: `trainer.deterministic@test.com` has Mon–Fri availability; category "E2E Category" has `bufferTimeMinutes: 15`; service "E2E Test Session" is attached to that category and assigned to the trainer.
- `clientUserId` (for `e2e.client@test.com`) and `packageInstanceId` (half plan, 5 credits unlocked for this phase — confirm installment 1 has been paid in seed, OR pre-step uses `installments/confirmPayment` to unlock 5 credits).
- **Target day:** next Monday. Compute once: `const target = new Date(); target.setDate(target.getDate() + ((1 - target.getDay() + 7) % 7 || 7)); target.setHours(10, 0, 0, 0); // e.g. 2026-04-20 10:00 local`. Record ISO string.

### 4.A — Seed the conflicting first appointment (booked 10:00 → 11:00)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 4.1 | `javascript_tool`: `await rpc("appointments/create", { trainerId: trainerMemberId, serviceId, userId: clientUserId, packageInstanceId, branchId, roomId, startTime: target.toISOString(), duration: 60, type: "personal_training", status: "confirmed", creditsUsed: 1, sessionTotal: 1, pricePerClient: 0 })` (exact input shape per `appointments.create` router — confirm against `packages/api/src/routers/appointments.ts:202`) | Returns `{ id, startTime, endTime, ... }`; record `id` as `window.__appt_A__` for cleanup | `javascript_tool` |
| 4.2 | `read_page` on `/dashboard/appointment/view` (navigate + allow refetch) | A new appointment row/block appears for that trainer on the target day at 10:00 | `navigate` + `read_page` |

### 4.B — Buffer conflict: 11:05 rejected (A8)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 4.3 | Compute `const at1105 = new Date(target); at1105.setHours(11, 5, 0, 0);`. `javascript_tool`: `try { await rpc("appointments/create", { ...same fields..., startTime: at1105.toISOString(), duration: 60 }); return "UNEXPECTED_SUCCESS"; } catch (e) { return String(e.message); }` | Returns a string matching `/A 15-minute buffer is required between bookings\./` (exact phrase from `appointment.service.ts:200`) | `javascript_tool` |

**Soft-fail note:** if the error message format changes across SDK versions, the HTTP response body still contains the phrase — fall back to `fetch("/rpc/appointments/create", ...).then(r => r.text())` and regex-match.

### 4.C — Buffer boundary: 11:15 accepted (A9)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 4.4 | Compute `const at1115 = new Date(target); at1115.setHours(11, 15, 0, 0);`. `javascript_tool`: `await rpc("appointments/create", { ...same fields..., startTime: at1115.toISOString(), duration: 60 })` | Returns `{ id, ... }`; record as `window.__appt_B__` for cleanup | `javascript_tool` |
| 4.5 | Navigate to calendar, `read_page` | Two trainer appointments visible on the target day (10:00 and 11:15) | `read_page` |

### 4.D — Trainer override cascade (A10)

Goal: after the trainer sets their own override for this service to 10 minutes, a booking at 11:05 is **still** rejected and the error message reflects the **10-minute** buffer (proves the cascade reads override, not category default).

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 4.6 | Delete the 11:15 appointment to clear the 11:00→12:15 conflict window. `javascript_tool`: `await rpc("appointments/update", { id: window.__appt_B__, status: "cancelled", cancellationReason: "buffer-test-reset" })` | Success response | `javascript_tool` |
| 4.7 | Sign out (as in 1.6), log in as trainer (`_setup.md` §2.3) | Trainer lands on `/dashboard/appointment/view` with title `My Schedule` | `form_input` + `javascript_tool` |
| 4.8 | Set the trainer's self-override to 10 via RPC (faster than UI; equivalent path per `_setup.md` §1.2 helper pattern). Re-paste `rpc()` helper; run: `await rpc("serviceMembers/updateMyBuffer", { serviceId, bufferTimeMinutes: 10 })` | Returns `{ serviceId, bufferTimeMinutes: 10 }` | `javascript_tool` |
| 4.9 | Sign out, log back in as admin (`_setup.md` §2.1) | Admin session restored | `form_input` + `javascript_tool` |
| 4.10 | Retry the 11:05 booking: `javascript_tool`: `try { await rpc("appointments/create", { ...same fields..., startTime: at1105.toISOString(), duration: 60 }); return "UNEXPECTED_SUCCESS"; } catch (e) { return String(e.message); }` | Returns a string matching `/A 10-minute buffer is required between bookings\./` — confirms override takes priority | `javascript_tool` |
| 4.11 | Assert 11:10 booking still rejected (within 10-min override): `const at1110 = new Date(target); at1110.setHours(11, 10, 0, 0);`. Attempt create. | Rejected with `/A 10-minute buffer is required/` | `javascript_tool` |
| 4.12 | Assert 11:11 accepted (at 10-min boundary — first `endTime` is 11:00 so bufferedEnd is 11:10; start >= 11:10 should clear). Actually: the boundary is **exactly** 11:10 (bufferedEnd = endTime + buffer; conflict when `startTime < bufferedEnd`). Book at 11:10 — still rejected. Book at 11:11 — accepted. Record id as `window.__appt_C__`. | 11:11 booking returns `{ id, ... }` | `javascript_tool` |

**Soft-fail note:** clock-boundary tests are timing-sensitive. If the dev server is under load, DB timestamp precision may round a millisecond off. Compute all times with `setHours(h, m, 0, 0)` (zero seconds & ms) as shown, and if a boundary fails with `/buffer/`, retry once before declaring regression.

### 4.E — Reset override

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 4.13 | Sign out, log in as trainer, clear override: `await rpc("serviceMembers/updateMyBuffer", { serviceId, bufferTimeMinutes: null })` | Returns `{ serviceId, bufferTimeMinutes: null }` | `javascript_tool` |
| 4.14 | Sign out, log back in as admin | Admin session restored | `form_input` + `javascript_tool` |
| 4.15 | Cancel `window.__appt_C__` (so §5 starts clean): `await rpc("appointments/update", { id: window.__appt_C__, status: "cancelled", cancellationReason: "phase-4-cleanup" })` | Success | `javascript_tool` |

---

## §5 — Package-linked booking (A11, A12)

**Goal:** A locked package blocks booking with a distinct error. A package with 0 credits remaining blocks booking with a credit-exhaustion error that includes the credit count.

Note: the codebase has no `packages/manualLock` oRPC procedure. The plan's §5.2 already acknowledges this and offers "direct DB edit" as the force-lock method. This protocol uses a direct tenant-DB SQL statement via the same admin session (captured in the pre-run checklist). If you cannot open a DB console, skip A11 and mark it `BLOCKED — no lock RPC`.

### 5.A — Locked package rejects booking (A11)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 5.1 | **Pre-step (manual, out-of-band):** open a psql/Drizzle Studio console against the tenant DB and run: `UPDATE package_instances SET is_locked = true, locked_at = NOW(), locked_reason = 'e2e-lock-test' WHERE id = :packageInstanceId;` (substitute resolver value) | One row affected | (manual DB console) |
| 5.2 | Verify lock landed: `javascript_tool`: `await rpc("packageInstances/getById", { id: packageInstanceId })` | Response has `isLocked === true` and `lockedReason === "e2e-lock-test"` | `javascript_tool` |
| 5.3 | Attempt a booking against the locked package: `javascript_tool`: `try { await rpc("appointments/create", { trainerId: trainerMemberId, serviceId, userId: clientUserId, packageInstanceId, branchId, roomId, startTime: new Date(target.getTime() + 24*3600*1000).toISOString(), duration: 60, type: "personal_training", status: "confirmed", creditsUsed: 1, sessionTotal: 1, pricePerClient: 0 }); return "UNEXPECTED_SUCCESS"; } catch (e) { return String(e.message); }` | Returns a string matching `/Package is locked due to unpaid installment/` (from `appointment.service.ts:212`) | `javascript_tool` |
| 5.4 | **Unlock for subsequent phase:** `javascript_tool`: `await rpc("installments/manualUnlock", { packageInstanceId, reason: "e2e-unlock" })` | Returns the package instance with `isLocked: false` | `javascript_tool` |

### 5.B — Credit exhaustion rejects booking (A12)

Pre-condition state: by this point the package instance has `creditsUsed = 2` (the A8 seed + A9 booking — both now cancelled but not credit-refunded unless the handler does that). Verify explicitly, then either top up by cancelling both appointments (which should reverse credit-used) OR force `creditsRemaining = 0` via direct DB edit.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 5.5 | Check current credits: `await rpc("packageInstances/getById", { id: packageInstanceId })` | Record `creditsRemaining` and `creditsUsed` | `javascript_tool` |
| 5.6 | **Force 0 credits remaining** via tenant-DB SQL: `UPDATE package_instances SET credits_used = credits_unlocked WHERE id = :packageInstanceId;` — use the UNLOCKED count as the ceiling | One row affected | (manual DB console) |
| 5.7 | Verify via `getById` | `creditsRemaining === 0` | `javascript_tool` |
| 5.8 | Attempt booking: `try { await rpc("appointments/create", { trainerId: trainerMemberId, serviceId, userId: clientUserId, packageInstanceId, branchId, roomId, startTime: new Date(target.getTime() + 48*3600*1000).toISOString(), duration: 60, type: "personal_training", status: "confirmed", creditsUsed: 1, sessionTotal: 1, pricePerClient: 0 }); return "UNEXPECTED_SUCCESS"; } catch (e) { return String(e.message); }` | Returns string matching `/Not enough credits\. You have 0 credits available\./` (from `appointment.service.ts:221`) | `javascript_tool` |
| 5.9 | Restore credits_used to original (see cleanup §7). | `creditsRemaining` returns to pre-phase value | (manual DB console) |

---

## §6 — Update / Cancel (A13, A14)

**Goal:** Updating a confirmed appointment into another appointment's buffer window reuses the buffer-conflict path. Cancelling an appointment hides it from the default calendar view.

### Pre-conditions

- Two confirmed appointments on the target day: recreate the 10:00 booking (`window.__appt_A__` may still exist or be re-created) and a second one at 12:00. Capture both IDs.

### Steps

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 6.1 | Recreate 10:00 booking (if cancelled earlier): `javascript_tool`: `window.__appt_A2__ = await rpc("appointments/create", { ...same fields..., startTime: target.toISOString(), duration: 60 })` | Success; record id | `javascript_tool` |
| 6.2 | Create a 13:00 booking: `const at1300 = new Date(target); at1300.setHours(13, 0, 0, 0);`. `window.__appt_D__ = await rpc("appointments/create", { ..., startTime: at1300.toISOString(), duration: 60 })` | Success; record id | `javascript_tool` |
| 6.3 | Attempt update: move `__appt_D__` startTime to 11:05 (inside the 10:00→11:00 + 15-min buffer window). `try { await rpc("appointments/update", { id: window.__appt_D__.id, startTime: at1105.toISOString(), duration: 60 }); return "UNEXPECTED_SUCCESS"; } catch (e) { return String(e.message); }` | Returns string matching `/A 15-minute buffer is required between bookings\./` (from `appointment.service.ts:302`) | `javascript_tool` |
| 6.4 | Cancel `__appt_A2__`: `await rpc("appointments/update", { id: window.__appt_A2__.id, status: "cancelled", cancellationReason: "phase-6-cancel-test" })` | Success; response `status === "cancelled"` | `javascript_tool` |
| 6.5 | Navigate to `/dashboard/appointment/view`, let calendar refetch. `get_page_text` | The 10:00 slot on the target day no longer renders a confirmed block (cancelled appointments are excluded from the default view per the mapper's status filter) | `navigate` + `get_page_text` |
| 6.6 | Verify the appointment is not deleted but state-changed: `await rpc("appointments/getById", { id: window.__appt_A2__.id })` | `status === "cancelled"`, `cancelledAt` non-null | `javascript_tool` |

---

## §7 — Cleanup (ALWAYS RUNS — even on failure)

Reverse in LIFO order. Every step here must succeed before filing the result report. Failures in cleanup are themselves reportable regressions.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 7.1 | Cancel/delete every appointment created in this run. `javascript_tool`: `const ids = [window.__appt_A__, window.__appt_B__, window.__appt_C__, window.__appt_A2__, window.__appt_D__].filter(Boolean).map(a => a.id || a); for (const id of ids) { try { await rpc("appointments/update", { id, status: "cancelled", cancellationReason: "protocol-cleanup" }); } catch {} }` | No uncaught errors | `javascript_tool` |
| 7.2 | Alternatively, hard-delete any test appointments for `e2e.client@test.com` on the target day: `const list = await rpc("appointments/list", { userId: clientUserId, startFrom: target.toISOString(), startTo: new Date(target.getTime() + 72*3600*1000).toISOString() }); for (const a of list) { await rpc("appointments/delete", { id: a.id }); }` — if `delete` procedure exists; otherwise leave as cancelled (safe — they're hidden from default view) | List returns `[]` after loop | `javascript_tool` |
| 7.3 | Restore trainer override to null (in case phase 4.E was interrupted). Sign out as admin → login as trainer → `await rpc("serviceMembers/updateMyBuffer", { serviceId, bufferTimeMinutes: null })` → sign out → admin login | Returns `{ ..., bufferTimeMinutes: null }` | `form_input` + `javascript_tool` |
| 7.4 | Restore rooms that were soft-deleted in §2.B. `javascript_tool`: `for (const room of (window.__rooms_backup__ || [])) { try { await rpc("rooms/update", { id: room.id, isActive: true }); } catch {} }` | `rpc("rooms/list", {})` returns the original set | `javascript_tool` |
| 7.5 | Restore package instance lock + credit state if modified in §5. Manual SQL: `UPDATE package_instances SET is_locked = false, locked_at = NULL, locked_reason = NULL, credits_used = 0 WHERE id = :packageInstanceId;` | One row affected | (manual DB console) |
| 7.6 | Final assertion: `const pkg = await rpc("packageInstances/getById", { id: packageInstanceId }); ({ isLocked: pkg.isLocked, creditsUsed: pkg.creditsUsed, creditsRemaining: pkg.creditsRemaining })` | Returns `{ isLocked: false, creditsUsed: 0, creditsRemaining: <original value> }` | `javascript_tool` |
| 7.7 | Final assertion: no appointments for `e2e.client@test.com` on or after `target`. `const leftover = await rpc("appointments/list", { userId: clientUserId, startFrom: target.toISOString() }); leftover.length` | Returns `0` (or only pre-existing, non-test appointments — verify by id against `window.__appt_*` ids) | `javascript_tool` |
| 7.8 | Final assertion: category, service, trainer, room fixtures still present via resolver re-run. | All resolver keys still resolve to non-undefined values | `javascript_tool` |

---

## Result-file reminder

On completion, file results at `zdocs/testing-results/<YYYY-MM-DD-HHMM>_appointment-view.md` using the template in `zdocs/testing-results/README.md`. Record pass/fail per numbered step, any soft-fail retries, and any steps skipped (e.g. 2.16 A7-full, 5.A if no DB console access).

**On failure at any point, still run §7 Cleanup before filing the report.** Leaving orphan appointments or a locked package will contaminate the next run.

## Cross-references

- Buffer formula source: `packages/services/src/buffer-time.service.ts:86–88`
- Buffer error string source: `packages/services/src/appointment.service.ts:200, 302`
- Package-locked error source: `packages/services/src/appointment.service.ts:212`
- Credit-exhaustion error source: `packages/services/src/appointment.service.ts:221`
- Modal empty-state hint: `apps/web/src/components/calendar/add-appointment-modal.tsx:2256–2267`
- Employee placeholder memo: `apps/web/src/components/calendar/add-appointment-modal.tsx:382–386`
- Trainer sidebar name fallback (2026-04-16 fix): `apps/web/src/components/calendar/trainer-sidebar.tsx:96–97`
- Multi-appointment mode gap (deferred): `apps/web/src/components/calendar/add-appointment-modal.tsx:~1828` — tracked in `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §8 Q1
