# Avantej — End-to-End Test Plan (Playwright)

**Status:** DRAFT for review · **Date:** 2026-06-03 · **Owner:** generated via `/testing-strategy`

This plan covers **feature completeness**, **operation pipelines**, and **end-user journeys** for the
Avantej multi-tenant gym/wellness SaaS. Each E2E test produces a **title + journey steps + recorded
video + screenshots**, aggregated into a **self-contained HTML review page** for sign-off.

> Review this plan first. Nothing below is implemented yet. Tiers (P0/P1/P2) are there so you can trim
> scope in review. Decisions baked in as **[CHOICE]** can be overridden.

---

## 1. Scope & ground rules

| Item | Decision |
|------|----------|
| **Harness** | Playwright (Chromium), web app only. |
| **Native RN app** | **Out of Playwright scope** — Playwright drives browsers, not React Native. The 29 native screens (`buy-package` 10-step, `book-workout` 4-step, bookings/calendar/explore/packages/profile) need **Detox or Maestro**. `bun dev` crashes on `native#dev` anyway (Expo dep mismatch — see memory). Documented as **Suite 14 (separate track)**; not built here unless you opt in. |
| **Target env** | **[CHOICE]** Running dev app — web `:3021` → server `:3020` (the `e2e-verify` model), **not** the `:3001` preview-build harness. Reason: dev is where per-test video review is cheapest and matches the existing `e2e-verify` precedent. |
| **Run cmd** | `bunx turbo dev --filter=web --filter=server` (exclude native — kills the turbo run otherwise). Standard ports only (Alchemy service binding breaks on alternate ports). |
| **Tenant** | Test org `TEST_ORG_ID = 996febce-aaad-4ded-8f47-02d2b566c8ee`. Tenant admin `franchisee@gmail.com / password123`. Platform admin `developer.avantej@gmail.com / password123`. |
| **Pattern** | Mirror existing `e2e/*.journey.spec.ts` (oRPC-seeded, `test.step()`-structured) + `e2e-verify` (video:on, HTML review builder). |

---

## 2. Test infrastructure to build (prerequisites — 4 must-haves)

These do not exist yet and are required for the "video + images per test → HTML page" deliverable.

### 2.1 Multi-role auth fixtures
`auth.setup.ts` today logs in only the tenant admin. RBAC is core to this app, so add storageState
fixtures (one setup project each):

| Fixture | Login | Used by |
|---------|-------|---------|
| `tenant-admin.json` | `franchisee@gmail.com` (exists) | most tenant suites |
| `scoped-staff.json` | a non-admin member scoped to one branch | RBAC deny + hierarchy-scoping tests |
| `trainer.json` | a trainer member | my-commissions, my-services, self-assign |
| `platform-admin.json` | `developer.avantej@gmail.com` | platform-admin suite |
| _anonymous_ | no storageState | onboarding QR, invite-accept, login-failure |

> Seeding the scoped-staff/trainer logins may require provisioning those members + credentials once
> (control-panel `user` + `account` rows, same id pattern as the platform-admin memory note).

### 2.2 Dedicated journey Playwright config
New `playwright.journeys.config.ts` (clone of `e2e-verify/playwright.verify.config.ts`):
- `video: "on"`, `screenshot: "on"`, `trace: "on"` — **every** test records, not just failures
  (current root config is `retain-on-failure` / `only-on-failure` → passing tests yield no video).
- `baseURL: http://localhost:3021`, `workers: 1`, `reporter: [["list"], ["json", { outputFile }]]`,
  `outputDir` per run, one project per role fixture.

### 2.3 Multi-test HTML report builder (rewrite of `e2e-verify/build-review.ts`)
Current `build-review.ts` is **hardcoded to one test** (reads exactly one `journey.webm` + one
`final-screen.png`, single-entry `TESTS` array). Rewrite it to:
- consume the Playwright **JSON reporter** (`report.json`) + per-test `video.webm` + step screenshots
  from `outputDir`,
- emit a **multi-test** `review.html`: per-test card with title · tier · pass/fail badge · duration ·
  numbered journey steps · embedded `<video>` · screenshot gallery,
- index/summary header (N tests · X passed · Y failed · per-suite grouping).

### 2.4 Deterministic seeding (biggest practical risk)
Existing journeys `test.skip()` when preconditions are missing → an unseeded tenant yields mostly
skips → **no videos → empty review page**. Mitigation, **[CHOICE]** option A (recommended):
- A **`e2e/helpers/seed-journey-fixtures.ts`** that, before the suite, idempotently ensures the
  required tenant state (≥1 active client, trainer, package-type service, product, installment plan,
  tax rate, promo code, branch node) by reusing/extending the existing oRPC seeders in
  `e2e/helpers/seed-data.ts`. Each created entity is tagged (`E2E-…`) and cleaned up idempotently.
- Option B: document a required-tenant-state checklist and assert-fail (not skip) if missing.

---

## 3. Test suites (tiered)

Tier key: **P0** = revenue / auth / data-integrity critical · **P1** = important secondary flow ·
**P2** = cosmetic / read-only render. `[exists]` = a journey-level spec already covers it (extend with
video/HTML); unmarked = **gap**. Each test ships: title, `test.step()` journey, video, screenshots.

### Suite 1 — Auth & Onboarding  *(anonymous + new tenant)*
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| AUTH-01 | P0 | anon | Login happy path → redirect `/dashboard`, org context bootstrapped `[exists smoke]` |
| AUTH-02 | P0 | anon | Invalid credentials → inline error, stays on `/login` |
| ONB-01 | P0 | anon | Branch QR onboarding: scan invite URL → fill member form → submit → member created `[exists partial]` |
| AUTH-03 | P1 | anon | Invitation accept → setup-password → first login → onboarding wizard → org ready |
| AUTH-04 | P1 | anon | Email OTP verification flow |
| ONB-02 | P1 | admin | New-branch 4-step create wizard → branch appears in hierarchy `[exists smoke]` |
| AUTH-05 | P2 | admin | Logout → protected route redirects to `/login` |
| **Edges** | | | expired/revoked invite → "no longer active"; orgless signup rollback; multi-use invite |

**Pipelines:** session+cookie issue, `auth.userContext` bootstrap, invitation token state machine, org provisioning rollback.

### Suite 2 — RBAC & Access Control  *(multi-role — the completeness core)*
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| RBAC-01 | P0 | admin | Create custom role → grant permissions → assign to staff → staff nav reflects grant |
| RBAC-02 | P0 | scoped-staff | **DENY**: staff without `commission:approve` can't see/click Approve; direct oRPC call → FORBIDDEN |
| RBAC-03 | P0 | scoped-staff | Hierarchy scoping: staff sees only their branch's members/sales (`accessibleNodeIds`) |
| RBAC-04 | P1 | admin | Member lifecycle: invite → accept → suspend → reactivate → remove |
| RBAC-05 | P1 | admin | Role permission edit propagates (assert after reload — stale localStorage cache gotcha) |
| RBAC-06 | P2 | admin | Permissions matrix viewer renders |
| **Edges** | | | last-admin protection; deactivated member loses access mid-session |

**Pipelines:** `role_permissions` writes, `getDescendantNodeIds` scoping, permission-gate enforcement (UI + server), invitation lifecycle.

### Suite 3 — Hierarchy & Branch
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| HIER-01 | P1 | admin | Create node region→area→branch → appears in tree |
| HIER-02 | P1 | admin | Reassign member to new scope → access updates |
| HIER-03 | P1 | admin | Bulk reassign members |
| HIER-04 | P2 | admin | Move / delete node guardrails |

### Suite 4 — Appointments & Scheduling
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| APPT-01 | P0 | admin | Create private appointment (trainer+client+service) → on calendar, confirmed |
| APPT-02 | P0 | admin | Complete appointment → commission split generated (engine) `[exists]` |
| APPT-03 | P0 | admin | Cancel appointment → commission void/reverse `[exists]` |
| APPT-04 | P1 | admin | Recurring series: create → virtual occurrences → materialize → split → cancelFuture/cancelSeries |
| APPT-05 | P1 | admin | Class slot: create → signups → capacity enforced |
| APPT-06 | P1 | admin | Double-book / trainer buffer enforcement → blocked |
| SCHED-01 | P1 | trainer | Trainer availability upsert → reflected in booking window |
| APPT-07 | P2 | admin | Rooms CRUD; preferred-times set |
| **Edges** | | | buffer overlap, past-time booking, capacity overflow, recurrence DST/timezone |

**Pipelines:** recurrence virtual-occurrence materialization, commission engine trigger, buffer/availability validation.

### Suite 5 — Attendance & Check-in
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| ATT-01 | P0 | admin | Today bookings → check-in member → **credit decremented** |
| ATT-02 | P0 | admin | Delete check-in → **credit reverted** (integrity) |
| ATT-03 | P1 | admin | Bulk check-in |
| ATT-04 | P1 | admin | Walk-in / drop-in check-in |
| **Edges** | | | check-in with no active package → blocked; double check-in idempotency |

### Suite 6 — POS & Sales  *(revenue-critical)*
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| POS-01 | P0 | admin | Full POS 4-step checkout: pick customer → add service+product → tax → pay cash → order + receipt |
| POS-02 | P0 | admin | POS package sale → package instance created + `salesOrderId` linked `[exists]` |
| POS-03 | P0 | admin | POS installment plan → correct # installment rows `[exists]` |
| POS-04 | P0 | admin | Apply promotion code → discount reflected in total |
| POS-05 | P1 | admin | POS non-client member → error `[exists]` |
| SALES-01 | P1 | admin | Sales list filters + stats; detail items; statusHistory pagination |
| SALES-02 | P1 | admin | Cancel sale → cancelled-sales list + KPI `[exists]` |
| **Edges** | | | tax rounding, promo expiry/validation, mixed-item cart, card/bank_transfer methods |

**Pipelines:** `pos.recordSale` → sales_order + items + payment + (package instance / installments) + commission split + KPI rollup.

### Suite 7 — Packages, Memberships & Installments
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| PKG-01 | P0 | admin | Purchased package → approval gate (pending) → approve + assign trainer → active `[exists smoke approvals]` |
| PKG-02 | P0 | admin | Reject pending package → cancelled + customer notified |
| INST-01 | P0 | admin | Installment confirmPayment → credits adjusted; processRefund path |
| PKG-03 | P1 | admin | Package lifecycle: freeze/unfreeze, extend, cancel `[exists ×3]` |
| PKG-04 | P1 | admin | package-instance-staff assign / replace / remove |
| MEM-01 | P1 | admin | Membership list + status transitions |
| **Edges** | | | approval gate off vs on; trainer self-assign; expiry handling |

### Suite 8 — Commissions, Payouts & Expenses
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| COMM-01 | P0 | admin | Appointment-complete → split at correct tier rate `[exists]` |
| COMM-02 | P0 | admin | Appointment-cancel → no/void split `[exists]` |
| COMM-03 | P0 | admin | POS product → immediate split; POS service → no split `[exists ×2]` |
| COMM-04 | P0 | admin | Approve splits → markPaid → **payout row created** `[payout exists]` |
| COMM-05 | P1 | admin | Manual adjustment (bonus/clawback); void with reason |
| COMM-06 | P1 | trainer | My commissions self-view `[exists smoke]` |
| EXP-01 | P1 | admin | Expense submit → approve → markPaid; reject path |
| COMM-07 | P1 | admin | Category-commission config + trainer-tiers CRUD |
| **Edges** | | | liability summary aggregation, double-pay guard, clawback below zero |

### Suite 9 — Inventory & Procurement
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| INV-01 | P0 | admin | Product create → stock adjust → level reflects |
| PO-01 | P0 | admin | Purchase order: create → approve → receiveItems → **stock increases** (goods receipt) |
| PO-02 | P1 | admin | Goods-receipt invoice → dispute / markInvoicePaid |
| STK-01 | P1 | admin | Stock request → approve → fulfill (cross-branch) |
| TRF-01 | P1 | admin | Transfer order: create → markInTransit → complete → **stock moves** |
| INV-02 | P1 | admin | Brands / product-categories / suppliers / UoM / conversions CRUD |
| **Edges** | | | negative-stock guard, UoM conversion math, PO cancel after partial receive |

### Suite 10 — Customers & Trainers
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| CUST-01 | P1 | admin | Directory + Customer-360 drawer (aggregated metrics) `[exists smoke]` |
| CUST-02 | P1 | admin | Customer profile upsert (admin-scoped) |
| CUST-03 | P1 | admin | Walk-in customers log `[exists smoke]` |
| TRN-01 | P1 | admin | Trainers directory; service-members assign/remove; buffer override |
| TRN-02 | P1 | trainer | My-services + updateMyBuffer (self) `[exists smoke]` |

### Suite 11 — Refunds & Cancellations Lifecycle
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| REF-01 | P0 | admin | Request refund on paid sale → approve → process → **refund recorded + credits/commission reversed** |
| REF-02 | P0 | admin | Reject refund → unchanged |
| REF-03 | P1 | admin | Installment refund (`installments.processRefund`) |
| **Edges** | | | refund > paid guard, double-refund guard, partial refund |

### Suite 12 — Settings, Notifications & Announcements
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| SET-01 | P1 | admin | Org settings update (name/logo/timezone) |
| SET-02 | P1 | admin | Tax rate create → setDefault → **applied in POS total** |
| SET-03 | P1 | admin | Installment plan create → setDefault `[exists smoke]` |
| SET-04 | P1 | admin | Google Calendar connect/status (OAuth stub) `[exists smoke]` |
| ANN-01 | P1 | admin | Announcement create (scopedBranchIds) → branch-scoped visibility in listActive |
| NOTIF-01 | P1 | admin | Notifications: list → markRead → unread count → markAllRead |
| SET-05 | P2 | admin | Notification prefs; audit log + user-activity render `[exists smoke]` |

### Suite 13 — Platform Admin & Integrations  *(platform-admin role)*
| ID | Tier | Actor | Journey |
|----|------|-------|---------|
| PA-01 | P0 | platform-admin | Sidebar lean + Billing money-hub tabs `[exists e2e-verify]` |
| PA-02 | P0 | platform-admin | Tenants list + tenant detail (billing/health/members/flags) `[many exist]` |
| IMP-01 | P0 | platform-admin | Impersonate tenant member → stop (round-trip) `[exists]` |
| PA-03 | P1 | platform-admin | Mission control, health scoreboard, comms, webhooks, migrations, renewals, coupons `[exist]` |
| INTG-01 | P1 | platform-admin | GHL staff/customer sync (MOCK_GHL) `[exist ×10]` |
| INTG-02 | P1 | anon/admin | Stripe Connect onboarding + subscribe → checkout → webhook `[exist]` |
| KPI-01 | P1 | admin | Dashboard KPIs + staff performance render with real data `[exists smoke]` |

> Suite 13 is **largely covered already** in `apps/web/e2e/tests/`. Plan here = (a) wrap key flows with
> video/HTML for the review page, (b) fill any P0 gaps. Lowest net-new effort.

### Suite 14 — Native Customer App  *(OUT OF PLAYWRIGHT SCOPE — documented track)*
Customer-side journeys for completeness, **not built with Playwright**: `buy-package` (10 steps:
select→info→plan→schedule→setup→terms→sign→review→pay→done), `book-workout` (4 steps:
setup→schedule→review→done), bookings, calendar, explore, packages, profile, notifications.
**Needs Detox/Maestro.** Opt-in as a separate track if desired.

---

## 4. Coverage matrix — 52 routers → suite / tier

| Router | Suite | Tier | Existing |
|--------|-------|------|----------|
| auth, invitations, registration | 1 | P0 | partial |
| roles, role-permissions, permissions | 2 | P0/P2 | smoke |
| members | 2 | P0/P1 | smoke |
| hierarchy | 3 | P1 | smoke |
| appointments | 4 | P0/P1 | journey |
| class-slots, rooms, preferred-times, service-category-config, trainer-availability | 4 | P1/P2 | smoke |
| check-ins, walk-in-customers | 5,10 | P0/P1 | gap |
| pos, sales-orders | 6 | P0 | journey |
| promotions, tax-rates, invoices, cancelled-sales | 6,12 | P0/P1 | smoke/journey |
| package-instances, package-instance-staff | 7 | P0/P1 | smoke |
| installments, installment-plans | 7 | P0/P1 | journey/smoke |
| commission-splits, category-commission, trainer-tiers | 8 | P0/P1 | journey |
| payouts, expenses | 8 | P0/P1 | journey/gap |
| products, brands, product-categories, suppliers | 9 | P0/P1 | smoke |
| stock-requests, transfer-orders, units-of-measure, purchase-orders, goods-receipts | 9 | P0/P1 | smoke/gap |
| customer-directory, customer-profiles, member-profiles | 10 | P1 | smoke |
| service-members, category-buffer-overrides | 10 | P1 | smoke |
| refunds | 11 | P0 | smoke |
| organization-settings, notification-preferences, notifications, announcements | 12 | P1 | smoke |
| google-calendar, audit-logs, user-activity-log | 12 | P1/P2 | smoke |
| admin, tenant-admin | 13 | P0 | journey |
| analytics | 13 | P1 | smoke |

**Gap headline:** existing `e2e/` is ~90% **"page loads / no crash" smoke**. The **deep journeys +
pipelines + RBAC deny boundaries + data-integrity reversals** (POS happy path, refund lifecycle,
attendance credit reversal, procurement stock flow, RBAC scoping, package approval) are the **net-new
value** of this suite. Platform-admin/integration (Suite 13) is already deep — wrap, don't rebuild.

---

## 5. Deliverable — the HTML review page
After a run: `bun e2e/journeys/build-review.ts` (rewritten §2.3) reads the JSON report + per-test
artifacts and emits a single self-contained `review.html` (base64-embedded video + screenshots) — one
card per test with **title · tier · status · steps · video · screenshots**, grouped by suite, with a
summary header. Opens offline in any browser; no server needed.

---

## 6. Proposed build order (after you approve this plan)
1. **Infra (§2):** role fixtures → journey config → multi-test HTML builder → seed helper. *(unblocks everything)*
2. **P0 suites:** 6 POS, 4 Appointments, 8 Commissions/Payouts, 11 Refunds, 5 Attendance, 7 Packages, 2 RBAC, 1 Auth, 13 Platform.
3. **P1 suites:** 9 Inventory, 3 Hierarchy, 10 Customers, 12 Settings.
4. **P2** + edges as time allows.
5. Generate `review.html`, hand over for video review.

Each test: deep source-grounding (exact `data-testid`/selectors, edge assertions) happens at
implementation time — API drift exists (specs reference `installments.adminOverview`,
`products.resolvePrice` not in the public catalog), so procedure names get verified per test.

---

## 7. Open decisions (override in review)
1. **Env** — dev `:3021` (recommended) vs `:3001` preview harness?
2. **Scope** — all tiers, or **P0+P1 only** for the first pass?
3. **Seeding** — auto-seed fixtures (option A) vs required-state checklist (option B)?
4. **Native** — leave as documented Suite 14, or add a Detox/Maestro track?
5. **Suite 13** — re-wrap existing platform/integration flows for the HTML page, or skip (already covered)?
