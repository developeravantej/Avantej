# Trainers — Admin Flow Protocol

> **Page:** `/dashboard/trainers/view`
> **Covers behaviors:** T1, T2, T3, T4, T5, T6 (plan §4.4)
> **Prerequisite:** Full seed data loaded and admin login completed per `docs/testing/_setup.md` §0, §1, §2.1. Step §5 (T6 role-switch) additionally uses trainer login per §2.3.
> **Result file:** On execution, write results to `zdocs/testing-results/<YYYY-MM-DD-HHMM>_trainers.md` per `_setup.md` §5.

All mutations made by this run are reversed in §6 Cleanup. Never delete the seeded `trainer.deterministic@test.com` member — the cross-flow protocol depends on it.

---

## Pre-conditions

Before starting:

- Admin session cookie present.
- Fixture resolver (`_setup.md §1.2`) returns defined values for `trainerMemberId`, `serviceId` (E2E Test Session).
- No previous-run leftovers: no trainers with email starting with `e2e.protocol.trainer` exist; no buffer overrides for `trainerMemberId` against any service that this protocol will touch. Probe:

```js
const organizationId = "996febce-aaad-4ded-8f47-02d2b566c8ee";
async function rpc(path, input) {
  const r = await fetch(`/rpc/${path}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { ...input, organizationId } }),
  });
  return (await r.json()).json;
}
const trainers = await rpc("members/list", { role: "trainer" });
const leftovers = trainers.filter((m) => m.email.startsWith("e2e.protocol.trainer")).map((m) => m.id);
return { leftovers };
```

Expected: `leftovers.length === 0`. If any exist, run §6 Cleanup first.

---

## §1 — List + search (300 ms debounce) (T1)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Go to `http://localhost:3001/dashboard/trainers/view` | Heading `Trainers`; table of trainers renders with at least `trainer.deterministic@test.com` present | `mcp__claude-in-chrome__navigate` then `mcp__claude-in-chrome__read_page` |
| 2 | Capture initial network snapshot (baseline) — record how many `POST /rpc/members/list` and `POST /rpc/memberProfiles/get` requests fired during page load | Expected: 1 `members/list` + N `memberProfiles/get` (one per trainer) | `mcp__claude-in-chrome__read_network_requests` |
| 3 | Type `deterministic` quickly into the search box (top-left, placeholder `Search name, email, or specialization...`) in a single burst | Input accepts value | `mcp__claude-in-chrome__form_input` |
| 4 | Within the next 150 ms, confirm **no** new API calls fired — search is **client-side** filtering on already-fetched data; the 300 ms `useDebounce` only gates the filter predicate, not a network refetch (see `trainers/view.tsx:106` + `:399-408`) | `read_network_requests` diff vs. step 2 shows zero new `members/list` / `memberProfiles/get` requests | `mcp__claude-in-chrome__read_network_requests` |
| 5 | After ≥ 300 ms, assert the visible table rows include only rows whose `name`, `email`, `displayName`, or `specialization` contain `deterministic` (case-insensitive) | Only matching trainer row(s) visible | `mcp__claude-in-chrome__javascript_tool` → `[...document.querySelectorAll('table tbody tr')].map(r => r.textContent)` |
| 6 | Clear the search input | Full list re-renders (client-side) | `mcp__claude-in-chrome__form_input` |

**Note on "exactly 1 network call" framing from plan §4.4 T1:** The page does **not** fire any network call on search typing (data is pre-fetched and filtered client-side). The zero-network-call assertion above is the correct behavioral check for this implementation.

---

## §2 — Create trainer (T2)

Creates a throwaway trainer `e2e.protocol.trainer@test.com`. Step §6 Cleanup suspends and removes it.

Note: `members.create` requires the email to already exist as a registered user. If the user does not exist yet, create it first via the admin sign-up or invitation flow. For this protocol we assume `e2e.protocol.trainer@test.com` has been registered once in a prior run (or will be inserted by a seed extension). If the Save in step 6 fails with "user not found", skip the rest of §2 and record the blocker.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click **Add Trainer** (top-right, next to search) | Sheet opens; `SheetTitle` text = `Add Trainer`; Profile section is open by default | `mcp__claude-in-chrome__find` + `javascript_tool` click |
| 2 | Fill email input (id=`trainer-email`) with `e2e.protocol.trainer@test.com` | Value set | `mcp__claude-in-chrome__form_input` |
| 3 | Open the Hierarchy Scope Select (id=`trainer-scope`) and pick the primary branch (same scope as `trainer.deterministic`) | A hierarchy node option is picked; the Select shows the node name | `mcp__claude-in-chrome__javascript_tool` → open Select, `.click()` on desired `[role="option"]` |
| 4 | Fill `trainer-display-name` with `E2E Protocol Trainer` | Value set | `mcp__claude-in-chrome__form_input` |
| 5 | (Optional) Fill `trainer-specialization` with `QA` | Value set | `mcp__claude-in-chrome__form_input` |
| 6 | Click **Add Trainer** (submit button at the bottom of the Sheet) | Toast `Trainer added successfully.`; Sheet closes; table re-renders; new row with email `e2e.protocol.trainer@test.com` and specialization `QA` appears | `mcp__claude-in-chrome__read_page` |
| 7 | Assert the save fired both `members.create` and `memberProfiles.upsert` (component calls both sequentially) | `read_network_requests` shows both POSTs with status 200 | `mcp__claude-in-chrome__read_network_requests` |
| 8 | Capture the new `memberId` for §6 Cleanup: `members.list({ role:"trainer" })` and find by email | Return non-null UUID | `mcp__claude-in-chrome__javascript_tool` |

---

## §3 — Weekly availability editor (T3)

Switch to the seeded `trainer.deterministic@test.com` trainer (already has Mon–Fri 09:00–17:00 per seed). We will add an additional block, save, reload, and verify persistence. Any blocks added here are reversed in §6 Cleanup.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | In the table, click **Edit** on the `trainer.deterministic@test.com` row | Sheet opens with `SheetTitle` = `Edit Trainer`; Profile section open; Weekly Availability and Category Buffer Times sections collapsed by default | `mcp__claude-in-chrome__find` (by button text) + click |
| 2 | Click the **Weekly Availability** collapsible header | Section expands; `TrainerAvailabilityEditor` renders; existing blocks (Mon–Fri 09:00–17:00) visible | `mcp__claude-in-chrome__javascript_tool` |
| 3 | Add a new block: Saturday 10:00–14:00 (use the editor's Add/Plus button, then the day/time pickers) | New row appears in the editor; values match | `mcp__claude-in-chrome__find` + `form_input` |
| 4 | Click **Save** inside the availability editor | Toast `Availability saved` (emitted from `onSaved` in `trainers/view.tsx:802`) | `mcp__claude-in-chrome__read_page` |
| 5 | Close the Sheet (Cancel or X) | Sheet closes; table visible | `mcp__claude-in-chrome__javascript_tool` |
| 6 | Hard-reload the page (`navigate` to the same URL to force a clean fetch) | Page reloads; trainers list re-fetches | `mcp__claude-in-chrome__navigate` |
| 7 | Re-open Edit on the same trainer, expand **Weekly Availability** again | Saturday 10:00–14:00 block is still present (persisted) | `mcp__claude-in-chrome__read_page` |
| 8 | Record the Saturday block id/signature so §6 Cleanup can remove it | Value captured | `mcp__claude-in-chrome__javascript_tool` or `read_page` |

---

## §4 — Category Buffer Times (per-service) overrides (T4, T5)

Uses admin → `serviceMembers.updateBuffer` path. The "Category Buffer Times" section is actually **per-service** (heading is a misnomer — see `zhub/pages/web-dashboard-trainers-view.md`). Overrides set here are reversed in §6 Cleanup.

Target service: `E2E Test Session` (resolved as `serviceId`). Target member: `trainer.deterministic@test.com` (resolved as `trainerMemberId`).

### §4.1 Lazy-load verification

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | If the Sheet from §3 is still open on the trainer row, close and re-open it to get a clean network baseline | Sheet opens fresh | `mcp__claude-in-chrome__javascript_tool` |
| 2 | With the Sheet open but **before** expanding Category Buffer Times, record `read_network_requests` | No `POST /rpc/serviceMembers/listForMember` present (query is gated by `bufferSectionOpen` — `trainers/view.tsx:180`) | `mcp__claude-in-chrome__read_network_requests` |
| 3 | Click the **Category Buffer Times** collapsible header | Section expands; a `serviceMembers.listForMember` POST fires with `{ organizationId, memberId: trainerMemberId }` | `mcp__claude-in-chrome__javascript_tool` + `read_network_requests` |
| 4 | Rows render — one per service the trainer is assigned to (includes `E2E Test Session`). Each row shows category name · `Category default: X min` (or `None`) and an **Edit** icon | At least one row for `E2E Test Session` visible | `mcp__claude-in-chrome__read_page` |

### §4.2 Set override = 20 min (T4)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click the Edit (pencil) icon next to `E2E Test Session` | Row switches to an inline editor: a number input + Save + Cancel buttons | `mcp__claude-in-chrome__javascript_tool` |
| 2 | Clear the input and type `20` | Value = 20 | `mcp__claude-in-chrome__form_input` |
| 3 | Click **Save** | Toast `Buffer time updated.`; row exits edit mode; override text reads `20 min` (not `Using default`) — see `trainers/view.tsx:896-898` | `mcp__claude-in-chrome__read_page` |
| 4 | Confirm via API: `serviceMembers.listForMember({ organizationId, memberId: trainerMemberId })` returns a row for `serviceId` with `bufferTimeMinutes === 20` | Payload has override present | `mcp__claude-in-chrome__javascript_tool` → `fetch("/rpc/serviceMembers/listForMember", ...)` |

### §4.3 Clear override (empty string) (T5)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click the Edit icon on the same row | Inline editor opens; value pre-fills with `20` | `mcp__claude-in-chrome__javascript_tool` |
| 2 | Clear the input entirely (empty string) | Input value = `` | `mcp__claude-in-chrome__form_input` |
| 3 | Click **Save** | `updateBuffer` fires with `bufferTimeMinutes: null` (empty input parsed to `null` — `trainers/view.tsx:869-873`); toast `Buffer time updated.`; row's override column reverts to `Using default` | `mcp__claude-in-chrome__read_page` |
| 4 | Confirm the backend row was deleted: `serviceMembers.listForMember({ organizationId, memberId: trainerMemberId })` returns the row for `serviceId` with `bufferTimeMinutes === null` | Payload `bufferTimeMinutes` is `null` | `mcp__claude-in-chrome__javascript_tool` |

---

## §5 — Suspend + role-switch (T6)

> **Note:** We have not verified in code that Better-Auth blocks login for a suspended member, nor that `appointments.create` rejects suspended trainers. This step records **observed** behavior rather than asserting a specific outcome. Phrase results descriptively ("login succeeded" / "login blocked"; "booking accepted" / "booking rejected with <message>").

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | From the trainers table, click **Suspend** on the `e2e.protocol.trainer@test.com` row (created in §2). **Do NOT suspend the seeded `trainer.deterministic@test.com`** — the cross-flow depends on it. | Toast `Trainer suspended.`; row's Status column changes to `Suspended` (red badge) — see `trainers/view.tsx:455` | `mcp__claude-in-chrome__find` + `javascript_tool` click |
| 2 | Confirm via API: `members.list({ organizationId, role:"trainer", status:"suspended" })` includes the suspended member | Payload includes the member with `status === "suspended"` | `mcp__claude-in-chrome__javascript_tool` |
| 3 | Sign out the admin: either click the sign-out link in the sidebar, OR run `fetch("/api/auth/sign-out", { method:"POST", credentials:"include" })`. Clear cookies for `localhost:3001` (see `_setup.md §2.4`). | Session cookie cleared; navigation to `/dashboard/*` redirects to `/login` | `mcp__claude-in-chrome__javascript_tool` + `navigate` |
| 4 | Attempt to log in as `e2e.protocol.trainer@test.com` with `password123` per `_setup.md §2.3` (adjust email). **Record the outcome verbatim** — do not assume a specific banner string. | Record: (a) did login succeed / fail, (b) any error message shown, (c) if login succeeded, does the dashboard render any Suspended indicator | `mcp__claude-in-chrome__form_input` + `navigate` + `read_page` |
| 5 | (Only if step 4 login succeeded) Attempt to create an appointment as this trainer using a raw oRPC call from the console: `fetch("/rpc/appointments/create", { method:"POST", credentials:"include", ... body: <valid payload> })`. Record the full response. | Record: (a) HTTP status, (b) response JSON (error code + message if any), (c) whether a row was actually created. | `mcp__claude-in-chrome__javascript_tool` |
| 6 | Sign out the trainer and log back in as admin (`_setup.md §2.1`) | Admin dashboard visible again | `mcp__claude-in-chrome__navigate` + `form_input` |

---

## §6 — Cleanup

Reverses every mutation made in §2–§5. Must run even on step failure.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | If `e2e.protocol.trainer@test.com` is currently suspended, reactivate it via UI (**Reactivate** button) or API: `members.reactivate({ organizationId, memberId })`. If you prefer to leave it suspended but non-seeded, use `members.deactivate` to set `status: "inactive"`. Pick one and record which was chosen. | Member status changes back to `active` (or stays `inactive`) | `mcp__claude-in-chrome__find` + click, or `javascript_tool` |
| 2 | Remove the Saturday availability block added in §3 by opening the seeded trainer's Weekly Availability section and deleting the Saturday block via the editor's delete affordance, then Save | Saturday block gone; toast `Availability saved` | `mcp__claude-in-chrome__javascript_tool` |
| 3 | Re-confirm the override for `serviceId` on `trainerMemberId` is cleared: `serviceMembers.listForMember(...)` row has `bufferTimeMinutes === null` (§4.3 already did this; verify now that no regressions slipped in). If an override remains, call `serviceMembers.updateBuffer({ organizationId, memberId: trainerMemberId, serviceId, bufferTimeMinutes: null })`. | Final state: no override row in `member_service_buffer_overrides` for this (member, service) pair | `mcp__claude-in-chrome__javascript_tool` |
| 4 | Final assertion: re-run the Pre-conditions probe — `leftovers.length === 0` and `trainerMemberId` still resolvable via the fixture resolver | Environment returns to starting state | `mcp__claude-in-chrome__javascript_tool` |

**Note:** There is no hard-delete procedure for a `members` row from the UI. The throwaway trainer from §2 remains in the DB as `inactive` (or `active` if you chose to reactivate). This is acceptable — subsequent runs filter it out via the email prefix check in Pre-conditions, or the protocol reuses the same email (idempotent upsert on `members.create` via the underlying service).

---

### See Also

- Integration of these three cascade levels (override → service → category default → 0) is verified end-to-end in `cross-flow_service-to-booking.md §7`.
- Raw buffer enforcement lives in `appointment-view.md §4`.
