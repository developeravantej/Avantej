# Domain CRM, Customers & Promotions

## Endpoints / Procedures

### customer-profiles.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| get | tenantProcedure (self) | Fetch own customer profile | getCustomerProfile |
| upsert | tenantProcedure (self) | Update own profile (partial) | upsertCustomerProfile |
| upsertForCustomer | customer_management:update | Admin: upsert any client profile | upsertCustomerProfile |
| listLeadSources | tenantProcedure | List acquisition channels | (query) |

### customer-directory.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | customer_management:read | Paginated list + metrics + RBAC | listCustomerDirectory |
| getStats | customer_management:read | KPI aggregates (active/lapsed/lead) | getCustomerStats |
| getById | customer_management:read | Full customer detail drawer | getCustomerDetail |

### promotions.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | promotion_management:read | List promotions (filterable) | listPromotions |
| validate | promotion_management:read | Check code + calc discount | validatePromoCode |
| apply | promotion_management:create | Commit usage + increment | applyPromotion |
| create | promotion_management:create | Insert new + audit | createPromotion |
| update | promotion_management:update | Patch fields | updatePromotion |
| deactivate | promotion_management:delete | Soft-deactivate + audit | deactivatePromotion |

### waitlist.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | appointment_management:read | Query entries | listWaitlistEntries |
| add | appointment_management:create | Enqueue + position | addToWaitlist |
| remove | appointment_management:update | Cancel entry | removeFromWaitlist |
| promote | appointment_management:update | Promote + atomic book + appt | promoteFromWaitlist |

### preferred-times.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| list | tenantProcedure | Fetch preferred times | listPreferredTimes |
| upsert | service_management:update OR self | Replace times (max 4) | upsertPreferredTimes |

### coach-intake.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| listSlots | tenantProcedure | Fetch recurring slots | listCoachIntakeSlots |
| upsertSlots | appointment_management:update OR self | Replace slots | upsertCoachIntakeSlots |
| getOpenSlots | tenantProcedure | Compute free slots | computeOpenIntakeSlots |
| claimSlot | appointment_management:update OR self | Block slot | claimIntakeSlot |
| unclaimSlot | tenantProcedure | Unclaim | unclaimIntakeSlot |
| listExceptions | tenantProcedure | Fetch claimed slots | listIntakeExceptions |
| listByBranch | tenantProcedure | Trainers + slots by branch | listCoachIntakeByBranch |

### google-calendar.ts
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| status | tenantProcedure | Caller connection status | (query) |
| disconnect | tenantProcedure | Revoke token + delete | revokeGoogleToken |
| orgStatus | appointment_management:read | Org-wide sync stats | (aggregates) |
| updateSettings | appointment_management:update | Update sync config | (update) |
| syncNow | appointment_management:update | Rate-limited sync | checkSyncNowRateLimit |
| listConnectedCalendars | appointment_management:read | Fetch calendarList + cache | listGoogleCalendars |

## Logic Functions

### customer-profile.service.ts
- `getCustomerProfile()` - Get by user_id or null
- `upsertCustomerProfile()` - Insert/UPDATE; undefined=skip, null=clear

### customer-directory.service.ts
- `listCustomerDirectory()` - Paginated + RBAC + lifecycle inference
- `getCustomerStats()` - KPI aggregates (total/active/lapsed/lead)
- `getCustomerDetail()` - Full detail (member+profile+packages+payments)

### walk-in.service.ts
- `convertWalkInPaymentToPackage()` - Atomically convert succeeded to package [ORPHAN]

### promotions.service.ts
- `listPromotions()` - Query with filters
- `validatePromoCode()` - Lock + validate (active/date/limits)
- `applyPromotion()` - Transact: re-validate + insert usage + increment
- `createPromotion()` - Insert + audit
- `updatePromotion()` - Patch-update
- `deactivatePromotion()` - Soft-delete + audit

### preferred-time.service.ts
- `listPreferredTimes()` - Fetch ordered by priority
- `upsertPreferredTimes()` - Delete + insert (max 4), validate dayOfWeek

### coach-intake.service.ts
- `listCoachIntakeSlots()` - Fetch active recurring
- `upsertCoachIntakeSlots()` - Delete + insert; validate no overlap
- `computeOpenIntakeSlots()` - Recurring minus exceptions
- `claimIntakeSlot()` - Insert exception
- `unclaimIntakeSlot()` - Delete exception
- `listIntakeExceptions()` - Fetch in range
- `listCoachIntakeByBranch()` - Trainers + slots with cross-DB enrichment

## Gaps (P1/P2/P3)

### P1 - Waitlist Promotion Missing Notification (waitlist.service.ts:126) [status: partial | testable: true]
Promotion atomically creates appointment but NO notification sent. Customer uninformed.
Persistence: { table: waitlist_entries, where: status=promoted, expect: notification_sent }

### P1 - Credit Points No Consumption (customer-profiles.ts:55) [status: missing | testable: false]
creditPoints field exists, no endpoints to spend/deduct. Dead accumulation.
Persistence: No ledger table; no audit trail

### P1 - Promo Applicability Ignored (promotions.service.ts:78) [status: partial | testable: true]
validatePromoCode() ignores applicableProductIds/applicableServiceIds. Scope bypass.
Persistence: { table: promotions, where: applicableProductIds IS NOT NULL, expect: enforced }

### P2 - Promo Usage Race (promotions.service.ts:123) [status: partial | testable: true]
validatePromoCode() lock released; applyPromotion() re-checks isActive but NOT usageCount. Oversold.
Persistence: { table: promotions, expect: usageCount <= usageLimit }

### P2 - Waitlist Position Not Recomputed (waitlist.service.ts:106) [status: partial | testable: true]
removeFromWaitlist() doesn't recompute positions. Sparse gaps.
Persistence: { table: waitlist_entries, expect: position contiguous 1,2,3 }

### P2 - No Promo Deactivation Reason (promotions.service.ts:314) [status: implemented | testable: true]
Soft-delete only, audit logs reason but no restore endpoint.
Persistence: { table: audit_logs, where: action=promotion.deactivate, expect: entry }

### P2 - Profile Concurrent Upsert Race (customer-profile.service.ts:53) [status: partial | testable: false]
Upsert NOT transactional; concurrent calls race. Last write wins.
Persistence: { table: customer_profiles, expect: updated_at accurate }

### P2 - Promo Branch Scope Not Validated (promotions.service.ts:78) [status: partial | testable: false]
validatePromoCode() ignores branch scope validation. Applies everywhere.
Persistence: { table: promotion_usages, expect: branchId matches promo or org-wide }

### P2 - Preferred Times No Package Sync (preferred-time.service.ts:51) [status: missing | testable: false]
No validation vs trainer availability. Wasted setup.

### P2 - Coach Intake No Trainer Calendar Merge (coach-intake.service.ts:136) [status: missing | testable: false]
computeOpenIntakeSlots() ignores trainer calendar. Double-books possible.

### P3 - Walk-In Conversion No Owner Check (walk-in.service.ts:54) [status: partial | testable: true]
Doesn't validate package_instance.client_id. Cross-customer transfer possible.
Persistence: { table: payments, where: converted_from_payment_id IS NOT NULL, expect: customer match }

### P3 - No Credit Point Audit Trail (customer-profile.service.ts) [status: missing | testable: false]
creditPoints upsert unaudit ed. Untraced adjustments.

### P3 - Waitlist Capacity Not Atomic (waitlist.service.ts:45) [status: partial | testable: true]
addToWaitlist() checks stale slot.isFull. Over-capacity possible.
Persistence: { table: class_slots, expect: spotsAvailable >= 0 always }

---

## Summary
Endpoints: 26 | Testable: 18 | Partial: 6 | Missing: 4
P1 Critical: 3 | P2 High: 6 | P3 Medium: 3
