# Cross-Flow Integration — Service → Package → Booking → Installment → Refund

**Covers behaviors:** X1-X9 (see `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §4.11)
**Blast radius:** ALL — this is the chain that combines services catalog + appointments + installments
**Expected runtime:** ~20 min (sequential — each phase depends on the previous)
**Prerequisite:** Seed data loaded (`cd apps/server && bun run scripts/seed-business-data.ts`), all 10 single-page protocols pass individually first (run them before running this one).
**Role:** admin for X1-X9; also `e2e.client@test.com` context (used as clientId parameter — no login needed as client).
**Result file:** `zdocs/testing-results/<YYYY-MM-DD-HHMM>_cross-flow_service-to-booking.md` (template: `zdocs/testing-results/README.md`)

---

## Framing — Read First

This protocol is a **state-propagation contract test**, not a UI test. Each phase below deliberately does NOT re-assert every UI element — that's already covered by the matching single-page protocol, and duplicating it here buys nothing and drifts over time.

Each phase captures exactly two things:

1. **Pre-state** the phase assumes (what must be true from the previous phase's post-state).
2. **Post-state** the phase produces (what the next phase depends on).

If a single-page protocol passes standalone but this one fails, the regression lives in the *handoff between phases* — credit-unlock numbers that don't line up end-to-end, buffer boundaries that look right in isolation but break when a package is locked, refunds that leave the package bookable. That is the regression surface this protocol owns exclusively.

Every phase links to the specific section of a single-page protocol that covers its UI-level assertions. When this protocol says "create a category", it does NOT reinstruct how to click through the Sheet — it points at `service-category.md §2` and records the single output (`categoryId`) that X2 needs.

---

## Pre-conditions

1. Complete `_setup.md` §6 "Verify Setup" checklist.
2. Logged in as admin (`franchisee@gmail.com` / `password123`) per `_setup.md` §2.1.
3. Fixture IDs resolved via `_setup.md` §1.2 snippet — record in the run report's header. Verify all resolved keys are non-undefined.

   > **Known resolver gap — `clientUserId`.** The `_setup.md` §1.2 resolver derives `clientUserId` from `members.list` filtered by `email === "e2e.client@test.com"`. Per the Phase 1 seed-script agent's notes in `zdocs/admin-flow-test-coverage_result.md` ("No `organizationMembers` or tenant `members` row for `e2e.client@test.com`. Clients authenticate as control-panel users but are referenced by `clientId` (text) in `packageInstances`"), that filter will return `undefined` — `e2e.client` is intentionally NOT a tenant member. Resolve it differently: query the control-panel `user` table (or the control-panel-scoped `users/list` RPC if available), OR inspect a seeded `packageInstances` row's `clientId` field shape and match. Treat this as a Pre-conditions blocker until resolved; a wrong-undefined here cascades through every phase.

   > **Known resolver gap — `branchId`.** `_setup.md §1.2` does NOT currently resolve `branchId`. The `rpc("appointments/create", ...)` procedure requires it. Add one line to your local resolver: `branchId: rooms.find(r => r.name?.startsWith("Main Room"))?.branchId`. Record the value with the other IDs at the top of the run report.

4. Confirm no leftover `CrossFlow E2E` entities from a prior run exist:
   ```js
   const scan = await Promise.all([
     rpc("serviceCategories/list", {}),
     rpc("services/list", {}),
     rpc("packageInstances/list", {}),
   ]);
   const leftovers = {
     category: scan[0].find(c => c.name === "CrossFlow E2E Category"),
     service: scan[1].find(s => s.name === "CrossFlow E2E Session"),
     instance: scan[2].find(p => p.purchaseNumber === "XFLOW-PKG-001"),
   };
   console.log(leftovers);
   ```
   If any are present AND active, run the §9 Cleanup of the prior run before starting. Do NOT proceed with dirty state.

5. Record the local-variable store the protocol will populate:

   | Var | Set by phase | Used by phase |
   |---|---|---|
   | `categoryId` | X1 | X2 |
   | `serviceId` | X2 | X3 |
   | `packageInstanceId` | X3 | X4, X5, X6, X7, X8, X9 |
   | `installmentId1` | X3 (resolved) | X5 |
   | `creditsUnlockedAfterX5` | X5 | X6 |
   | `appointmentId1` | X6 | X7, §9 cleanup |
   | `appointmentId2` | X7 | §9 cleanup |
   | `refundAmount` | X8 | — |

   Keep these in the run report's "Step Results" notes column as they're produced.

6. **Fixed date anchor** — all appointment bookings in this protocol use **Monday 2026-05-04**. No `new Date() + N days` arithmetic. Hardcode the date literal per plan §8 risk mitigation.

---

## State-Propagation Contract

The assertion at the end of one phase is the **input** to the next. Failures here typically manifest as:

- X5 post-state says `creditsUnlocked = 5` but X6 booking fails with "credits = 0" → installment confirm didn't write through to package.
- X6 post-state says `creditsRemaining = 4` but X7 booking fails with "credits = 0" → credit decrement isn't atomic with appointment create.
- X8 post-state says package cancelled but X9 booking still succeeds → status check is missing from `appointments/create`.

If a step fails, record the observed vs expected value for the state that broke — this is the single most useful diagnostic, more so than any UI assertion.

---

## Phases

### X1. Create Category — "CrossFlow E2E Category" with buffer 15 min

**Purpose:** Seed a distinct category so this protocol does not touch the seeded `"E2E Category"`.
**UI-level coverage:** see `service-category.md §2`.
**Pre-state:** logged in as admin; no existing category named "CrossFlow E2E Category".
**Action:** Create category `name = "CrossFlow E2E Category"` with config `bufferTimeMinutes = 15`, `defaultDuration = 60`, `defaultMaxAttendees = 1`, `branchId = <seeded branch>`.
**Post-state recorded:** `categoryId`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Execute create per `service-category.md §2` | Row appears; config upsert succeeds | `mcp__claude-in-chrome__javascript_tool` |
| 2 | Resolve `categoryId = (await rpc("serviceCategories/list", {})).find(c => c.name === "CrossFlow E2E Category").id` | Non-undefined UUID | `javascript_tool` |
| 3 | Verify config row: `rpc("serviceCategoryConfig/getByCategoryId", { categoryId })` | `bufferTimeMinutes === 15` | `javascript_tool` |

**Fail-branch:** If step 3 returns `bufferTimeMinutes !== 15`, STOP — the category-config upsert path is broken. Run §9 Cleanup and file as FAIL before continuing. X7 depends on this being 15.

---

### X2. Create Service — "CrossFlow E2E Session" under that category

**Purpose:** Seed a package-enabled service linked to X1's category.
**UI-level coverage:** see `service.md §2`.
**Pre-state:** `categoryId` from X1 exists; no existing service named "CrossFlow E2E Session".
**Action:** Create service with `name = "CrossFlow E2E Session"`, `categoryId = <from X1>`, `duration = 60`, `sessionCount = 10`, `price = 50000` (cents = RM 500.00), `availablePaymentPlans = ["half"]`, `installmentIntervalDays = 14`, `schedulingType = "appointment"`.
**Post-state recorded:** `serviceId`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Execute create per `service.md §2` | Row appears in `/dashboard/service/view` | `javascript_tool` |
| 2 | Resolve `serviceId` via `rpc("services/list", {})` filter by name | Non-undefined UUID | `javascript_tool` |
| 3 | Verify: `rpc("services/getById", { id: serviceId })` returns `{ sessionCount: 10, availablePaymentPlans: ["half"], categoryId: <X1 categoryId> }` | All three match | `javascript_tool` |

**Note:** The plan's original X2 description listed `availablePaymentPlans: ["half"]` only, not `["full", "half"]`. We keep it minimal — half is the only plan X3 uses.

**Trainer-service assignment — verified-optional.** Source inspection of `packages/services/src/appointment.service.ts` `createAppointment` (lines 182–268, version as of 2026-04-17) shows NO check that `(trainerId, serviceId)` exists in `service_members`. Booking rejects on buffer, package lock, package status, and credits — not on trainer assignment. Therefore X4/X6/X7 will NOT fail with "trainer not assigned" errors even though `trainer.deterministic` is NOT assigned to `"CrossFlow E2E Session"`. If that contract changes in a future release (an assignment check is added to `createAppointment`), insert an `X2.5 — assign trainer` step here via `rpc("serviceMembers/create", { serviceId, memberId: trainerMemberId })` and add the reverse to §9 cleanup. Until then: skip.

---

### X3. Assign package instance to `e2e.client@test.com` with `paymentPlanType = "half"`

**Purpose:** Generate a fresh package with installment schedule and 0 unlocked credits.
**UI-level coverage:** see `package-instances.md §4` (PI4 — half-plan creation via direct `/rpc/packageInstances/create`; UI does not expose `paymentPlanType`).
**Pre-state:** `serviceId` from X2. Client `e2e.client@test.com` exists (seeded).
**Action:** Call `rpc("packageInstances/create", { ... })` with the exact payload shape from `package-instances.md §4` (note: field is `totalPrice` in cents, NOT `totalPriceRm` or `totalPriceCents`; `source` is `"purchased"` per plan, not `"assigned"`):
```js
{
  organizationId,
  serviceId,
  clientId: clientUserId,                 // see Pre-conditions #3 resolver gap
  source: "purchased",
  paymentPlanType: "half",
  creditsTotal: 10,
  totalPrice: 50000,                      // cents
  startsAt: "<today ISO>",
  expiresAt: "<today + 90d ISO>",
  paymentStatus: "pending",
  purchaseNumber: "XFLOW-PKG-001"
}
```
**Post-state recorded:** `packageInstanceId`, plus the two installments generated (`installmentId1` = first due, `installmentId2` = second due).

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Execute create via raw `fetch` per `package-instances.md §4` | HTTP 200; returns new instance | `javascript_tool` |
| 2 | Record `packageInstanceId = response.id` | Non-undefined UUID | — |
| 3 | Fetch `rpc("packageInstances/getById", { id: packageInstanceId })` | `creditsTotal === 10`, `creditsUnlocked === 0`, `creditsUsed === 0`, `creditsRemaining === 0`, `isLocked === false`, `status === "active"`, `paymentStatus === "pending"` | `javascript_tool` |
| 4 | Fetch `rpc("installments/listByPackageInstance", { packageInstanceId })` | Exactly 2 rows, both `status: "pending"`. Record `installmentId1` = earlier `dueDate` | `javascript_tool` |

**Critical post-state assertion for X4:** `creditsRemaining === 0`. If it's nonzero, X4's booking-rejection test is meaningless. FAIL fast here.

---

### X4. Attempt booking 10:00 → 11:00 on 2026-05-04 → REJECTED (credits = 0)

**Purpose:** Prove `appointments/create` enforces `creditsRemaining > 0` before allowing a package-linked booking.
**UI-level coverage:** see `appointment-view.md §5` (A12 — credit exhaustion).
**Pre-state:** `packageInstanceId` from X3 with `creditsRemaining === 0`.
**Action:** Attempt to book an appointment for the seeded trainer (`trainer.deterministic@test.com`) on Monday 2026-05-04 10:00–11:00, linked to `packageInstanceId`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Call `rpc("appointments/create", { type: "appointment", startTime: "2026-05-04T10:00:00+08:00", duration: 60, branchId, serviceId, trainerId: trainerMemberId, packageInstanceId, userId: clientUserId, sessionTotal: 1, pricePerClient: 50000, creditsUsed: 1, location: roomId })` | HTTP 4xx; error message contains `"credits"` (case-insensitive) — e.g. `"Not enough credits. You have 0 credits available."` | `javascript_tool` |
| 2 | Re-fetch `rpc("packageInstances/getById", { id: packageInstanceId })` | `creditsUsed === 0` still — failed booking did NOT decrement | `javascript_tool` |
| 3 | Fetch `rpc("appointments/list", { trainerId: trainerMemberId, startDate: "2026-05-04", endDate: "2026-05-04" })` | Zero rows for 10:00 slot | `javascript_tool` |

**Fail-branch:** If step 1 returns HTTP 200, that is the single worst regression this protocol catches — a locked-at-zero-credits package became bookable. Stop, record observed state, run §9 Cleanup, file as FAIL.

---

### X5. Confirm installment 1/2 → credits unlock 0 → 5

**Purpose:** Prove that confirming a payment on installment 1 triggers the credit-unlock formula `floor(creditsTotal × installmentsPaid / installmentsTotal) = floor(10 × 1 / 2) = 5`.
**UI-level coverage:** see `installments.md §4` (I5 — Confirm Payment).
**Pre-state:** `installmentId1` from X3 with `status: "pending"`; `creditsUnlocked === 0`.
**Action:** Navigate to `/dashboard/packages/installments/view`, open detail sheet for `packageInstanceId`, click "Confirm Payment" on the earlier-due installment. Per `installments.md §4`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Execute confirm-payment flow per `installments.md §4` on `installmentId1` | Toast success; row refreshes with `status: "paid"` | `javascript_tool` |
| 2 | Fetch `rpc("installments/listByPackageInstance", { packageInstanceId })` | Exactly 1 row `status: "paid"`; 1 row `status: "pending"` | `javascript_tool` |
| 3 | Fetch `rpc("packageInstances/getById", { id: packageInstanceId })` | `creditsUnlocked === 5`, `creditsUsed === 0`, `creditsRemaining === 5`, `installmentsPaid === 1`, `paymentStatus === "pending"` (still — only 1 of 2 paid) | `javascript_tool` |

**Post-state recorded:** `creditsUnlockedAfterX5 = 5`.

**Fail-branch:** If step 3 shows `creditsUnlocked !== 5`, the credit-unlock formula is broken. Two possible causes: (a) the confirmation handler didn't call `evaluateAndLockIfOverdue`/equivalent, or (b) the formula itself regressed. Record observed `creditsUnlocked` value and stop — X6 cannot proceed.

---

### X6. Re-attempt booking 10:00 → 11:00 on 2026-05-04 → SUCCESS

**Purpose:** Prove the unlock from X5 made the package bookable, AND the appointment creation decrements `creditsUsed` atomically.
**UI-level coverage:** see `appointment-view.md §4` (happy-path seed).
**Pre-state:** `packageInstanceId` with `creditsRemaining === 5`.
**Action:** Call `appointments/create` with the same payload as X4 (no other change — only the precondition moved).

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Call `rpc("appointments/create", { type: "appointment", startTime: "2026-05-04T10:00:00+08:00", duration: 60, branchId, serviceId, trainerId, packageInstanceId, userId: clientUserId, sessionTotal: 1, pricePerClient: 50000, creditsUsed: 1, location: roomId })` | HTTP 200; returns new appointment with `status: "pending"` (router default per `appointments.ts`) | `javascript_tool` |
| 2 | Record `appointmentId1 = response.id` | Non-undefined UUID | — |
| 3 | Fetch `rpc("packageInstances/getById", { id: packageInstanceId })` | `creditsUsed === 1`, `creditsRemaining === 4` | `javascript_tool` |

**Post-state recorded:** `appointmentId1`, `creditsRemaining === 4` (was 5 → one credit consumed).

**Fail-branch:** If step 3 shows `creditsUsed === 0` even after a successful create, the credit decrement is not being triggered. That's a silent over-booking bug. Stop, record, cleanup, FAIL.

---

### X7. Buffer conflict 11:05 → REJECTED, then 11:15 → SUCCESS

**Purpose:** Prove the 15-minute category buffer (set in X1) propagates through trainer availability + `appointments/create` when the first booking `endTime = 11:00`.
**UI-level coverage:** see `appointment-view.md §4` (A8 — 11:05 rejected with buffer error; A9 — 11:15 accepted).
**Pre-state:** `appointmentId1` exists (X6) covering 10:00-11:00 on 2026-05-04. Trainer buffer override for `serviceId`: **must be null** (no override → category default of 15 min applies).

**Timing math (hardcoded per plan §7.4):**
- First booking endTime: `2026-05-04T11:00:00+08:00`.
- Buffered end: `11:00 + 15 min = 11:15`.
- Attempt 1 at `11:05` — inside buffer, MUST be rejected.
- Attempt 2 at `11:15` — at boundary (bufferedEnd is exclusive upper bound; `startTime >= bufferedEnd` is allowed), MUST succeed.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Assert trainer has no override for this service: `rpc("serviceMembers/listForMember", { memberId: trainerMemberId })` → either NO row for `serviceId` (trainer not assigned — valid per X2's "verified-optional" note) OR row has `bufferTimeMinutes: null`. Both outcomes mean "no override → category default (15 min) applies". | No override; category default applies | `javascript_tool` |
| 2 | Call `rpc("appointments/create", { type: "appointment", startTime: "2026-05-04T11:05:00+08:00", duration: 60, branchId, serviceId, trainerId, packageInstanceId, userId: clientUserId, sessionTotal: 1, pricePerClient: 50000, creditsUsed: 1, location: roomId })` | HTTP 4xx; error message matches `/A 15-minute buffer is required/` (exact string from `appointment.service.ts` line 200: `"This time conflicts with another appointment. A 15-minute buffer is required between bookings."`) | `javascript_tool` |
| 3 | Re-fetch instance | `creditsUsed === 1` still — rejection did NOT decrement | `javascript_tool` |
| 4 | Call `rpc("appointments/create", { ...same body as step 2, startTime: "2026-05-04T11:15:00+08:00" })` | HTTP 200 | `javascript_tool` |
| 5 | Record `appointmentId2 = response.id` | Non-undefined UUID | — |
| 6 | Re-fetch instance | `creditsUsed === 2`, `creditsRemaining === 3` | `javascript_tool` |

**Post-state recorded:** `appointmentId2`, `creditsRemaining === 3`.

**Fail-branch (most nuanced of the protocol):**
- If step 2 returns 200, the 15-min buffer from X1's category config is not being applied at `appointments/create` time. Check (a) whether the service still references `categoryId` from X1, (b) whether `serviceCategoryConfig.bufferTimeMinutes` is still 15, (c) whether `buffer-time.service.ts` picks up category when no trainer override exists.
- If step 4 returns 4xx, the buffer is being applied as `>` instead of `>=` (off-by-one at the boundary). See `buffer-time.service.ts` lines 86-88 per plan §3.
- If step 3 or step 6 shows wrong `creditsUsed`, the decrement is not transactional with appointment-create success/failure — rollback regression.

---

### X8. Process refund on the package instance → cancelled

**Purpose:** Prove `suggestRefund` pre-fills with the paid amount only (partial refund — installment 2 was never paid), and the refund flips the package to `status: "cancelled"` + `paymentStatus: "refunded"`.
**UI-level coverage:** see `installments.md §6` (I7 — Process Refund).
**Pre-state:** `packageInstanceId` with installment 1 paid, installment 2 pending, `creditsUsed === 2`, `creditsRemaining === 3`, 2 active appointments (`appointmentId1`, `appointmentId2`).
**Action:** Open installments detail for the instance, click "Process Refund", accept the pre-filled amount from `suggestRefund`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Fetch `rpc("installments/suggestRefund", { packageInstanceId })` BEFORE triggering UI | Returns a numeric `suggestedAmount` reflecting only the paid portion (e.g. half of total price if installment 1 was half-payment) | `javascript_tool` |
| 2 | Record `refundAmount = suggestedAmount` | Non-zero number | — |
| 3 | Execute refund per `installments.md §6` with the pre-filled amount | Toast success | `javascript_tool` |
| 4 | Fetch `rpc("packageInstances/getById", { id: packageInstanceId })` | `status: "cancelled"`, `paymentStatus: "refunded"`, `isLocked` may be `true` or irrelevant — status trumps | `javascript_tool` |

**Post-state recorded:** `refundAmount`, package permanently in `status: "cancelled"` (terminal — no restore path in admin UI).

**Notes for cleanup (§9):** Because the package is terminal after X8, the `packageInstanceId` does NOT need (and cannot) be individually deleted for teardown — the refund itself is the terminal-state transition. §9's cleanup responsibility for the package is simply to confirm it is in `cancelled` state, then skip any further mutation.

---

### X9. Attempt new booking using cancelled package → REJECTED

**Purpose:** Prove `appointments/create` blocks bookings against a package in `status: "cancelled"`. This is the final contract: refund is an irrevocable block on future bookings.
**UI-level coverage:** see `appointment-view.md §5` (A11-family — package-state block).
**Pre-state:** `packageInstanceId` in `status: "cancelled"`.
**Action:** Call `appointments/create` with the same inputs as X6 but on a NEW slot (e.g. 14:00 — to avoid any conflict-reason conflation).

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Call `rpc("appointments/create", { type: "appointment", startTime: "2026-05-04T14:00:00+08:00", duration: 60, branchId, serviceId, trainerId, packageInstanceId, userId: clientUserId, sessionTotal: 1, pricePerClient: 50000, creditsUsed: 1, location: roomId })` | HTTP 4xx; error message is exactly `"Package is not active"` (from `appointment.service.ts` line 215) — distinct from buffer/credit errors | `javascript_tool` |
| 2 | Fetch `rpc("appointments/list", { trainerId, startDate: "2026-05-04", endDate: "2026-05-04" })` | Exactly 2 rows (from X6 and X7) — no third appointment created | `javascript_tool` |

**Fail-branch:** If step 1 returns 200, a cancelled/refunded package is still bookable. Most likely cause: `appointments/create` only checks `creditsRemaining > 0` and `isLocked === false`, not `status`. That's a refund bypass. Stop and file as FAIL.

---

## §9 Cleanup (admin-plumbing — NOT a behavior under test)

Reverse in strict **LIFO** order. Run ALWAYS, even on partial failure of X1-X9. See `_setup.md` §3.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Cancel `appointmentId2` via `rpc("appointments/cancel", { id: appointmentId2, reason: "xflow-cleanup" })` | HTTP 200; row `status: "cancelled"` | `javascript_tool` |
| 2 | Cancel `appointmentId1` via `rpc("appointments/cancel", { id: appointmentId1, reason: "xflow-cleanup" })` | HTTP 200; row `status: "cancelled"` | `javascript_tool` |
| 3 | Package instance: verify `status === "cancelled"` (set by X8). No further mutation. If X8 failed and the instance is still `active`, log as "package not terminal — manual DB delete required for full restore". | Already `cancelled`; skip | `javascript_tool` |
| 4 | Deactivate "CrossFlow E2E Session": `rpc("services/update", { id: serviceId, isActive: false })` | HTTP 200; service disappears from default list | `javascript_tool` |
| 5 | Deactivate "CrossFlow E2E Category": `rpc("serviceCategories/update", { id: categoryId, isActive: false })` | HTTP 200; category disappears from default list | `javascript_tool` |
| 6 | Re-run seed script for safety: `cd apps/server && bun run scripts/seed-business-data.ts` | Exits 0; idempotent — seeded fixtures untouched because this protocol used a separate `CrossFlow*` set, but the re-run restores any accidentally-touched seed row (e.g. the seeded `E2E` package instance if a mis-typed ID hit it) | Bash |
| 7 | Post-cleanup assertion: re-fetch the three lists; confirm no `CrossFlow E2E` row with `isActive: true` exists; confirm no appointment referencing `packageInstanceId` has `status: "confirmed"` | All clean | `javascript_tool` |

**Failure during cleanup:** Continue through the remaining steps even if one fails. Record each failure in the run report's "Cleanup Status" notes. A half-cleaned state is still better than no cleanup — the next run's Pre-conditions block will catch whatever remains.

---

## Final Notes

If this protocol passes end-to-end with all 9 behaviors verified and §9 cleanup runs cleanly, the service catalog + appointments + installments chain is regression-clean for this release. File the result at `zdocs/testing-results/<YYYY-MM-DD-HHMM>_cross-flow_service-to-booking.md` using the template in `zdocs/testing-results/README.md`. On any single-phase failure, STILL run §9 Cleanup, and include the failing phase number plus the observed vs expected state in the report.

## Cross-references

- `_setup.md` §1.2 — fixture UUID resolver
- `_setup.md` §2.1 — admin login
- `_setup.md` §3 — cleanup convention (LIFO, run-on-failure)
- `service-category.md §2` — category + config dialog
- `service.md §2` — service create with package fields
- `package-instances.md §4` — half-plan create via direct fetch
- `installments.md §4` — Confirm Payment flow
- `installments.md §6` — Process Refund flow
- `appointment-view.md §4` — buffer enforcement
- `appointment-view.md §5` — package-state + credit booking rejections
- `zplan/17-04_13-00_admin-flow-test-coverage/plan.md` §4.11, §7 — source plan
