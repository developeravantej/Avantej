# Installments Protocol

**Page:** `/dashboard/packages/installments/view`
**Covers:** I1, I2, I3, I4, I5, I6, I7 (from `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §4.9)
**Authoring reference:** `zhub/pages/web-dashboard-packages-installments-view.md`

> Setup, login, MCP cheat sheet, seed fixtures, cleanup rules, results-file naming, and the runtime-UUID resolver (`js` snippet) all live in `docs/testing/_setup.md`. This protocol DOES NOT duplicate them — every `<fixture>.id` placeholder below is resolved via `_setup.md` §1.2.

---

## Pre-conditions

- **Stack up:** `_setup.md` §0.1 passed.
- **Seed:** `cd apps/server && bun run scripts/seed-business-data.ts` has been run.
- **Login:** Admin (`franchisee@gmail.com`) via `_setup.md` §2.1.
- **Resolved fixture IDs:** Run `_setup.md` §1.2 resolver. Record at minimum `organizationId`, `clientUserId` (e2e.client user id), `planHalfId`.
- **Seed state assertion:** Exactly one seeded package instance for `clientUserId` with `paymentPlanType === "half"`, `creditsTotal === 10`, `creditsUnlocked === 5`, `installmentsPaid === 1`, `installmentsTotal === 2`, `status === "active"`, `isLocked === false`. Exactly 2 installment rows: `installmentNumber 1 → status "paid"`, `installmentNumber 2 → status "pending"`, amount 25000 cents each.

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
console.assert(seeded.isLocked === false, `isLocked expected false`);
seededInstanceId = seeded.id;
const insts = await fetch("/rpc/installments/listByPackageInstance", {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: { organizationId, packageInstanceId: seededInstanceId } }),
}).then(r => r.json()).then(j => j.json);
console.assert(insts.length === 2, `expected 2 installments, got ${insts.length}`);
const [paid, pending] = insts.sort((a,b) => a.installmentNumber - b.installmentNumber);
console.assert(paid.status === "paid" && pending.status === "pending", "seed installment statuses wrong");
seededPendingInstallmentId = pending.id;
return { seededInstanceId, seededPendingInstallmentId };
```

---

## §1. List + status tabs (I1)

Verifies: the page renders, status tabs filter correctly, and row counts match seed state.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Navigate to the page | URL `/dashboard/packages/installments/view`; header "Installment Packages"; filter row visible (Search, Due After, Due Before, Plan, Clear); four status tabs visible: All / Active / Overdue / Locked | `mcp__claude-in-chrome__navigate` → `http://localhost:3001/dashboard/packages/installments/view`; `read_page` |
| 2 | Confirm rows on mount (All tab default) | Table contains at least one row for `clientUserId`: Plan Type = "Half", Credits = "5 unlocked / 10 total", Progress = "1 of 2", Next Due Date ≈ 60 days from today, Status = "Active" | `javascript_tool` → `document.querySelectorAll('tbody tr').length` ≥ 1; `read_page` |
| 3 | Click the "Active" tab | Request body contains `"status":"active"`; the seeded row still visible (it IS active) | `javascript_tool` click + `read_network_requests` |
| 4 | Click the "Overdue" tab | Request fires with `"status":"overdue"`; seeded row disappears (not overdue) | `javascript_tool` click + `read_page` |
| 5 | Click the "Locked" tab | Request fires with `"status":"locked"`; table empty (no locked rows in seed) | `javascript_tool` click + `read_page` |
| 6 | Return to "All" tab | Request body omits `status`; seeded row visible again | `javascript_tool` click + `read_page` |
| 7 | Verify `installmentPlans.list` fired on mount (powers Plan Type badge resolution) | Exactly one `/rpc/installmentPlans/list` POST with `activeOnly: true` in body; seeded plans `full`, `half`, `quarterly` in response | `mcp__claude-in-chrome__read_network_requests` |

---

## §2. Filter composition — debounce + AND composition (I2, I3)

Verifies: 300ms search debounce; Due Before + Plan Code compose with AND in the backend query.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Clear the network log | New baseline — no `adminOverview` calls since now | `mcp__claude-in-chrome__read_network_requests` (note the last-seen index) |
| 2 | Type the first 4 chars of `clientUserId` into the Search input (e.g. `abcd`) very quickly (simulate 50ms between keystrokes) | NO `/rpc/installments/adminOverview` request is fired during the typing burst | `javascript_tool` → programmatically dispatch `input` events one char at a time with `setTimeout`; `read_network_requests` |
| 3 | Wait 400ms after last keystroke, then re-check network | Exactly ONE `/rpc/installments/adminOverview` POST fires with `"search":"abcd"` in body. (Proves the 300ms `useDebounce` on `searchQuery` is effective — 4 keystrokes collapse to 1 request.) | `mcp__claude-in-chrome__read_network_requests` |
| 4 | Clear the Search input; wait 400ms | A new request fires with `search: undefined` (or absent) | — |
| 5 | Set Due Before = 90 days from today | Request body contains `"dueBefore": "<ISO datetime>"` | `mcp__claude-in-chrome__form_input` on the Due Before date input + `read_network_requests` |
| 6 | Also set Plan dropdown = "Half" (planCode `half`) | Next request body contains BOTH `dueBefore` AND `"paymentPlanCode":"half"`. The seeded row (due in 60 days with plan `half`) is still in the result set. | `javascript_tool` click the plan `SelectTrigger` and choose "Half"; `read_network_requests` |
| 7 | Change Due Before to 30 days from today (BEFORE the seeded row's due date of ~60 days) | Request body has new `dueBefore`; seeded row disappears from the table (its next-due is past the filter window). Confirms the server-side AND composition (see `getAdminInstallmentOverview` in `packages/services/src/installment.service.ts` — `dueBefore` filters `package_instances.next_due_date`). | `form_input` + `read_page` + `read_network_requests` |
| 8 | Click the "Clear" button | Search, Due Before, Due After, Plan all reset; status tab unchanged; new request fires with none of those filters in the body | `javascript_tool` click + `read_network_requests` |

---

## §3. Detail sheet + timeline (I4)

Verifies: opening a row renders the Sheet with the installment timeline (2 rows for seeded instance); each row shows dueDate + amount + status.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click the "View" button on the seeded row | Sheet opens from the right; title "Installment Package Detail"; two sections visible: "Package Info" and "Installments"; action buttons: "Process Refund" (always), "Manual Unlock" (only if `isLocked` — NOT visible for seed) | `javascript_tool` → click the View button; `read_page` |
| 2 | Package Info section shows correct fields | Plan Type = "Half", Status badge = "Active" (green), Credits = "5 unlocked, 0 used, 0 available" (seed: `creditsUsed=0`, `creditsRemaining=0`, `creditsUnlocked=5`), Progress = "1 of 2 paid", Next Due = ~60 days from today | `mcp__claude-in-chrome__read_page` |
| 3 | Confirm a `listByPackageInstance` request fired when sheet opened | One new POST to `/rpc/installments/listByPackageInstance` with `packageInstanceId: seededInstanceId` in body (this also triggers `evaluateAndLockIfOverdue` server-side — idempotent) | `mcp__claude-in-chrome__read_network_requests` |
| 4 | Installments timeline has exactly 2 rows | First `<tr>` in the timeline `<tbody>`: #1, RM 250.00, dueDate today (seed), paidAt today (seed), status "Paid" (green badge), Action column shows "Paid ✓ <date>". Second `<tr>`: #2, RM 250.00, dueDate ~60 days, paidAt "—", status "Pending" (outline badge), Action column shows a "Confirm Payment" button. | `javascript_tool` → `document.querySelectorAll('.overflow-hidden table tbody tr').length === 2` and parse each row's cells |
| 5 | No "Manual Unlock" button visible | `document.evaluate("//button[contains(text(),'Manual Unlock')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue === null` — the unlock button is only rendered when `selectedInstance.isLocked === true`. | `javascript_tool` |

Leave the sheet open — §4 continues from here.

---

## §4. Confirm Payment on installment 2 (I5)

Verifies: confirming the pending installment transitions it to `paid`, bumps `installmentsPaid` to 2, and unlocks credits via `calculateCreditsUnlocked(creditsTotal=10, installmentsPaid=2, installmentsTotal=2) = floor(10 × 2 / 2) = 10`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click the "Confirm Payment" button in installment 2's row | Dialog opens; title "Confirm Payment"; body "Confirm payment for Installment 2 of 2."; fields: Payment Method (default "Manual Transfer"), Notes (optional), Override Next Interval (optional) | `javascript_tool` click; `read_page` |
| 2 | Keep Payment Method = "Manual Transfer"; leave Notes blank; leave Override empty | — | — |
| 3 | Click "Confirm" | POST `/rpc/installments/confirmPayment` with body `{installmentId: seededPendingInstallmentId, paymentMethod: "manual_transfer"}`; response 200; toast "Payment confirmed successfully."; dialog closes; the timeline row updates to "Paid ✓ <today>" (the Sheet re-renders via query invalidation) | `javascript_tool` click + `read_network_requests` + `read_page` |
| 4 | Re-fetch the package instance via direct RPC | `/rpc/packageInstances/getById` with id `seededInstanceId` returns: `installmentsPaid === 2`, `creditsUnlocked === 10`, `nextDueDate === null` (fully paid), `gracePeriodEndsAt === null`, `isLocked === false`, `status === "active"` | `javascript_tool` → `fetch("/rpc/packageInstances/getById", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({json:{organizationId, id: seededInstanceId}}) }).then(r=>r.json())` |
| 5 | Re-fetch installment list | 2 rows, both `status === "paid"`. The timeline in the still-open Sheet reflects the same. | `javascript_tool` fetch `/rpc/installments/listByPackageInstance` |

> **Important for Cleanup §7:** the mutation in this step is NOT directly reversible through an oRPC endpoint. Cleanup §7 restores state by re-running the seed script.

---

## §5. Manual Unlock — pre-condition requires a manual DB lock (I6)

Verifies: the `Manual Unlock` button only appears when the instance is locked; empty-reason validation blocks submit; successful unlock flips `isLocked` to false without touching credits.

> **There is no oRPC procedure that can lock a package instance admin-side.** The codebase only locks via `evaluateAndLockIfOverdue`, which requires: (1) `nextDueDate < now`, (2) a grace period started, (3) `gracePeriodEndsAt < now`. The seeded half-plan instance does not meet (1) (due in ~60 days) and after §4 is fully paid so `nextDueDate === null`. The only deterministic way to reach the locked state is a direct DB UPDATE.
>
> **Manual pre-step (required before running §5).** Run this SQL in Drizzle Studio (`bun db:studio`) against the tenant DB:
> ```sql
> UPDATE package_instances
> SET is_locked = true, locked_at = now(), locked_reason = 'test-lock-for-protocol'
> WHERE id = '<seededInstanceId>';
> ```
> Record this in the results file under "Manual DB steps". The Cleanup §7 seed-script recovery also resets this field.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | After running the SQL pre-step, reload the page | URL unchanged; seeded row now has Status badge = "Locked" (red destructive variant) | `mcp__claude-in-chrome__navigate` to same URL; `read_page` |
| 2 | Click "View" on the row; sheet opens | Package Info shows Status = "Locked"; Lock Reason section visible with text "test-lock-for-protocol"; `selectedInstance.isLocked === true` in component state | `javascript_tool` click; `read_page` |
| 3 | Confirm "Manual Unlock" button IS now rendered | Button appears in the action row (alongside "Process Refund") | `javascript_tool` → find `//button[normalize-space()='Manual Unlock']` |
| 4 | Click "Manual Unlock" | Dialog opens; title "Manual Unlock"; Reason textarea required (red asterisk); default empty | `javascript_tool` click; `read_page` |
| 5 | Click "Unlock Package" with empty Reason | Toast error: "A reason is required to unlock the package."; NO `/rpc/installments/manualUnlock` POST fires (the check is client-side before the mutation) | `javascript_tool` click; `read_console_messages` + `read_network_requests` |
| 6 | Fill Reason = "Test unlock — protocol run" | Textarea value updates | `mcp__claude-in-chrome__form_input` on `#unlock-reason` |
| 7 | Click "Unlock Package" | POST `/rpc/installments/manualUnlock` with `{packageInstanceId: seededInstanceId, reason: "Test unlock — protocol run"}`; response 200; toast "Package unlocked successfully."; dialog closes; the table/Sheet refresh; Status badge returns to "Active" | `javascript_tool` click; `read_network_requests`; `read_page` |
| 8 | Verify credits unchanged | `/rpc/packageInstances/getById` returns `isLocked === false`, `lockedAt === null`, `lockedReason === null`, `creditsUnlocked === 10` (unchanged from §4 step 4), `creditsUsed === 0` | `javascript_tool` fetch |
| 9 | Verify bookability (optional smoke check) | `/rpc/appointments/create` with `packageInstanceId: seededInstanceId` — should not fail with "Package is locked". (Full appointment-create flow is covered in `appointment-view.md`; here, a 400 other than locked is acceptable since we're only testing the lock gate lifted.) | `javascript_tool` fetch — inspect error message |

---

## §6. Process Refund — irreversible; suggestRefund pre-fills (I7)

Verifies: opening the Refund dialog fetches `/rpc/installments/suggestRefund`; the amount input pre-fills from the response; submitting cancels the package and refunds the payment; future bookings for the package fail with "Package is not active".

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | With the detail Sheet still open, click "Process Refund" | Refund dialog opens; title "Process Refund"; Amount (RM) input + Reason textarea visible | `javascript_tool` click; `read_page` |
| 2 | Observe the network log for `suggestRefund` | Exactly one POST `/rpc/installments/suggestRefund` with `{packageInstanceId: seededInstanceId}`; response body includes `paidAmount`, `creditsUsed`, `creditsUnlocked`, `unusedCreditValue`, `suggestedRefund`, `reasoning` | `mcp__claude-in-chrome__read_network_requests` |
| 3 | Confirm the breakdown panel rendered | Rows visible: "Customer paid", "Credits used", "Unused value", "Suggested refund", `reasoning` paragraph | `mcp__claude-in-chrome__read_page` |
| 4 | Confirm Amount input pre-fills | On first render, `#refund-amount` value === `(suggestedRefund / 100).toFixed(2)` (from the `useEffect` in the component). After §4, customer paid = 50000 cents (both installments paid) and creditsUsed = 0, so `suggestedRefund` should equal 50000 cents → input reads "500.00". | `javascript_tool` → `document.querySelector('#refund-amount').value` |
| 5 | Fill Reason = "Test refund — protocol run" | Textarea updates | `form_input` on `#refund-reason` |
| 6 | Click "Confirm Refund" | POST `/rpc/installments/processRefund` with `{packageInstanceId: seededInstanceId, amount: 50000, reason: "Test refund — protocol run"}`; response 200; toast "Refund processed successfully."; Refund dialog closes; Sheet stays open briefly then list refetches | `javascript_tool` click; `read_network_requests` |
| 7 | Fetch the package via `/rpc/packageInstances/getById` | `status === "cancelled"`, `paymentStatus === "refunded"`. Credits fields are NOT zeroed (the refund handler in `processRefund` at `packages/services/src/installment.service.ts:499` only flips `paymentStatus` + `status` + logs an event). | `javascript_tool` fetch |
| 8 | Try to book an appointment against the refunded package | `/rpc/appointments/create` with `packageInstanceId: seededInstanceId` errors with a message that includes "Package is not active" (the booking service checks `status === "active"`). | `javascript_tool` fetch the create endpoint with minimal body; inspect error string |

> **Irreversibility.** `processRefund` has no inverse in the codebase. Cleanup §7 restores state by re-running the seed script.

---

## §7. Cleanup

Because §4 confirms the seeded pending installment (irreversible via API) and §5 directly UPDATEs the tenant DB and §6 cancels + refunds the seeded package (also irreversible via API), the only clean recovery is to delete the contaminated seeded rows and re-seed.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Hard-delete both seeded installments and the seeded package instance via Drizzle Studio (`bun db:studio`) or a direct SQL console: `DELETE FROM installments WHERE package_instance_id = '<seededInstanceId>'; DELETE FROM package_instances WHERE id = '<seededInstanceId>';` | Both tables lose the seeded rows for this client | Manual SQL step — record verbatim SQL + row-count in the results file |
| 2 | Re-run the seed script: `cd apps/server && bun run scripts/seed-business-data.ts` | Script runs idempotently; re-creates `seededInstanceId`-equivalent package with `creditsUnlocked=5`, `installmentsPaid=1`, `installmentsTotal=2`, and 2 installment rows (1 paid, 1 pending). Note the new UUID may differ from the pre-run seededInstanceId — this is expected. | `bun run scripts/seed-business-data.ts` |
| 3 | Post-cleanup assertion | Run the §Pre-conditions fail-fast snippet again. All asserts pass: seeded half-plan exists, `creditsUnlocked === 5`, `installmentsPaid === 1`, `isLocked === false`, 2 installments with statuses `paid` + `pending`. | `javascript_tool` |
| 4 | If the post-assertion fails (e.g. the seed script itself changed or a foreign key blocks deletion) | STOP. Document the state and open a bug — the seed is no longer self-healing. | — |

> **IMPORTANT:** Re-running `/rpc/packageInstances/create` with the same input does NOT restore the seeded state — it creates a NEW row with a fresh UUID and does NOT seed paid installments (the created installments are all `pending`). The ONLY recovery path is the seed script. This is a manual recovery step and MUST be called out in every results file that runs this protocol end-to-end.

---

## Notes

- All `installments.*` API calls in the UI use `(client as any)` because the router is not yet in the generated oRPC type surface (see `zhub/pages/web-dashboard-packages-installments-view.md` §6). When asserting requests, search by URL path, not by typed-client shape.
- `installments.suggestRefund` and `installments.manualUnlock` require `role === "admin"` (router-enforced at `packages/api/src/routers/installments.ts:141` and `:303`). The admin login in `_setup.md` §2.1 satisfies this — staff login does NOT.
- `getAdminInstallmentOverview` paginates at `limit: 50` (the UI passes no higher). If a dev DB has more than 50 installment-plan packages, the seeded row may fall off page 1 — filter by the `search` box with the client's UUID prefix to guarantee it stays visible.
- `dueBefore` / `dueAfter` filter on `package_instances.next_due_date`, NOT on individual installment due dates. A fully-paid instance with `nextDueDate === null` is filtered out by ANY `dueBefore` / `dueAfter` value (NULL comparisons return false in SQL). If a past cleanup forgot to re-seed, the table will look empty unexpectedly — use the fail-fast snippet first.
