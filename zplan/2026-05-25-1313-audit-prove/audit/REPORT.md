# Audit-Prove Report — 2026-05-25

**Session:** `zplan/2026-05-25-1313-audit-prove`
**Scope:** 5 domains · 25 findings (17 testable)
**Build gate:** pending  ·  **Video:** pending
**Remediation:** not started  ·  **Branch:** `audit-prove/remediation-20260525`

Pages audited: Home, Approvals, Customers, Appointments, Class Slots, Trainer Availability, Services, POS, Reports, Announcements, Sales & Payments, Payment History, Cancelled Sales, Payouts, Refunds, Commissions, Tax Rates, Installment Plans, Expenses, Products, Packages, Trainers, Employees, Attendance, Roles, Staff Access, Branches, Onboarding QR (28 pages, 5 domains)

---

## 1. Findings (prioritized)

Legend: ✅verified · 📋agent-reported · ⚠️corrected

### P1 — Critical

| ID | Domain | Title | Status | Testable | Verified |
|---|---|---|---|---|---|
| F-CUST-01 | Scheduling | `no_show` vs `no-show` mismatch — commission never fires for no-shows | partial | ✅ | ✅verified |
| F-POS-01 | Sales/POS | Stock never decrements on POS product sale — inventory always wrong | missing | ❌ | ✅verified |
| F-POS-02 | Sales/POS | salesOrders.cancel has no Stripe refund call — money not returned | partial | ✅ | 📋agent-reported |
| F-POS-03 | Sales/POS | Cancelled sale leaves package_instances active — credits survive refund | partial | ✅ | 📋agent-reported |
| F-FIN-01 | Finance | `processCommissionReversals` orphan — commission clawbacks vanish from ledger | missing | ✅ | ✅verified |
| F-FIN-02 | Finance | `markPaidById.paymentReference` accepted but silently dropped | partial | ✅ | 📋agent-reported |
| F-FIN-03 | Finance | `refunds.cancel` endpoint missing — cancelled status unreachable | missing | ❌ | 📋agent-reported |
| F-HOME-01 | Operations | `bulkApprove` missing `package_instance_staff` insert + no notification | partial | ✅ | 📋agent-reported |
| F-HOME-02 | Operations | `bulkReject` sends no customer notification (single-reject does) | partial | ✅ | 📋agent-reported |
| F-HOME-03 | Operations | `scheduledReports.list` has no RBAC guard | partial | ✅ | 📋agent-reported |
| F-HOME-05 | Operations | `listPending` branch filter applied after SQL LIMIT 50 — truncated results | partial | ✅ | 📋agent-reported |
| F-CUST-02 | Scheduling | Waitlist `promoteFromWaitlist` creates no appointment row | partial | ✅ | 📋agent-reported |
| F-CUST-03 | Scheduling | `cancelEnrollment` raw SQL — skips credit restore, status-history, commission | partial | ✅ | 📋agent-reported |
| F-CUST-05 | Scheduling | Series-cancel/splitSeries RBAC gated on `create` not `update` | partial | ✅ | 📋agent-reported |
| F-STAFF-02 | Staff/Access | Role deletion leaves `members.roleId` dangling — security regression | partial | ✅ | ✅verified |
| F-STAFF-04 | Staff/Access | `assertTenantAndMember` in google-calendar.ts has empty body — never throws | partial | ✅ | 📋agent-reported |

### P2 — Significant

| ID | Domain | Title | Status | Testable | Verified |
|---|---|---|---|---|---|
| F-CUST-04 | Scheduling | `computeAvailableSlots` ignores `trainerAvailabilityExceptions` | partial | ✅ | 📋agent-reported |
| F-POS-04 | Sales/POS | POS receipt Email button stub; walk-in search missing from picker | partial | ✅ | 📋agent-reported |
| F-POS-05 | Sales/POS | `products.resolvePrice` no RBAC; order number generators race-prone | partial | ✅ | 📋agent-reported |
| F-FIN-04 | Finance | `rejectExpense` drops `rejectedBy` userId — never persisted | partial | ✅ | 📋agent-reported |
| F-FIN-05 | Finance | No audit trail for Expenses, Tax Rate CRUD, Installment Plan CRUD | missing | ❌ | 📋agent-reported |
| F-HOME-04 | Operations | `userActivityLog` table never written to — endpoint always empty | partial | ❌ | 📋agent-reported |
| F-STAFF-01 | Staff/Access | `markExpiredInvitations` never called — invitations stay pending forever | missing | ❌ | 📋agent-reported |
| F-STAFF-03 | Staff/Access | Google Calendar sync push-only — two_way/from_google modes no-op | partial | ❌ | 📋agent-reported |
| F-STAFF-05 | Staff/Access | `resolvePrice`/`setBranchPrice` missing RBAC — any staff can override | partial | ✅ | 📋agent-reported |

---

## 2. Top-priority remediation targets

These are the highest-value fixes (data loss / security / revenue leakage):

1. **F-CUST-01** — Fix `no_show` → `no-show` in appointment.service.ts commission trigger (1-line fix, high revenue impact)
2. **F-STAFF-02** — Add pre-delete guard or CASCADE NULL on role deletion
3. **F-HOME-05** — Move branch filter to SQL WHERE before LIMIT
4. **F-POS-03** — Revoke package_instances on sale cancellation
5. **F-HOME-01** — Insert `package_instance_staff` row + dispatch notification in bulkApprove
6. **F-FIN-01** — Wire `processCommissionReversals` into payouts.runBatch or a dedicated payout endpoint
7. **F-FIN-02** — Persist `paymentReference` in markPaidById
8. **F-HOME-02** — Fire notification in bulkReject
9. **F-CUST-02** — Create appointment row in waitlist promote
10. **F-CUST-03** — Replace raw SQL in cancelEnrollment with proper lifecycle call

---

## 3. Deferred / out-of-scope for this loop

- **F-POS-01** (stock movements) — requires schema change (new `stock_movements` table); flagged as `S-stock-movements` deferred
- **F-POS-02** (Stripe refund on cancel) — requires server-side Stripe API call; deferred for Stripe integration sprint
- **F-FIN-03** (refunds.cancel endpoint) — requires new router procedure + status machine update
- **F-STAFF-01** (markExpiredInvitations cron) — requires cron job infrastructure
- **F-STAFF-03** (GCal two-way sync) — large feature; webhook registration infrastructure needed
- **F-FIN-05** (audit trail) — cross-cutting; needs a separate audit-trail sprint

---

## 4. Per-domain audit files

- `audit/01-home-operations.md` — 17 findings, 10 testable
- `audit/02-customers-scheduling.md` — 13 testable findings
- `audit/03-sales-pos.md` — 7 testable findings
- `audit/04-finance.md` — 4 testable findings
- `audit/05-staff-access.md` — 11 testable findings

Machine-readable: `audit/findings.json`

---

*Remediation loop, test plan, Playwright harness, and proof video: pending — see Phase 2–5.*
