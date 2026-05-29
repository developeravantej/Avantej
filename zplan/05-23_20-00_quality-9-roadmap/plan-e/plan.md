# Plan E — FEATURE_WIRING Ship

**Session:** `05-23_20-00_quality-9-roadmap`  
**Depends on:** Plan A (tests in CI); Plan C (tenantProcedure before new mutation paths); overlaps Plan D  
**Decision:** **D2 — ship** (wire business logic; do not hide UI)  
**Dimensions lifted:** Production (9), Maintainability (9), Tests (9)

---

## 1. Problem

`docs/FEATURE_WIRING_AUDIT.md` (2026-04-13) documents domains where schema and UI exist but business logic does not consume data — or only partially. This creates maintainability tax and user distrust ("settings that do nothing").

**Product decision:** Ship wiring for all audit items except walk-in customers (removed — stub already throws).

**Note:** Commission calculation may have improved since April audit (Phase 8 + commission integration tests). **E.0 verification pass required** before implementing E.5.

---

## 2. Goals

Refresh audit, then ship each domain with:
- Service-layer logic
- Router exposure (if new procedures needed)
- UI connection (if not already calling API)
- Unit + integration test
- knowledge-graph (previously zhub, now retired) + FEATURE_WIRING doc update

---

## 3. Success criteria

- [ ] `docs/FEATURE_WIRING_AUDIT.md` rewritten with **verified as of 2026-MM-DD** — all sections **Fully Wired** or **Removed**
- [ ] Each item below has linked test file(s) passing in CI
- [ ] No stub routers returning empty/hard throw without removal plan (walk-in removed)
- [ ] Promotions auto-apply decision documented (explicit frontend call vs server-side on sale create)

---

## 4. E.0 — Audit refresh (do first)

| ID | Task | Effort |
|----|------|--------|
| E.0.1 | Re-read services for commission, tax, notifications, class-slots | M |
| E.0.2 | Update audit doc with current state | S |
| E.0.3 | Mark E.5 scope: full engine vs verify-only | S |

---

## 5. Ship backlog (ordered by dependency)

### E.1 — Trainer availability enforcement

**Audit gap:** CRUD exists; booking ignores windows.

| Layer | File | Work |
|-------|------|------|
| Service | `packages/services/src/appointment.service.ts` | Call trainer-availability check before insert/update |
| Service | `packages/services/src/trainer-availability.service.ts` | Expose `isTrainerAvailable(trainerId, start, end)` |
| Test | `apps/server/src/tests/integration/trainer-availability-booking.integration.test.ts` | Book outside window → CONFLICT |
| UI | None if API enforces | — |
| Docs | appointment page docs (previously zhub, now retired) | Note enforcement |

**Effort:** M

---

### E.2 — Waitlist auto-promote

**Audit gap:** Manual promote only.

| Layer | File | Work |
|-------|------|------|
| Service | `packages/services/src/waitlist.service.ts` | `promoteNextOnCancellation(classSlotId)` |
| Hook | `packages/services/src/appointment.service.ts` or class-slot cancel path | Call on booking cancel |
| Test | Extend `apps/server/src/tests/unit/services/waitlist.test.ts` | Auto-promote on cancel |
| Test | Integration: cancel booking → waitlist member promoted, capacity updated | M |

**Effort:** M

---

### E.3 — Class slot booking (largest)

**Audit gap:** No booking entity; `spotsBooked` never increments.

| Layer | Work |
|-------|------|
| Schema | Tenant migration: `class_slot_bookings` (idempotent SQL + `bun gen:migrations`) |
| Service | `bookMemberIntoSlot`, `cancelBooking`, capacity sync |
| Router | `packages/api/src/routers/class-slots.ts` — book/cancel procedures |
| Web | Wire class-slots UI (coordinate with Plan D-S5 extraction) |
| Test | `class-slot-bookings.integration.test.ts` |

**Effort:** L

---

### E.4 — Tax rates on sales orders

**Audit gap:** Rates stored; `salesOrders.taxAmount` never populated.

| Layer | File | Work |
|-------|------|------|
| Service | `packages/services/src/tax.service.ts` | `calculateTax(orderAmount, taxRateId?)` |
| Service | `packages/services/src/pos.service.ts` / sales order create | Apply default tax rate |
| Test | Extend `apps/server/src/tests/integration/sales-tax.test.ts` | Assert `taxAmount` on create |
| Web | POS workflow displays tax line | S |

**Effort:** M

---

### E.5 — Commission splits (verify then ship)

**Audit gap (Apr):** Read-only; no calculation engine.

**E.0 may find:** `commission-calculator.service.ts` + appointment/POS hooks already write splits.

| If verified wired | Action |
|-------------------|--------|
| Yes | Update audit only; add E2E journey assertion; wire **service_category_config** fields if still ignored |
| Partial | Ship calculator consumption of config form fields |
| No | Full engine per `zplan/05-17_21-13_commission-system-flaws` |

| Layer | Work |
|-------|------|
| Test | `commission-rule-complete-appointment.journey.spec.ts` — remove skip with Plan B fixture |
| UI | Commission config forms must match consumed fields |

**Effort:** M–L (depends on E.0)

---

### E.6 — Notifications writer

**Audit gap:** Nothing writes to `notifications` table.

| Event | Writer |
|-------|--------|
| Appointment confirmed/cancelled | `notification.service.ts` |
| Expense approved/rejected | same |
| Package approval decision | same |
| Announcement created (optional fan-out) | same |

| Layer | File | Work |
|-------|------|------|
| Service | `packages/services/src/notification.service.ts` | `createNotification(...)` |
| Call sites | appointment, expenses, operations approvals services | Fire-and-forget inside tx or after commit |
| Test | `notification.service.test.ts` | Event → row |
| Web | Notifications view already read-only | Verify unread count updates |

**Effort:** M

---

### E.7 — Announcements delivery

**Audit gap:** No push; weak role visibility.

| Scope (ship minimum) | Work |
|----------------------|------|
| MVP | Creating announcement → notification fan-out to target roles |
| Stretch | Email via Resend template |

**Effort:** M

---

### E.8 — Promotions on sale create

**Audit gap:** Frontend must explicitly validate — not auto on order create.

| Decision | Recommendation |
|----------|----------------|
| Ship | Document explicit flow; ensure POS calls validate + apply |
| Auto-wire | Call `promotions.service` inside sales order create (behavior change — test heavily) |

| Test | POS with promo code → `promotion_usages` row |

**Effort:** S–M

---

### E.9 — Walk-in customers — **remove** (not ship)

| Layer | Work |
|-------|------|
| Router | Delete `walk-in-customers.ts` stub from `baseRouter` after client regen |
| UI | Already redirected — verify no callers |
| Schema | Keep table for historical rows OR migration to archive — product call |
| Audit | Mark **Removed** |

**Effort:** M

---

### E.10 — Dashboard snapshots / dead tables

**Audit:** `dashboard_snapshots` unused.

| Action | Ship snapshot cron or remove table from schema |
|--------|-----------------------------------------------|
| Recommend | Remove from UI if any; drop table in tenant migration if truly dead |

**Effort:** S–M

---

## 6. Test matrix (required per item)

| Item | Unit | Integration | E2E |
|------|------|-------------|-----|
| E.1 Trainer availability | ✓ | ✓ | optional |
| E.2 Waitlist | ✓ | ✓ | optional |
| E.3 Class slots | ✓ | ✓ | smoke |
| E.4 Tax | ✓ | ✓ | POS journey |
| E.5 Commission | ✓ | ✓ | journey |
| E.6 Notifications | ✓ | ✓ | — |
| E.7 Announcements | ✓ | optional | — |
| E.8 Promotions | ✓ | ✓ | — |
| E.9 Walk-in remove | — | grep | — |

---

## 7. Suggested execution order

```
E.0 refresh
  → E.4 tax (unblocks POS KPI honesty)
  → E.6 notifications (enables E.7)
  → E.1 trainer availability
  → E.2 waitlist
  → E.5 commission verify/ship
  → E.8 promotions
  → E.3 class slots (L — needs D-S5 UI home)
  → E.7 announcements fan-out
  → E.9 walk-in removal
  → E.10 dead tables
```

---

## 8. PR template (each E item)

```markdown
## FEATURE_WIRING: E.N — <name>
- [ ] Service logic
- [ ] Router (if needed)
- [ ] UI wired
- [ ] Unit test
- [ ] Integration test
- [ ] FEATURE_WIRING_AUDIT.md section → Fully Wired
- [ ] knowledge graph updated via `/graphify . --update` (if user-visible)
```

---

## 9. Verification

```bash
cd apps/server && bun test:unit && bun test:integration
cd apps/web && bun test --run
bunx playwright test e2e/pos-checkout-package-salesorderid.journey.spec.ts  # tax + commission
grep -r "Walk-in customers have been removed" packages/api  # should be gone after E.9
```

---

## 10. Risks

| Risk | Mitigation |
|------|------------|
| E.3 schema migration on dev Neon shared with CI | Run migration via normal tenant pipeline; ci-fixture org migrated first |
| Commission scope creep | E.0 gates E.5 effort |
| Class slots UI in 1,395 LOC route | Plan D-S5 extraction first |

---

## 11. Program close

When all E items complete + Plan A–D exit gates → run dimension scorecard in `overview.md`.
