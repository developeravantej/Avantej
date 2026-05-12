# Service Protocol

> **Page:** `/dashboard/service/view`
> **Covers:** Section 4.7 of `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` — behaviors **S1 – S5** plus the Phase 4.1 handler-level BAD_REQUEST validation for unknown plan codes.
> **Shared setup:** see `docs/testing/_setup.md` (login routines, fixture inventory, MCP cheat sheet, results-file format, cleanup convention).

---

## Pre-conditions

1. Dev stack healthy (`_setup.md` §0.1).
2. Seed data loaded — `bun run scripts/seed-business-data.ts` in `apps/server/` completes cleanly (`_setup.md` §0.2).
3. **Admin logged in** as `franchisee@gmail.com` / `password123` (`_setup.md` §2.1). A cookie `better-auth.session_token` is present.
4. Runtime UUID resolver (`_setup.md` §1.2) executed once — record `organizationId`, `planFullId`, `planHalfId`, plus discovered `planQuarterlyId` for later assertions.
5. **Installment-plans seed present.** Assert via console:
   ```js
   const res = await fetch("/rpc/installmentPlans/list", {
     method: "POST", credentials: "include",
     headers: {"Content-Type":"application/json"},
     body: JSON.stringify({ json: { organizationId } }),
   }).then(r => r.json());
   const codes = res.json.map(p => p.code);
   ["full","half","quarterly"].every(c => codes.includes(c));   // expect true
   res.json.find(p => p.code === "full").isDefault;              // expect true
   ```
6. No leftover `E2E Protocol Service` row from a previous run. If present, deactivate it first (see §6 Cleanup).

**Behaviors covered by phase**

| Phase | Behaviors | Description |
|------|-----------|-------------|
| §1 | S1 | List renders MYR prices (`RM X.XX`), never `$`-prefixed |
| §2 | S2, S3 | Create a session-based package service + payment-plans dropdown is populated from a live `installmentPlans.list` network call |
| §3 | S4 | Toggle `half` + `quarterly`, set `installmentIntervalDays=14`, save, re-read row |
| §4 | S5 | Soft-delete via `isActive: false` |
| §5 | — | **Handler-level** `BAD_REQUEST` when `availablePaymentPlans` references a non-existent plan (tests `services.create` validation from plan.md §5 Phase 4.1 task 5) |
| §6 | — | Cleanup |

---

## §1 — List renders MYR prices (S1)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Navigate to `http://localhost:3001/dashboard/service/view` | Page loads; no spinner after ~2s; "Services" heading visible | `mcp__claude-in-chrome__navigate` |
| 2 | Read page text | Contains at least the seeded "E2E Test Session" row | `mcp__claude-in-chrome__get_page_text` |
| 3 | Assert every price cell matches the MYR format | Execute in console: `Array.from(document.querySelectorAll('table tbody tr td')).map(c => c.textContent.trim()).filter(t => /^(RM|\$|MYR)\s*[-\d]/.test(t)).every(t => /^RM \d+\.\d{2}$/.test(t))` → `true` | `mcp__claude-in-chrome__javascript_tool` |
| 4 | Assert **no `$`-prefixed amounts** appear anywhere in the rendered table | Execute: `Array.from(document.querySelectorAll('table tbody tr td')).every(c => !/^\$/.test(c.textContent.trim()))` → `true` | `mcp__claude-in-chrome__javascript_tool` |
| 5 | Console messages clean | `read_console_messages` returns no new `error`-level lines since page load | `mcp__claude-in-chrome__read_console_messages` |

**Hard-fail triggers:** any `$`-prefixed price (2026-04-16 USD-regression), any `RM X.X` (missing second decimal), any price cell not matching `/^RM \d+\.\d{2}$/`.

---

## §2 — Create a session-based package service (S2, S3)

This phase is the single largest behavioural surface. Network-assertions verify the dropdown is **not** hardcoded.

### §2.1 — Open the form

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 6 | Clear the network request log so subsequent assertions scope to this phase | Log drained / snapshot taken | `mcp__claude-in-chrome__read_network_requests` |
| 7 | Click "Add Service" | Right-side Sheet opens with form fields visible (name, duration, price, etc.) | `mcp__claude-in-chrome__find` (text="Add Service") + `javascript_tool` `.click()` |
| 8 | Assert the form's payment-plans dropdown fetched plans from the API | Run `read_network_requests` and filter: there **must** be a POST to `/rpc/installmentPlans/list` AFTER step 7 with `body.json.organizationId === <org>` and `body.json.activeOnly === true`. Response status 200. **Hard-fail if no such request appears** — this means the dropdown is hardcoded. | `mcp__claude-in-chrome__read_network_requests` |
| 9 | Assert the form renders one checkbox per active plan | In console: `document.querySelectorAll('input[id^="plan-"]').length` ≥ 3 (full, half, quarterly) | `mcp__claude-in-chrome__javascript_tool` |
| 10 | Assert the seed plans are present as options | In console: `["full","half","quarterly"].every(code => !!document.querySelector('#plan-'+code))` → `true` | `mcp__claude-in-chrome__javascript_tool` |

### §2.2 — Fill form fields

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 11 | Fill name = "E2E Protocol Service" | Input value reflects typed string | `mcp__claude-in-chrome__form_input` — target field by `name` or `id="name"` |
| 12 | Fill duration = 60 | Input value = 60; unit selector defaults to "minutes" | `mcp__claude-in-chrome__form_input` |
| 13 | Fill session count = 10 | Input value = 10 (makes this a package-style service) | `mcp__claude-in-chrome__form_input` |
| 14 | Fill price = 500.00 | Input value = "500" (stored as 50000 cents on save) | `mcp__claude-in-chrome__form_input` |
| 15 | Select a category = "E2E Category" | Category dropdown shows selected value | `mcp__claude-in-chrome__javascript_tool` (dispatch change on `<select>` if needed) |
| 16 | Leave scheduling type = "appointment" (default) | Selector value equals `appointment` | `mcp__claude-in-chrome__javascript_tool` |
| 17 | Click Save | Sheet closes; toast "Service created" appears; table shows the new row | `mcp__claude-in-chrome__find` (text="Save") + `javascript_tool` `.click()` |
| 18 | Assert the new service is in the list | Run: `Array.from(document.querySelectorAll('table tbody tr')).some(r => r.textContent.includes("E2E Protocol Service"))` → `true` | `mcp__claude-in-chrome__javascript_tool` |
| 19 | Capture the new service ID for later assertions / cleanup | In console: `(await (await fetch("/rpc/services/list", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ json: { organizationId } }) })).json()).json.find(s => s.name === "E2E Protocol Service").id` — store as `protocolServiceId` | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** `installmentPlans.list` not requested at step 8; fewer than 3 plan checkboxes at step 9; no toast/row after save; server returns 4xx/5xx.

---

## §3 — Toggle payment plans + installmentIntervalDays (S4)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 20 | Find the row for "E2E Protocol Service" and click its edit action | Sheet re-opens in edit mode; form pre-filled from `services.getById` | `mcp__claude-in-chrome__find` + `javascript_tool` |
| 21 | Toggle ON "half" plan checkbox | `#plan-half` checked; `formData.availablePaymentPlans` includes `"half"` | `mcp__claude-in-chrome__javascript_tool` — `document.querySelector('#plan-half').click()` |
| 22 | Toggle ON "quarterly" plan checkbox | `#plan-quarterly` checked | `mcp__claude-in-chrome__javascript_tool` — `document.querySelector('#plan-quarterly').click()` |
| 23 | The "Installment interval (days)" field appears (it is conditionally rendered when any plan has `numInstallments > 1`) | Input with `id="installmentIntervalDays"` is present in the DOM | `mcp__claude-in-chrome__javascript_tool` — `!!document.querySelector('#installmentIntervalDays')` → `true` |
| 24 | Fill installmentIntervalDays = 14 | Input value = "14" | `mcp__claude-in-chrome__form_input` — target by `id=installmentIntervalDays` |
| 25 | Click Save | Sheet closes; toast "Service updated" (or equivalent success) | `mcp__claude-in-chrome__find` + click |
| 26 | Verify persistence via API | Run: `(await (await fetch("/rpc/services/getById", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ json: { organizationId, id: protocolServiceId } }) })).json()).json` — assert `availablePaymentPlans` equals `["half","quarterly"]` (in any order; use `JSON.stringify(plans.sort())` compare) AND `installmentIntervalDays === 14` | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** interval field absent after step 22; API response shows `availablePaymentPlans` missing either code; interval not equal 14.

---

## §4 — Deactivate (S5)

Soft-delete — no hard-delete endpoint exists. Deactivation flips `isActive: false` via `services.update`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 27 | On the "E2E Protocol Service" row, click the Deactivate / delete action | Confirmation dialog opens (Dialog, not browser `confirm`) | `mcp__claude-in-chrome__find` + click |
| 28 | Confirm deactivation | Toast "Service deactivated"; row disappears from the default (active-only) list | `mcp__claude-in-chrome__find` + click the Confirm button |
| 29 | Assert row hidden from default list | `Array.from(document.querySelectorAll('table tbody tr')).some(r => r.textContent.includes("E2E Protocol Service"))` → `false` | `mcp__claude-in-chrome__javascript_tool` |
| 30 | Assert record still in DB with `isActive: false` | Run `services.list` with `isActive: false`: `(await (await fetch("/rpc/services/list", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ json: { organizationId, isActive: false } }) })).json()).json.some(s => s.id === protocolServiceId)` → `true` | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** row still visible in the default active list after confirm; row missing entirely when queried with `isActive: false`.

---

## §5 — BAD_REQUEST on unknown plan code (Phase 4.1 task 5)

This step does **not** use the UI — it calls `services.create` directly to exercise the handler-level validation added in plan.md Phase 4.1. If the handler accepts the unknown code silently, the creation will silently poison downstream installment flows.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 31 | Issue a `create` request with an impossible plan code | Response body contains an ORPC error with code `BAD_REQUEST` and message matching `/Unknown installment plan: nonexistent_plan/`. HTTP status 400 (oRPC maps `BAD_REQUEST` to 400). | `mcp__claude-in-chrome__javascript_tool` — paste the snippet below |

```js
const res = await fetch("/rpc/services/create", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    json: {
      organizationId,
      name: "Should Not Persist — Bad Plan Code",
      duration: 60,
      maxAttendees: 1,
      price: 10000,
      schedulingType: "appointment",
      sessionCount: 5,
      availablePaymentPlans: ["nonexistent_plan"],
    },
  }),
});
const body = await res.json();
({
  status: res.status,
  code: body.json?.code ?? body.code,
  message: body.json?.message ?? body.message,
  raw: body,
});
```

**Expected shape** (exact field names depend on oRPC error envelope, but all three must be satisfied):
- `status === 400`
- `code === "BAD_REQUEST"`
- `message` contains the string `"Unknown installment plan"` (case-sensitive).

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 32 | Confirm nothing persisted | Run `services.list` and assert no row with `name === "Should Not Persist — Bad Plan Code"` exists | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** HTTP 200 / success response; row created anyway; error code not `BAD_REQUEST`; message missing the "Unknown installment plan" substring.

---

## §6 — Cleanup

LIFO order (`_setup.md` §3). This protocol only mutates **its own** row (`E2E Protocol Service`). Seeded rows (`E2E Test Session`, seed plans) must not be touched.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 33 | If `protocolServiceId` is still active (e.g. deactivation step failed), call `services.update` with `isActive: false` | Returns 200 | `mcp__claude-in-chrome__javascript_tool` — `fetch("/rpc/services/update", { ... })` with `{ organizationId, id: protocolServiceId, isActive: false }` |
| 34 | Confirm `services.list` (active-only, default) no longer returns `protocolServiceId` | `some(s => s.id === protocolServiceId)` → `false` | `mcp__claude-in-chrome__javascript_tool` |
| 35 | Confirm the BAD_REQUEST row was never persisted (belt & braces) | `services.list` with `isActive: false` does not include `name === "Should Not Persist — Bad Plan Code"` | `mcp__claude-in-chrome__javascript_tool` |
| 36 | Re-read the seeded plans to confirm the run did not mutate them | `installmentPlans.list` returns the 3 seed plans with `full.isDefault === true`, all three `isActive: true` | `mcp__claude-in-chrome__javascript_tool` |

**On failure:** still execute §6 before writing the run report. Leaving `E2E Protocol Service` active will contaminate subsequent runs and §1's MYR assertion (new $-prefixed rows in the table would trip that check).

---

## Notes

- `formatPrice(val, "MYR")` from `@/lib/currency` is the only currency formatter used by `columns.tsx` (verified 2026-04-17). If a future regression re-introduces a local `formatPrice` that uses USD, §1 catches it on step 3 or 4.
- Payment-plans dropdown is populated by `apps/web/src/components/forms/service-form.tsx` via `client.installmentPlans.list({ organizationId, activeOnly: true })` (line 52). The network assertion in §2 step 8 verifies this is not bypassed.
- The `BAD_REQUEST` validation lives in `packages/api/src/routers/services.ts` `create` handler (lines 222-236). It queries `installmentPlans` with both `code` match **and** `isActive: true` — a **deactivated** plan code produces the same BAD_REQUEST as a non-existent one (tested indirectly here; `installment-plans.md` §5-§6 covers the deactivated case end-to-end).
- The handler also validates on `update` (same snippet, lines 367-381). Not exercised here — covered by `installment-plans.md` §5 when the services-reference warning is recomputed.
