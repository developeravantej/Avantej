# Codebase Health Audit — Avantej

**Date:** 2026-04-16  
**Branch:** Customer-app  
**Auditors:** 6 parallel agents (Schema, API, Stubs, RBAC, Dead Code, Data Integrity)

---

## Executive Summary

**196 total findings** across 6 audit dimensions.

| Severity | Count | New | Known |
|----------|-------|-----|-------|
| CRITICAL | 12 | 7 | 5 |
| HIGH / BUG | 35 | 30 | 5 |
| MEDIUM / GAP | 51 | 47 | 4 |
| LOW / NIT | 33 | 32 | 1 |
| INFO | 5 | 5 | 0 |
| **Total** | **136** | **121** | **15** |

> 89% of findings are NEW — not previously documented in zhub's Known Issues.

---

## Coverage Scorecard

| Dimension | Health | Detail |
|-----------|--------|--------|
| **Schema Coverage** | 9 orphaned tables, 16 orphaned fields, 6 write-only fields | `payments`, `partner_stripe_accounts`, junction tables, `recurrence_rules` all unimplemented |
| **API Coverage** | 28 dead procedures, 1 phantom call | Waitlist, commission splits, admin panel, org settings — backend done, no frontend |
| **Stubs & Mocks** | 5 critical, 44 total | Onboarding faked, Stripe fully stubbed, permission service is admin-only stub, 20+ `as any` in hierarchy router |
| **RBAC** | 1 critical, 25 unguarded pages | `creditPoints` exploitable via API, 10 routers missing `accessibleNodeIds` filtering |
| **Dead Code** | 19 orphan components, 3 duplicated services, 4 legacy routes | Hierarchy/permission services diverged between `packages/` and `apps/server/` |
| **Data Integrity** | 5 critical, 37 total | Sequence number race conditions, missing unique constraints, spoofable audit fields |

---

## Priority List — CRITICAL & HIGH Items

### CRITICAL (12)

| # | Issue | Source | Status |
|---|-------|--------|--------|
| 1 | **creditPoints exploitable** — any user can set own credit balance via `customerProfiles.upsert` | [RBAC](gaps/rbac-audit.md) | NEW |
| 2 | **Onboarding org creation faked** with setTimeout, no actual API call | [Stubs](gaps/stub-detection.md) | KNOWN |
| 3 | **`orpc.packages.list` not registered** — native app crashes on Buy Package Setup | [API](gaps/api-coverage.md) | KNOWN |
| 4 | **Buy Package Pay sends `packageId` instead of `serviceId`** — Zod validation fails | [Data](gaps/data-integrity.md) | KNOWN |
| 5 | **Book Workout `branchId: null`** fails NOT NULL constraint | [Data](gaps/data-integrity.md) | KNOWN |
| 6 | **Permission service is a stub** — only admin role has permissions, all staff get `false` | [Stubs](gaps/stub-detection.md) | NEW |
| 7 | **`_MOCK_USER_CONTEXT` still exists** in useUserContext (dead code risk) | [Stubs](gaps/stub-detection.md) | NEW |
| 8 | **Buy Package Done uses `* 1.1` hardcoded tax** | [Data](gaps/data-integrity.md) | KNOWN |
| 9 | **Deleting brand/product category silently nulls product references** without warning | [Data](gaps/data-integrity.md) | NEW |
| 10 | **`payments` table entirely orphaned** — 22 columns, zero service/API/frontend coverage | [Schema](gaps/schema-coverage.md) | NEW |
| 11 | **Sequence number generation has race condition** — COUNT-based approach allows duplicates under concurrency | [Data](gaps/data-integrity.md) | NEW |
| 12 | **Appointment junction tables (`appointment_staff`/`appointment_clients`) never populated** — commission splits and group bookings broken | [Data](gaps/data-integrity.md) | NEW |

### HIGH / BUG (35)

| # | Issue | Source | Status |
|---|-------|--------|--------|
| 1 | `partner_stripe_accounts` table fully orphaned — Stripe Connect unimplemented | [Schema](gaps/schema-coverage.md) | NEW |
| 2 | `recurrence_rules` table + 4 recurring fields on appointments — unused | [Schema](gaps/schema-coverage.md) | NEW |
| 3 | `appointment_staff` / `appointment_clients` junction tables bypassed | [Schema](gaps/schema-coverage.md) | NEW |
| 4 | `appointments.roomId` collected by frontend but never sent to API | [Schema](gaps/schema-coverage.md) | NEW |
| 5 | `appointments.googleCalendarEventId` unused (separate mapping table used instead) | [Schema](gaps/schema-coverage.md) | NEW |
| 6 | 6 conflict resolution fields on appointments — never read/written | [Schema](gaps/schema-coverage.md) | NEW |
| 7 | Installments view: 15 `as any` casts, types broken | [API](gaps/api-coverage.md) | KNOWN |
| 8 | Sales/Payment/Packages table buttons are `console.log` stubs | [Stubs](gaps/stub-detection.md) | PARTIAL |
| 9 | Subscribe page leaks payment data to console (6 locations) | [Stubs](gaps/stub-detection.md) | NEW |
| 10 | Stripe integration entirely stubbed (`getStripe()` returns null) | [Stubs](gaps/stub-detection.md) | NEW |
| 11 | `ApiClient` class returns empty arrays — dead stub | [Stubs](gaps/stub-detection.md) | NEW |
| 12 | Admin impersonation not integrated with Better-Auth | [Stubs](gaps/stub-detection.md) | NEW |
| 13 | Stripe webhook handlers have no DB updates (3 events) | [Stubs](gaps/stub-detection.md) | NEW |
| 14 | Auth debug utilities still use old JWT patterns | [Stubs](gaps/stub-detection.md) | NEW |
| 15 | Hierarchy router: 20+ `as any` casts (schema-type mismatch) | [Stubs](gaps/stub-detection.md) | NEW |
| 16 | Branch View: 8+ `as any` casts | [Stubs](gaps/stub-detection.md) | NEW |
| 17 | Service View price formatted as USD (should be MYR) | [Stubs](gaps/stub-detection.md) | KNOWN |
| 18 | Payments + Payouts + Expenses default currency to "usd" | [Stubs](gaps/stub-detection.md) | PARTIAL |
| 19 | Placeholder avatar URL (`via.placeholder.com`) in native dashboard | [Stubs](gaps/stub-detection.md) | NEW |
| 20 | `trainerAvailability.list` — no permission check, any user can view any trainer's schedule | [RBAC](gaps/rbac-audit.md) | NEW |
| 21 | `organizationSettings.get` — returns any setting to any member | [RBAC](gaps/rbac-audit.md) | NEW |
| 22 | `salesOrders.create` accepts spoofable `createdBy` from client input | [Data](gaps/data-integrity.md) | NEW |
| 23 | Sales order missing `customerType` field — walk-in sales saved as "member" | [Data](gaps/data-integrity.md) | NEW |
| 24 | Appointments: `roomId` not in Zod input schema | [Data](gaps/data-integrity.md) | NEW |
| 25 | Appointments: recurring fields not in Zod input schema | [Data](gaps/data-integrity.md) | NEW |
| 26 | Cross-DB userId references never validated (20+ columns affected) | [Data](gaps/data-integrity.md) | NEW |
| 27 | Hierarchy node deletion doesn't check services/appointments/rooms | [Data](gaps/data-integrity.md) | NEW |
| 28 | Supplier email: no unique constraint | [Data](gaps/data-integrity.md) | NEW |
| 29 | Walk-in customer email: no unique constraint | [Data](gaps/data-integrity.md) | NEW |
| 30 | UoM deletion gives raw PostgreSQL error instead of user-friendly message | [Data](gaps/data-integrity.md) | NEW |
| 31 | Hierarchy service duplicated between `packages/` and `apps/server/` (diverged) | [Dead Code](gaps/dead-code.md) | NEW |
| 32 | Permission service duplicated and diverged (4 vs 11+ resources) | [Dead Code](gaps/dead-code.md) | NEW |
| 33 | Hierarchy validation service duplicated | [Dead Code](gaps/dead-code.md) | NEW |
| 34 | Notifications: no `createNotification()` — system is read-only in production | [Schema](gaps/schema-coverage.md) | NEW |
| 35 | Activity log: no `createActivityLogEntry()` — widget always empty in production | [Schema](gaps/schema-coverage.md) | NEW |

---

## Gap Reports (Full Details)

| Report | Findings | Link |
|--------|----------|------|
| Schema & Field Coverage | 41 | [gaps/schema-coverage.md](gaps/schema-coverage.md) |
| API Coverage | 28 dead + 1 phantom + 6 type issues | [gaps/api-coverage.md](gaps/api-coverage.md) |
| Stub & Mock Detection | 44 | [gaps/stub-detection.md](gaps/stub-detection.md) |
| RBAC Audit | 17 | [gaps/rbac-audit.md](gaps/rbac-audit.md) |
| Dead Code & Duplicates | 29 | [gaps/dead-code.md](gaps/dead-code.md) |
| Data Integrity | 37 | [gaps/data-integrity.md](gaps/data-integrity.md) |

---

## Correction: route-guards.ts is NOT a stub

The RBAC audit discovered that `apps/web/src/lib/route-guards.ts` is **fully implemented** with `requirePermission`, `requireAnyPermission`, `requireRole`, and `requireSystemAdmin`. Previous documentation (including MEMORY.md) incorrectly labeled it a stub. The actual issue is that 25 of 39 dashboard pages don't use the guards — the guards themselves work correctly.

---

## Top 5 Recommended Actions

1. **Fix the creditPoints exploit** — remove `creditPoints` from `customerProfiles.upsert` input schema and create an admin-only procedure
2. **Remove duplicated services** — delete `apps/server/src/services/{hierarchy,hierarchy-validation,permission}.service.ts` and import from `@avantej-core/services`
3. **Fix sequence number race conditions** — switch from COUNT-based to PostgreSQL sequences or MAX+1 with retry
4. **Add `beforeLoad` guards to 25 dashboard pages** — route-guards.ts is ready, just needs to be wired up
5. **Change USD defaults to MYR** — `expenses.currency`, `payments.currency`, `payouts.currency` all default to "usd" on a Malaysian platform
