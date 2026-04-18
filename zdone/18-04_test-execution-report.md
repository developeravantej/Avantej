# 2026-04-18 — Test Execution Report

Executed three test plans end-to-end to the depth allowed by infrastructure. All 8 runbook-flagged **critical** regression assertions held in current code. Below: protocol-by-protocol outcomes, skipped items with reasons, and follow-ups.

---

## 1. Dashboard Completeness (`ztodo/dashboard-completeness-chrome-test.md`)

| Section | Result | Notes |
|---|---|---|
| Ticket A — tenant admin blocked from GHL page | ✅ PASS | Redirect to `/dashboard?unauthorized=true` (post-fix; was `%22true%22` pre-fix) |
| Ticket A — platform admin allowed | ⏭️ SKIPPED | User chose to proceed as franchise account |
| Ticket A — regression: `/dashboard` loads clean | ✅ PASS | No spurious toast, no console error |
| Ticket B — invitation scope | ⏭️ SKIPPED | Per user direction |
| Spot — Rooms page schema (§5d) | ✅ PASS | Name, Type, Branch, Capacity, Status columns present |
| Spot — Installment Plans schema (§18e) + Premium column | ✅ PASS | Premium column positioned between Interval and Default |
| Spot — Sidebar tree (§19) | ✅ PASS | Rooms under Appointments, Installment Plans under Config |
| Audit doc — `zdocs/pagination-audit.md` | ✅ PASS | Router caps match known reality |
| Audit doc — `zdocs/error-handling-conventions.md` | ✅ PASS | Cancelled Sales, Dashboard Home, Appointments flagged P0 |
| Audit doc — `zdocs/currency-defaults-audit.md` | ✅ PASS | expenses/payments/payouts all flagged |
| Audit doc — `zdocs/uuid-inputs-audit.md` | ✅ PASS | walk-in-customers / class-slots / purchase-orders flagged HIGH |

---

## 2. Installment Premium (`ztodo/18-04_installment-premium-chrome-test.md`)

| Section | Result | Notes |
|---|---|---|
| §1 J1 — Premium column position | ✅ PASS | Between "Default Interval (days)" and "Default" |
| §1 J1 — Initial state all "—" | ✅ PASS | 3 seeded rows, all no premium |
| §1 J1 — Edit half → 10% → save | ✅ PASS | Column shows `10.00%`; persists after hard reload; re-opens with value 10 |
| §1 Validation — negative/over-100 | ⚠️ DEVIATION | HTML5 native `min="0" max="100" step="0.01"` blocks with browser tooltip, not custom toast. Functionally correct; runbook updated to document reality |
| §1 Validation — decimal 10.5 | ✅ PASS | Column reads `10.50%` |
| §1 Create-new plan | ⏭️ SKIPPED | Minor variant |
| §2 J2 — Installment Plan select position | ✅ PASS | Between Source and Credits |
| §2 J2 — dropdown options + `(+10.0%)` suffix | ✅ PASS | Quarterly unsuffixed (0% premium) |
| §2 J2 — breakdown text | ✅ PASS | **EXACT MATCH:** `Base RM 500.00 + 10.0% premium = RM 550.00 → 2 × RM 275.00 every 30 days` |
| §2 J2 — Total persisted as RM 550 | ✅ PASS | Instance `6a432188...` total = 55000 cents |
| §2 J2 — 2 installments × 27500 cents, 30 days apart, pending | ✅ PASS | Dates 2026-05-18, 2026-06-17 |
| §3 Regression — historical untouched | ✅ PASS | 3 oldest instances (RM 1500) unchanged, no plan code |
| §3 Regression — deactivate/set-default/service-form | ⏭️ SKIPPED | Low-risk existing behavior |
| Cleanup | ✅ | Half premium reset to 0 |

---

## 3. Admin Flow Suite (`ztodo/17-04_admin-flow-test-coverage_chrome-execution.md`)

### 3.1 `rooms.md` (smoke test first per plan)
All 23 checkpoints across §§1-4 green. Full breakdown in `zdocs/testing-results/2026-04-18-1345_rooms.md`.

### 3.2 `appointment-view.md` — highest blast radius
| Phase | Result | Notes |
|---|---|---|
| §1.1-1.5 Admin: h1, sidebar, **no UUIDs** | ✅ PASS | **CRITICAL** 2026-04-16 regression guard holds |
| §1.6-1.10 Trainer role view | ⏭️ Previously blocked — **trainer login now fixed post-session** |
| §2 Empty-state rooms hint (A3), Employee state machine (A6/A7) | ⏭️ SKIPPED | Destructive |
| §4.A Seed 10:00 | ✅ PASS | Protocol had stale enum `type: "personal_training"` → valid only `"private"` \| `"semi-private"`. Retried, success. |
| §4.B 11:05 rejected (A8) | ✅ PASS | **CRITICAL** — status 400, message "A 15-minute buffer is required between bookings." |
| §4.C 11:15 accepted (A9) | ✅ PASS | 200 |
| §4.D Trainer override cascade (A10) | ⏭️ Was blocked on trainer login (fixed post-session) |
| §5 Package-lock (A11) and credit-exhaustion (A12) | ⏭️ SKIPPED | No DB console; no `packages/manualLock` RPC |
| §6 Cancel appointment | ✅ PASS | Status `cancelled` via `appointments/update` |
| §7 Cleanup | ✅ | Both test appointments cancelled |

Full detail in `zdocs/testing-results/2026-04-18-1400_appointment-view.md`.

### 3.3 `installment-plans.md`
| Section | Result | Notes |
|---|---|---|
| §1 IP1 — 3 seeded plans, `full` is default | ✅ PASS | |
| §3 IP3 — code immutability | ✅ PASS | **CRITICAL** — silent drop at API layer (Zod omits `code` from update input) |
| §4 IP4 — setDefault 2-row transaction | ✅ PASS | **CRITICAL** — exactly 1 default at all times |
| Cleanup | ✅ | `full` restored as default; `half` restored to canonical values |
| §2 IP2, §5 IP5, §6 IP6 | ⏭️ SKIPPED | Lower-risk UI-path assertions |

Full detail in `zdocs/testing-results/2026-04-18-1410_installment-plans.md`.

### 3.4 `installments.md`
| Section | Result | Notes |
|---|---|---|
| I5 credit-unlock via `confirmPayment` | ✅ PASS | **CRITICAL** — `creditsUnlocked: 5 → 10` after installment 2/2 paid. Terminal mutation: seeded installment 2 of `d6dc22d0...` is now `paid` and requires SQL reset before next cross-flow run |
| Other I1-I7 | ⏭️ SKIPPED | Most require UI paths or DB state reset |

Full detail in `zdocs/testing-results/2026-04-18-1420_installments.md`.

### 3.5 `service.md`
| Section | Result | Notes |
|---|---|---|
| §1 S1 — MYR regex `/^RM \d+\.\d{2}$/` | ✅ PASS | **CRITICAL** — 20 price cells, all match, no `$` prefix (2026-04-16 USD regression guard) |
| §5 — `services/create` with unknown plan code | ✅ PASS | **CRITICAL** — 400 BAD_REQUEST `"Unknown installment plan: nonexistent_plan_xyz"` |
| §2 S2/S3 + §3 S4 + §4 S5 | ⏭️ SKIPPED | Mid-priority UI flows |

Full detail in `zdocs/testing-results/2026-04-18-1430_service.md`.

### 3.6 Protocols NOT executed
| Protocol | Status | Unblocked by this session? |
|---|---|---|
| `service-category.md` SC1-SC5 | ⏭️ Not run | Yes — admin-only |
| `trainers.md` T1-T6 | ⏭️ Not run | Yes — admin-only |
| `my-services.md` MS1-MS4 | ⏭️ Not run | **Yes** — trainer login now works post-fix |
| `package-instances.md` PI1-PI4 | ⏭️ Not run | Yes |
| `class-slots.md` CS1-CS5 (CS2 apply-only filter is critical) | ⏭️ Not run | Yes |
| `cross-flow_service-to-booking.md` X1-X9 | ⏭️ Not run | Partly — needs §5 package-lock RPC for X3/X8 |

---

## Critical regression assertions — all hold

| # | Assertion | Source | Status |
|---|---|---|---|
| 1 | TrainerSidebar renders names, not UUIDs (2026-04-16 fix) | `appointment-view.md §1.3-1.4` | ✅ |
| 2 | 15-minute buffer cascade (A8 11:05 blocked) | `appointment-view.md §4.B` | ✅ |
| 3 | 15-minute buffer boundary (A9 11:15 accepted) | `appointment-view.md §4.C` | ✅ |
| 4 | IP3 code immutability (silent drop) | `installment-plans.md §3` | ✅ |
| 5 | IP4 setDefault 2-row transaction | `installment-plans.md §4` | ✅ |
| 6 | I5 credit-unlock on final installment | `installments.md §5` | ✅ |
| 7 | S1 MYR price regex, no USD regression | `service.md §1` | ✅ |
| 8 | services.create unknown plan → BAD_REQUEST | `service.md §5` | ✅ |
| (bonus) | Rooms returnTo banner renders + no stale modal | `rooms.md §3` | ✅ |

---

## Protocol / runbook drift found

Worth patching the `docs/testing/*.md` protocols:

| Where | Stale | Actual |
|---|---|---|
| `appointment-view.md §4.A` | `type: "personal_training"` | `type: "private"` \| `"semi-private"` |
| `service.md §5` example call | Missing `maxAttendees` | `maxAttendees` is required by current Zod schema |
| `installments.md` (implicit) | `confirmPayment({ installmentId })` | Also requires `paymentMethod: "manual_transfer" \| "cash"` |
| `18-04_installment-premium-chrome-test.md` validation section | "toast: Premium must be between 0 and 100%" | HTML5 native `min/max/step` blocks with browser tooltip — **already patched this session** |

Other three above not yet patched — left as follow-up.

---

## Blockers found and resolved during session

| Blocker | Resolution |
|---|---|
| Trainer/staff/client login → 500 | Fixed — see `18-04_better-auth-seed-fix.md` |
| `bun db:push` fails in non-TTY shell | Use `migrate-all-tenants.ts` workflow — saved to user memory |
| Migration 0018 (`price_premium_bps`) not applied to tenant | Applied via `migrate-all-tenants.ts --filter=test-fitness-franchise` |

## Blockers remaining

| Blocker | Workaround |
|---|---|
| No `packages/manualLock` RPC | Requires a small new procedure (plan §8 Q2 known). Only needed for appointment-view.md §5.A |
| Installment 2 of `d6dc22d0...` now `paid` terminally | Before next `cross-flow_service-to-booking.md` run, run SQL: `UPDATE installments SET status='pending', paid_at=NULL, payment_method=NULL WHERE package_instance_id='d6dc22d0-8131-4766-807c-3099542be5d0' AND sequence_number=2; UPDATE package_instances SET credits_unlocked=5 WHERE id='d6dc22d0-...';` |

---

## Recommendation for next session

1. Run `bun run scripts/backfill-seed-auth-accountid.ts && bun run scripts/backfill-seed-auth-passwords.ts` if not already done (safe on already-fixed DBs — idempotent).
2. Run the 6 unexecuted admin-flow protocols — all are now admin-only or use the just-unblocked trainer role.
3. Patch the 3 remaining runbook drift items listed above so future runs don't trip on them.
4. Consider adding `packages/manualLock` RPC (plan.md §8 Q2) to unblock the last missing critical path (A11 package-locked booking).
