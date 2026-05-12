# Installment Plans Protocol

> **Page:** `/dashboard/settings/installment-plans`
> **Covers:** Section 4.10 of `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` — behaviors **IP1 – IP6**.
> **Shared setup:** see `docs/testing/_setup.md` (login routines, fixture inventory, MCP cheat sheet, cleanup convention).

---

## Pre-conditions

1. Dev stack healthy (`_setup.md` §0.1).
2. Seed data loaded — `bun run scripts/seed-business-data.ts` in `apps/server/` completes cleanly (`_setup.md` §0.2). Seed inserts **three** plans: `full` (default), `half`, `quarterly`.
3. **Admin logged in** as `franchisee@gmail.com` / `password123` (`_setup.md` §2.1).
4. Runtime UUID resolver (`_setup.md` §1.2) executed once — record `organizationId`, `planFullId`, `planHalfId`, plus discover `planQuarterlyId` via a `/rpc/installmentPlans/list` fetch.
5. **Seeded E2E Test Session service references the `half` plan.** This is the fixture used by §5 to verify the "referenced by N services" warning. Confirm via:
   ```js
   const res = await fetch("/rpc/services/list", {
     method: "POST", credentials: "include",
     headers: {"Content-Type":"application/json"},
     body: JSON.stringify({ json: { organizationId, isActive: true } }),
   }).then(r => r.json());
   const ref = res.json.filter(s => (s.availablePaymentPlans ?? []).includes("half")).length;
   ref >= 1;   // expect true — protocol will assert the warning shows "N >= 1"
   ```
6. No leftover `e2e_monthly_6` plan from a prior run (hard-fail the precondition check if present — that row would trip the unique-code assertion in §2).
7. Seed plan state is canonical:
   ```js
   const plans = (await (await fetch("/rpc/installmentPlans/list", {
     method: "POST", credentials: "include",
     headers: {"Content-Type":"application/json"},
     body: JSON.stringify({ json: { organizationId } })
   })).json()).json;
   // Expect:
   plans.find(p => p.code === "full").isDefault === true;
   plans.find(p => p.code === "half").isDefault === false;
   plans.find(p => p.code === "quarterly").isDefault === false;
   plans.every(p => p.isActive === true);
   ```
   If any assertion fails, re-seed (or run §7 Cleanup of the last-failed run) before starting.

**Behaviors covered by phase**

| Phase | Behaviors | Description |
|------|-----------|-------------|
| §1 | IP1 | List seeded plans; `full` has the default star |
| §2 | IP2 | Create `e2e_monthly_6`; unique-code rejection on retry |
| §3 | IP3 | Immutable `code` — attempt to change is silently ignored; other fields persist |
| §4 | IP4 | `setDefault` via star icon — 2-row transaction clears prior default |
| §5 | IP5 | Deactivate plan referenced by services — dialog shows "referenced by N services" warning |
| §6 | IP6 | Deactivate current default — `isActive: false` AND `isDefault: false` silently cleared, no other plan auto-promoted |
| §7 | — | Cleanup: delete `e2e_monthly_6`; restore `full` as default; reactivate `half` if deactivated |

---

## §1 — List seeded rows (IP1)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Navigate to `http://localhost:3001/dashboard/settings/installment-plans` | Page loads; heading "Installment Plans" visible | `mcp__claude-in-chrome__navigate` |
| 2 | Read page text | Contains all three seed plan codes: `full`, `half`, `quarterly` | `mcp__claude-in-chrome__get_page_text` |
| 3 | Assert row count ≥ 3 (Active tab default) | In console: `document.querySelectorAll('table tbody tr').length >= 3` → `true` | `mcp__claude-in-chrome__javascript_tool` |
| 4 | Assert `full` row displays a filled default star | In console: find the `<tr>` whose text contains the badge `full`, then within that row query `button[title="Current default"]` — it must exist and the `Star` inside must have the `fill-amber-400` class. Snippet: `Array.from(document.querySelectorAll('table tbody tr')).find(r => r.textContent.includes("full"))?.querySelector('svg.fill-amber-400') !== null` → `true` | `mcp__claude-in-chrome__javascript_tool` |
| 5 | Assert `half` and `quarterly` rows have **non-default** stars (hover-state "Set as default") | For each row, its `svg` lacks the `fill-amber-400` class and the button `title` is `"Set as default"` | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** any seed plan missing; multiple rows with `fill-amber-400` (default is supposed to be single-row).

---

## §2 — Create new plan + unique-code rejection (IP2)

### §2.1 — Successful create

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 6 | Click "Add Plan" (top-right) | Right-side Sheet opens; title "Add Installment Plan" | `mcp__claude-in-chrome__find` + `javascript_tool` `.click()` |
| 7 | Fill `code` = `e2e_monthly_6` | Input `#ip-code` value = `e2e_monthly_6` (monospace font) | `mcp__claude-in-chrome__form_input` |
| 8 | Fill `name` = `E2E Monthly (6 payments)` | Input `#ip-name` reflects the value | `mcp__claude-in-chrome__form_input` |
| 9 | Fill `numInstallments` = `6` | Input `#ip-num-installments` value = `6` | `mcp__claude-in-chrome__form_input` |
| 10 | Fill `defaultIntervalDays` = `30` | Input `#ip-interval-days` value = `30` | `mcp__claude-in-chrome__form_input` |
| 11 | Leave `isDefault` unchecked | Checkbox `#ip-default` is NOT checked | `mcp__claude-in-chrome__javascript_tool` — `document.querySelector('#ip-default[data-state="checked"]') === null` → `true` |
| 12 | Click Save ("Add Plan" button inside the sheet footer) | Sheet closes; toast "Installment plan created successfully." appears; new row visible in table | `mcp__claude-in-chrome__find` (text="Add Plan", footer-scoped) + `javascript_tool` `.click()` |
| 13 | Capture `e2eMonthlyPlanId` for cleanup | In console: `(await (await fetch("/rpc/installmentPlans/list", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ json: { organizationId } }) })).json()).json.find(p => p.code === "e2e_monthly_6").id` — store | `mcp__claude-in-chrome__javascript_tool` |

### §2.2 — Duplicate-code attempt

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 14 | Click "Add Plan" again | Sheet re-opens, empty | `mcp__claude-in-chrome__find` + click |
| 15 | Fill `code` = `e2e_monthly_6` (same as before) + name = `Duplicate attempt` + numInstallments = 6 + intervalDays = 30 | Inputs accept the values | `mcp__claude-in-chrome__form_input` (x4) |
| 16 | Click Save | Error toast appears (message from server contains a unique-constraint / duplicate hint OR "Failed to create installment plan."); sheet remains open OR closes and NO new row is added | `mcp__claude-in-chrome__find` + click; `mcp__claude-in-chrome__read_page` |
| 17 | Assert exactly one row with code `e2e_monthly_6` exists | Count: `(await (await fetch("/rpc/installmentPlans/list", ...)).json()).json.filter(p => p.code === "e2e_monthly_6").length === 1` → `true` | `mcp__claude-in-chrome__javascript_tool` |
| 18 | Close the sheet (Cancel) | Sheet dismisses without further mutation | `mcp__claude-in-chrome__find` (text="Cancel") + click |

**Hard-fail triggers:** step 13 — no row persisted; step 17 — `> 1` rows with the same code (unique constraint silently bypassed).

---

## §3 — Immutability of `code` (IP3) — **critical**

Tests that `update` silently drops any attempt to change `code`, while name/numInstallments/interval DO persist. The `update` Zod schema in `packages/api/src/routers/installment-plans.ts` (lines 200-210) omits `code` entirely — so sending it has no effect at the oRPC layer.

### §3.1 — UI attempt (the form disables the input)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 19 | Find the `half` row; click Edit | Sheet opens, title "Edit Installment Plan"; `#ip-code` value = `half`; helper text reads "Code cannot be changed after creation." | `mcp__claude-in-chrome__find` + click |
| 20 | Assert the `code` input is `disabled` in the DOM (defence-in-depth UI gate) | `document.querySelector('#ip-code').disabled` → `true` | `mcp__claude-in-chrome__javascript_tool` |
| 21 | Update `name` to `Half (modified label)` | `#ip-name` value reflects the string | `mcp__claude-in-chrome__form_input` |
| 22 | Update `numInstallments` to `3` (was `2`) | `#ip-num-installments` value = `3` | `mcp__claude-in-chrome__form_input` |
| 23 | Update `defaultIntervalDays` to `45` (was seed default 30) | `#ip-interval-days` value = `45` | `mcp__claude-in-chrome__form_input` |
| 24 | Click "Save Changes" | Sheet closes; toast "Installment plan updated successfully." | `mcp__claude-in-chrome__find` + click |
| 25 | Refresh the list and verify name/numInstallments/interval changes persisted | `const half = (await (await fetch("/rpc/installmentPlans/list", ...)).json()).json.find(p => p.code === "half"); ({ code: half.code, name: half.name, n: half.numInstallments, i: half.defaultIntervalDays });` — expect `{ code: "half", name: "Half (modified label)", n: 3, i: 45 }` | `mcp__claude-in-chrome__javascript_tool` |

### §3.2 — Raw API attempt (the handler silently drops `code`)

The UI disables the input. The backend also silently drops `code` even if the client bypasses the form. Verify both.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 26 | From the console, call `installmentPlans.update` with `code: "half_modified"` as an extra field | HTTP 200. `Zod` may silently strip unknown keys (current schema uses `.object({...})` without `.strict()`). Either way, the next list query shows `code` is STILL `half`. | `mcp__claude-in-chrome__javascript_tool` |

```js
await fetch("/rpc/installmentPlans/update", {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    json: {
      organizationId,
      id: planHalfId,
      code: "half_modified",          // <-- unknown key on the update schema
      name: "Half (modified label)",   // keep same so asserts are clean
      numInstallments: 3,
      defaultIntervalDays: 45,
    },
  }),
}).then(r => ({ status: r.status, body: r.json?.() }));
```

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 27 | Re-read the list | Row with `id === planHalfId` still has `code === "half"`. **No row with `code === "half_modified"` exists.** | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** step 25 — name/n/interval not persisted; step 27 — `code` changed OR a `half_modified` row appeared.

**Note:** revert the cosmetic changes in §7 Cleanup to keep the seed canonical (name back to `Half`, numInstallments back to 2, interval back to 30 — original values).

---

## §4 — setDefault via star icon (IP4)

Tests the 2-row transaction in `setDefaultInstallmentPlan` (service layer): simultaneously clears the prior default's flag and sets the new one, all in one click.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 28 | Snapshot: confirm `full.isDefault === true` and `half.isDefault === false` via the list fetch | Matches pre-condition assertion | `mcp__claude-in-chrome__javascript_tool` |
| 29 | Click the star button on the `half` row | Toast "Default installment plan updated."; the `half` row's star fills amber; the `full` row's star unfills | `mcp__claude-in-chrome__find` + `javascript_tool` `.click()` — target via row-text lookup |
| 30 | Assert the transaction happened atomically (single list fetch shows both state changes) | Run the list fetch once. Assert: `full.isDefault === false` AND `half.isDefault === true` AND no other plan has `isDefault === true` (exactly one default globally) | `mcp__claude-in-chrome__javascript_tool` |
| 31 | Confirm no intermediate state was ever visible (no race window) | Re-query twice in rapid succession — both queries show the same final state | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** step 30 — both plans `isDefault: true` (broken transaction); no plan is default (transaction partially applied).

---

## §5 — Deactivate a plan referenced by services (IP5)

Pre-condition 5 confirmed `half` is referenced by ≥1 active service. After §4, `half` is also the current default — that's fine for this phase; §6 explicitly tests the "deactivate default" path separately.

For clarity of assertions, §5 operates on a **non-default** plan: `quarterly`. First, ensure `quarterly` is referenced by at least one service — if not, add a reference temporarily so this phase has a real assertion target. (If the seed guarantees a reference, skip steps 32–33.)

### §5.1 — Ensure `quarterly` has ≥1 service reference

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 32 | Check whether any active service references `quarterly` | `(await (await fetch("/rpc/services/list", ...)).json()).json.filter(s => (s.availablePaymentPlans ?? []).includes("quarterly")).length` | `mcp__claude-in-chrome__javascript_tool` |
| 33 | **If result is 0:** pick the seeded `E2E Test Session` service and add `quarterly` to its `availablePaymentPlans`: call `services.update` with `availablePaymentPlans: ["full","half","quarterly"]` (merge with existing). Record its `id` as `modifiedServiceId` and original plans array as `originalPlans` for §7 cleanup. **If result ≥ 1:** record `modifiedServiceId = null` and skip to step 34. | Either mutation 200 + list confirms the new value, OR nothing modified | `mcp__claude-in-chrome__javascript_tool` |

### §5.2 — Open the deactivate dialog and read the warning

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 34 | Find the `quarterly` row; click its Deactivate button (orange-text ghost button) | Dialog opens with title "Deactivate Installment Plan"; body contains the plan's name; below the intro, an **orange-bordered warning box** renders the text `This plan is currently enabled on N active service(s). Deactivating it will prevent customers from selecting it for new purchases but will not affect existing installment schedules.` where `N >= 1`. | `mcp__claude-in-chrome__find` + click |
| 35 | Assert the warning is present and references a count ≥ 1 | Run: `const d = document.querySelector('[role="dialog"]'); const warn = Array.from(d.querySelectorAll('div')).find(e => /referenced|enabled on/i.test(e.textContent) && /\d+ active service/.test(e.textContent)); !!warn && /enabled on\s+\d+\s+active service/i.test(warn.textContent);` → `true` AND the extracted count is ≥ 1 | `mcp__claude-in-chrome__javascript_tool` |
| 36 | Click **Cancel** on the dialog | Dialog closes; no mutation occurs | `mcp__claude-in-chrome__find` (text="Cancel") + click |
| 37 | Verify `quarterly.isActive` still `true` | List fetch: `plans.find(p => p.code === "quarterly").isActive` → `true` | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** step 35 — no warning box rendered, or warning shows `0` references; step 37 — plan deactivated despite Cancel click.

---

## §6 — Deactivate the current default (IP6)

After §4, `half` is the default. Deactivate it.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 38 | Pre-check: `half.isDefault === true`, `half.isActive === true` | Asserted via list fetch | `mcp__claude-in-chrome__javascript_tool` |
| 39 | Find the `half` row; click its Deactivate button | Deactivate dialog opens. Warning box shows "enabled on ≥ 1 active service(s)" (pre-condition 5). Confirmation text matches template. | `mcp__claude-in-chrome__find` + click |
| 40 | Click **Deactivate** (destructive button) | Toast "Installment plan deactivated."; dialog closes; `half` row either vanishes (Active tab) or shifts to Inactive badge (All tab) | `mcp__claude-in-chrome__find` + click |
| 41 | Assert `isActive: false` AND `isDefault: false` simultaneously | List fetch: `const h = plans.find(p => p.code === "half"); h.isActive === false && h.isDefault === false` → `true`. This is the "silently cleared" semantic. | `mcp__claude-in-chrome__javascript_tool` |
| 42 | Assert **no plan was auto-promoted to default** | List fetch: `plans.filter(p => p.isDefault === true).length === 0` → `true`. No plan should be the default now. UI on the Active tab renders zero filled stars. | `mcp__claude-in-chrome__javascript_tool` |
| 43 | UI visual check | On the Active tab, no row has an amber-filled star: `document.querySelectorAll('svg.fill-amber-400').length === 0` → `true` | `mcp__claude-in-chrome__javascript_tool` |

**Hard-fail triggers:** step 41 — `isActive: true` (deactivation didn't happen), `isDefault: true` (silent clear didn't fire); step 42 — some other plan was auto-promoted (the service deliberately does NOT do this).

---

## §7 — Cleanup

LIFO order (`_setup.md` §3). This protocol mutated the following (in order):
1. Created `e2e_monthly_6`.
2. Modified `half` fields (name, numInstallments, defaultIntervalDays).
3. Moved default from `full` → `half`.
4. (Conditionally) added `quarterly` to `E2E Test Session.availablePaymentPlans`.
5. Deactivated `half`.

Cleanup reverses in reverse order.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 44 | Reactivate `half` — there is no dedicated `reactivate` procedure, so call `installmentPlans.update` with no-op fields first to confirm access, then call the internal activation path. Simplest: direct `client.installmentPlans.update` cannot flip `isActive` (schema omits it). Use Drizzle Studio or a one-off `UPDATE installment_plans SET is_active = true WHERE code = 'half'` via the `db:studio` UI. **Document this clearly in the run report** — this is a known gap: deactivation is a one-way mutation from the API. | `half` row back to `isActive: true` | manual — Drizzle Studio |
| 45 | Restore `half` as non-default (seed state: `half.isDefault = false`) — click the `full` row's star to re-set it as default | Star moves back to `full`; `full.isDefault: true`, `half.isDefault: false` | `mcp__claude-in-chrome__find` + click |
| 46 | Revert cosmetic changes to `half`: set name back to `Half`, numInstallments back to `2`, defaultIntervalDays back to `30` | Row reflects seed values | `mcp__claude-in-chrome__javascript_tool` — `fetch("/rpc/installmentPlans/update", ...)` |
| 47 | If §5.1 step 33 added `quarterly` to `E2E Test Session.availablePaymentPlans`, revert the service: `services.update` with `availablePaymentPlans: originalPlans` | Service row back to original plan array | `mcp__claude-in-chrome__javascript_tool` |
| 48 | Delete `e2e_monthly_6` — no `delete` endpoint exists; deactivate instead. Accept that the inactive row will persist in the All tab for the remainder of the dev DB's life (idempotent seed won't recreate it because it's keyed by `code`, which still exists). If a true delete is needed, remove via Drizzle Studio. | `e2e_monthly_6.isActive: false` | `mcp__claude-in-chrome__javascript_tool` — `fetch("/rpc/installmentPlans/deactivate", ...)` |
| 49 | Final seed-state assertion | Active plans include `full` (default), `half`, `quarterly` — each with `isActive: true`. `full.isDefault === true`. `half.name === "Half"`, `half.numInstallments === 2`, `half.defaultIntervalDays === 30`. | `mcp__claude-in-chrome__javascript_tool` |

**On failure:** still run §7. If the DB is left in a non-canonical state (e.g. `half` cannot be reactivated from the UI because no endpoint exists), document the residual state in the run report and escalate — a future plan iteration should add a reactivation endpoint or a scripted reset.

---

## Notes

- **`code` immutability** — verified two ways: UI disables the input (`disabled={!!editingId}` in the installment-plans page), and the server-side `update` schema omits `code` entirely. Steps 26-27 exercise the bypass path.
- **`setDefault` transaction** — `packages/services/src/installment-plan.service.ts` `setDefaultInstallmentPlan` wraps the two row updates in a Drizzle transaction. Step 30 confirms atomicity by checking that exactly one plan is `isDefault: true` immediately after the click.
- **`deactivate` silently clears `isDefault`** — the service layer matches the `deactivateTaxRate` pattern: if the deactivated plan had `isDefault: true`, it is cleared in the same UPDATE. The service does **not** auto-promote another plan. Step 42 is the canary for any future "auto-promote" regression.
- **Services-reference warning** is computed **client-side** in `handleDeactivateClick` (lines 246-269 of the installment-plans page) by calling `services.list` and filtering. It is advisory only — the server does not block deactivation on references. If the client check fails silently (step 265 `catch {}`), the dialog opens without a warning — treat that as a hard-fail in §5 step 35.
- **Reactivation gap** — there is no `reactivate` procedure exposed via oRPC today. Cleanup at step 44 requires Drizzle Studio or direct SQL. Document this in the run report so protocol runners aren't surprised.
- **Native app sync** — `apps/native/app/(app)/dashboard/buy-package/plan.tsx` still uses a hardcoded `PLAN_CONFIG` (as of 2026-04-17). Deactivating a legacy code (`full`/`half`/`quarterly`) will NOT hide it from the native app. Not tested here — cross-flow protocol is the vehicle for native ↔ backend drift checks.
