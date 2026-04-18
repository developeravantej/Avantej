# Admin Flow Test Coverage — /chrome Execution Plan

**Date:** 2026-04-17
**Branch:** Customer-app
**Companion:** `zdone/17-04_admin-flow-test-coverage.md` (what shipped)
**Protocols live at:** `docs/testing/*.md` (11 files + `_setup.md`)

---

## Prerequisites — run ONCE before any protocol

- [ ] Dev stack running: `bun dev` (web :3001, server :3000)
- [ ] Sanity: `curl -I http://localhost:3001` returns 200, `curl http://localhost:3000/ping` responds
- [ ] Seed the dev DB with the new fixtures:
  ```bash
  cd apps/server && bun run scripts/seed-business-data.ts
  ```
  Expected: Steps 1–12 all complete without error. Idempotent — safe to re-run. Confirms on a fresh DB that Steps 8–12 (trainer, staff, E2E category, E2E service, e2e.client + half-plan package) wrote successfully.
- [ ] Log in once as each role to sanity-check auth:
  - [ ] Admin: `franchisee@gmail.com` / `password123` → lands on `/dashboard`
  - [ ] Staff: `staff.deterministic@test.com` / `password123` → lands on `/dashboard` (scoped view)
  - [ ] Trainer: `trainer.deterministic@test.com` / `password123` → lands on `/dashboard/appointment/view` with title **"My Schedule"**
- [ ] `javascript_tool` fetch sanity: `await fetch("/rpc/services/list", {method:"POST", body: JSON.stringify({json:{organizationId:"996febce-aaad-4ded-8f47-02d2b566c8ee"}})}).then(r=>r.json())` → response contains "E2E Test Session"

---

## Smoke Test — 5-minute confidence check

- [ ] Run `/chrome localhost:3001`
- [ ] Open `docs/testing/_setup.md` — read §6 "Verify Setup" and execute the checklist there
- [ ] Pick the shortest protocol first: **`docs/testing/rooms.md`** (~5 min, 4 phases, self-contained)
- [ ] Execute end-to-end; on completion, file the report at `zdocs/testing-results/<YYYY-MM-DD-HHMM>_rooms.md` using the template in `zdocs/testing-results/README.md`
- [ ] **If rooms protocol fails:** STOP. The failure is likely in the shared infrastructure (_setup.md, seed script, or auth). Debug before running other protocols.

---

## Full Suite Execution Order (~1h 45min)

Run in this order — Phase 2 is the highest regression risk, so run first; cross-flow depends on all prior protocols passing individually.

### 1. Appointment View (highest blast radius) — ~15 min
- [ ] `/chrome localhost:3001` → execute `docs/testing/appointment-view.md`
- [ ] **Critical assertions** (don't skip):
  - §1: no raw UUIDs in `TrainerSidebar` (regex `/[0-9a-f]{8}-[0-9a-f]{4}/` must NOT match) — this was fixed 2026-04-16
  - §4 buffer: book 10:00→11:00, attempt 11:05 (blocked with "15-minute buffer"), attempt 11:15 (succeeds)
  - §5: locked package → "Package is locked due to unpaid installment" error
  - §5: credit exhaustion → "Not enough credits" error
- [ ] **Known gap:** §5.A needs a manual Drizzle Studio `UPDATE package_instances SET is_locked = true` — no `/rpc/packages/manualLock` exists. Protocol row 5.A documents this.
- [ ] File result: `zdocs/testing-results/<timestamp>_appointment-view.md`

### 2. Buffer Cascade (3 protocols, run in any order) — ~25 min
- [ ] `docs/testing/service-category.md` — SC1-SC5, tests category default buffer = 15 upsert
- [ ] `docs/testing/trainers.md` — T1-T6, including lazy-load assertion on category buffer overrides section
- [ ] `docs/testing/my-services.md` — MS1-MS4 (trainer login required); verify `updateMyBuffer` with unassigned serviceId returns "You are not assigned to this service."

### 3. Config Surfaces — ~15 min
- [ ] `docs/testing/service.md` — S1-S5, including MYR price regex `/^RM \d+\.\d{2}$/` (explicitly NOT `$`), and the BAD_REQUEST test for unknown plan codes
- [ ] `docs/testing/installment-plans.md` — IP1-IP6, **critical: IP3 immutability** — edit `half` plan code, verify silently unchanged. IP4 setDefault 2-row transaction.

### 4. Lifecycle — ~20 min
- [ ] `docs/testing/package-instances.md` — PI1-PI4; PI4 half-plan creation via raw `/rpc/packageInstances/create` fetch (the Assign Package sheet doesn't expose `paymentPlanType` field)
- [ ] `docs/testing/installments.md` — I1-I7; **critical: I5 credit-unlock** — confirm installment 2/2, assert `creditsUnlocked: 5 → 10`
- [ ] **Known gap:** I5 requires Drizzle Studio to force-lock the package (no API). I7 refund is terminal — §7 cleanup documents re-running the seed script.

### 5. CRUD Surfaces — ~10 min
- [ ] `docs/testing/class-slots.md` — CS1-CS5; **critical: CS2 apply-only filter** — verify changing filter does NOT fire list call until "Apply" is clicked (via `read_network_requests`)
- [ ] `docs/testing/rooms.md` — R1-R4; §3 returnTo banner renders for `?returnTo=/dashboard/appointment/view`

### 6. End-to-End Integration Walk — ~20 min
- [ ] **Only run after 1–5 pass individually** — this protocol references them.
- [ ] `docs/testing/cross-flow_service-to-booking.md` — X1-X9 end-to-end
- [ ] Uses distinct `CrossFlow*` fixtures (not seeded `E2E*`), so partial failure doesn't contaminate single-page baselines
- [ ] **Critical state propagation:**
  - X3: `creditsUnlocked = 0` (half plan, no installments paid yet for `CrossFlow*` fixtures)
  - X4: booking rejected (credits = 0)
  - X5: confirm installment 1/2 → `creditsUnlocked = 5`
  - X6: book succeeds → `creditsRemaining = 4`
  - X7: 11:05 blocked, 11:15 succeeds → `creditsRemaining = 3`
  - X8: refund → package `status: cancelled`
  - X9: new booking fails "Package is not active"
- [ ] §9 cleanup is LIFO — cancel appointments → service → category → re-run seed script

---

## On Any Failure

- [ ] **Still run the protocol's Cleanup section** before filing the result file
- [ ] Capture a GIF of the failure region via `mcp__claude-in-chrome__gif_creator`
- [ ] Record the failing phase/step number, observed vs expected state, and any console errors/network anomalies
- [ ] File result at `zdocs/testing-results/<timestamp>_<protocol-slug>.md` with Verdict = `FAIL` or `PARTIAL`

---

## Hardcoded Decisions to Remember

- **Dates:** `2026-05-04` (Monday) is the fixed anchor for all booking timing in `appointment-view.md §4` and `cross-flow §X6-X7`. No `now + N days` arithmetic.
- **Times:** X6 startTime = `10:00`, duration = 60 → endTime = `11:00`. X7 blocked attempt = `11:05`. X7 boundary success = `11:15` (first minute outside 15-min buffer).
- **Prices:** All assertions expect `RM X.XX` format (NOT `$X.XX`). The regex is `/^RM \d+\.\d{2}$/`.
- **Credits formula:** `floor(creditsTotal × installmentsPaid / installmentsTotal)`. For half-plan with 10 credits: 1 paid → 5 unlocked, 2 paid → 10 unlocked.

---

## Follow-ups (not blocking test execution)

- [ ] Add `data-testid` attributes to admin pages so protocols can use single-line selector queries instead of structural DOM traversal
- [ ] Fill `_setup.md §1.2` resolver gaps: `branchId` lookup via `rooms.find(...)`, `clientUserId` via a direct control-panel user lookup (see `cross-flow_service-to-booking.md` Pre-conditions for the one-line patch)
- [ ] Consider `/test` Playwright skill follow-up for CI gating (plan §8 Q4) — Chrome MCP runbook is high leverage but manually-invoked; Playwright would add deploy-time guards
- [ ] Add `packages.manualLock` oRPC endpoint so §5 locked-package tests don't need Drizzle Studio (plan §8 Q2 was resolved but this gap remains)
- [ ] Add `installmentPlans.reactivate` endpoint so `installment-plans.md §7` cleanup doesn't need Drizzle Studio
- [ ] Update `AddAppointmentModal` multi-appointment codepath (~line 1828) with the same empty-state + contextual-placeholder logic as single-appointment mode; then extend `appointment-view.md §2` to cover it (plan §8 Q1)
