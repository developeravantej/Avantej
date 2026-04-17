# Backlog Appendix -- Codebase Health Remediation

Items below are **not** scheduled in any active phase. They are catalogued here for future sprint planning, sorted by category then severity.

---

## Schema & Orphaned Tables

- [MEDIUM] `dashboard_snapshots` table unused -- analytics computed live, not from snapshots
- [MEDIUM] `organization_analytics` (control panel) table unused -- no admin dashboard
- [MEDIUM] `payment_items` table unused -- depends on payments table implementation
- [MEDIUM] `member_category_buffer_overrides` table unused -- buffer-time.service.ts skips category-level
- [MEDIUM] `service_members` has no service file -- DB ops inline in router (`packages/api/src/routers/service-members.ts`)
- [MEDIUM] `payouts` has no service file -- DB ops inline in router
- [MEDIUM] `notifications` service is read-only -- no `createNotification()` function exists
- [MEDIUM] `user_activity_log` service is read-only -- no `createActivityLogEntry()` exists
- [MEDIUM] `notification_preferences` has no frontend settings page
- [MEDIUM] `rooms` -- full backend but no management page; roomId not sent from appointment modal
- [LOW] `preferred_times` -- full backend but no frontend UI
- [LOW] `waitlist_entries` -- full backend but no frontend UI

## Orphaned Fields

- [MEDIUM] `appointments.paymentStatus` -- written but never displayed in any view
- [MEDIUM] `appointments.stripePaymentIntentId` -- Stripe payment integration unimplemented
- [MEDIUM] `organizations.stripeConnectAccountId` and 3 related fields -- Stripe Connect unimplemented
- [MEDIUM] `services.stripeProductId/stripePriceId/stripeSyncStatus/stripeLastSyncedAt` -- 4 Stripe fields unused
- [LOW] appointments recurring fields (`isRecurring`, `recurringParentId`, `recurringFrequency`, `recurringEndDate`) -- implement or remove
- [LOW] appointments conflict resolution fields (`conflictResolved`, `conflictReason`) -- unimplemented
- [LOW] `appointments.googleCalendarEventId` -- superseded by mapping table, can be removed
- [LOW] `notifications.icon` and `notifications.color` -- unused until createNotification exists
- [LOW] `user_activity_log.creditsChange` and `icon` -- unused until createActivityLogEntry exists
- [LOW] `customer_profiles.isDeleted/deletedAt/deletedSource` -- GHL sync fields, unused
- [LOW] `user.lastLoginAt` -- only written by GHL service, never displayed
- [LOW] `services.priceUnit` -- written but never displayed in frontend
- [LOW] `appointments.sessionTotal/pricePerClient` -- written but not displayed in web frontend
- [LOW] `appointments.bookingNumber` -- not shown in web frontend

## Missing Constraints

- [MEDIUM] Service category name not unique per branch (DB level) -- app-layer enforcement missing too
- [MEDIUM] Room name not unique per branch
- [MEDIUM] Tax rate `isDefault` -- enforced only in service layer, needs partial unique index
- [LOW] Announcement `branchId` uses `onDelete CASCADE` -- inconsistent with other entities (restrict/set null)
- [LOW] Payment `platformFeePercentage` -- no CHECK constraint (accepts 200%)
- [LOW] Members `status` is free-text -- not constrained to enum
- [LOW] Product `barcode` -- no unique constraint (partial unique where NOT NULL)

## Stubs & Incomplete Features

- [HIGH] Stripe integration entirely stubbed -- `getStripe()` returns null, SDK not installed
- [HIGH] Stripe webhook handlers have no DB updates (3 events)
- [HIGH] Admin impersonation not integrated with Better-Auth
- [MEDIUM] Onboarding org creation faked with setTimeout (KNOWN)
- [MEDIUM] Org delete does not clean up Neon project
- [MEDIUM] Add Appointment modal has placeholder credit values
- [MEDIUM] Branch form uses placeholder instead of oRPC
- [MEDIUM] Branch form has hardcoded `organizationId` fallback
- [MEDIUM] Branch View needs user details from control panel for PIC names
- [MEDIUM] Branch/Role columns use placeholder types instead of API types
- [MEDIUM] Admin audit log system not implemented
- [MEDIUM] Permissions lib has unimplemented Better-Auth integration (`apps/web/src/lib/permissions.ts`)
- [MEDIUM] Hardcoded "MYR" strings in 6+ frontend locations -- need org-level currency config
- [MEDIUM] Package validity defaults to 365 days -- should come from package config
- [MEDIUM] Permission priority threshold hardcoded at 100 -- define as named constant
- [LOW] Cookie module has Better-Auth adaptation TODO
- [LOW] Auth types need Better-Auth adaptation
- [LOW] `useAuth` hook needs permission integration
- [LOW] Native app placeholder avatar URL (`via.placeholder.com`)
- [LOW] Native oRPC client logs errors to console

## Dead API Procedures (No Frontend Consumer)

- [MEDIUM] `promotions.validate`, `apply` -- checkout integration missing
- [MEDIUM] `products.getStock`, `adjustStock` -- inventory management incomplete
- [MEDIUM] `salesOrders.create/update/cancel` -- POS/checkout flow incomplete
- [MEDIUM] `invoices.create/update/getById` -- auto-generation TBD
- [MEDIUM] `organizationSettings.get/upsert` -- no settings page
- [LOW] `hierarchy.getNode`, `getDescendants`, `bulkReassignMembers`
- [LOW] `members.getById`, `remove`
- [LOW] `invitations.decline`
- [LOW] `classSlots.getById`, `bookingCounts`
- [LOW] `trainerAvailability.delete`
- [LOW] `packageInstances.getById`
- [LOW] `cancelledSales.getById`
- [LOW] `walkInCustomers.getById`
- [LOW] `taxRates.getById`
- [LOW] `userActivityLog.list` -- no activity log page
- [LOW] `commissionSplits` (all) -- no frontend consumers
- [LOW] `waitlist` (all) -- no frontend consumers
- [LOW] `admin` (all 8 procedures) -- admin panel not built
- [LOW] `rooms` CRUD (except list) -- no management page

## Type Safety

- [HIGH] Hierarchy router: 20+ `as any` casts -- schema-type mismatch for address/picUserId
- [HIGH] Installments view: 15 `as any` casts -- type inference broken for installments router
- [HIGH] Branch View: 8+ `as any` casts
- [MEDIUM] Access control pages: `as any` for member data
- [MEDIUM] Installment service: `(err as any).code` pattern -- needs typed error class
- [MEDIUM] Transaction objects cast `as unknown as NeonDatabase` -- needs TenantTransaction type
- [MEDIUM] Stripe type aliased to `any` (`apps/web/src/lib/stripe.ts:8`)

## RBAC

- [KNOWN] `classSlots.list` requires `class_slot_management` permission -- blocks customer booking
- [GAP] products/brands/suppliers list -- may be intentionally org-wide, needs documentation
