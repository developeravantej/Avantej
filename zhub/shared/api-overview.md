# API Overview

**Last updated:** 2026-05-27 *(Sprint 05-27 quality remediation + server-only router listing)*

All oRPC procedures available in the Avantej platform. Client: `client.routerName.procedureName(input)` from `@/utils/orpc`.

Auth levels: **public** = no session required, **protected** = session + tenant context required.

Total routers in `baseRouter`: 52 tenant-scoped routers (+ server-only routers merged at runtime in `appRouter`).

### Split-router module map (Plan D-S7)

Nine routers were split from monoliths into folders under `packages/api/src/routers/<name>/`. Each folder has `index.ts` (aggregator, ≤150 LOC) and `*.procedures.ts` modules (≤400 LOC). A thin re-export shim at `routers/<name>.ts` preserves `@avantej-core/api/routers/<name>` deep imports.

| Router | Modules |
|--------|---------|
| `members` | list, read, create, role, scope, status, archive, removal, sync |
| `hierarchy` | read, create, update, delete, move, members |
| `invitations` | create, public, manage |
| `refunds` | read, lifecycle, bulk |
| `services` | crud, pricing, analytics |
| `appointments` | list, crud, recurrence, series-cancel |
| `class-slots` | read, crud, enrollment |
| `commission-splits` | read, lifecycle, analytics, review |
| `package-instances` | client, create, lists, pending, assign, approve, bulk-reject, lifecycle, history |

**CI gates:** `bun run ci:check-router-file-loc`, `bun run ci:check-router-index-loc`. **Tooling:** `bun run codemod:split-router`, `bun run refine:*-imports`.

---

## New in this update

- **PR #32 / audit-prove commission (2026-05-27)** — commission engine + payouts hardening:
  - `payouts` gained per-row state-machine procedures: `markPaid` / `markFailed` / `retry` / `cancel` (each FOR-UPDATE-locked). `runBatch` gained optional `confirmImmediately` (defaults true; when false the payout lands at `pending` for non-cash methods). `runBatch.paymentMethod` enum extended with `"stripe_connect"`. Optional `branchId` input on `runBatch` / `processForRecipient` for batch-row anchoring.
  - `partnerStripe` (server-only) gained `refresh` (re-pulls capability state from Stripe) and `confirmViaStripe(payoutId)` (fires `stripe.transfers.create` with idempotency key `confirm-payout:<id>`). Phase A's `createOnboardingUrl` is admin-only via `commission_payout:create`.
  - `commissionSplits.createManualAdjustment` now accepts `packageInstanceId` and validates target XOR at the router (no more raw Postgres CHECK leak).
  - `commissionSplits.markPaidById` now plumbs `paymentReference` to the row + audit changes.
  - `categoryCommission.upsert` permission widened to `create` OR `update`.
  - New tenant migrations: 0077 (`commission_cycle_configs` — per-(branch | tenant) cap cycle policy) + 0078 (`partner_stripe_accounts` capability columns: `payouts_enabled`, `requirements_*`, `country_code`, `default_currency`, `connect_account_updated_at`).
- **Sprint 05-27 quality remediation** — type-erosion refactor in `payments.ts` (22 → 1 cast) and `customer-profiles.ts` (12 → 3 casts); 130+ new tests across unit / DB integration / real-Stripe / real-Resend / E2E layers; cross-tenant spoof now returns 403 FORBIDDEN at the middleware (previously fell through to a procedure-level 500)
- **Server-only router listing added** — see section below; previously these were only mentioned in passing
- **Plan D-S7** — split-router architecture (see table above); CI LOC gates; codemod/refine toolchain documented in `CLAUDE.md`
- **`members`** — catalogued: `newToday`, `restore`, `retryGhlSync`, `softDelete`, `updateScope` (were missing)
- **`hierarchy`** — added `listNodesWithStats`
- **`refunds`** — added `bulkApprove`, `createPartial`; CPR-08: `request` no longer accepts `customerId` (derived server-side from target)
- **`packageInstances`** — added `bulkAssign`, `bulkApprove`, `bulkReject`, `cancel`, `extend`, `freeze`, `listAssignedToMe`, `unfreeze`
- **`commissionSplits`** — added `listLedger`, `markPaidById`, `voidById`, `liabilityByStaff`, `listPendingReview`, `resolveReview`
- **`services`** — added pricing/analytics procedures: `duplicate`, `resolvePrice`, `listPriceOverrides`, `setBranchPrice`, `revenueShareByCategory`, `avgSessionsSoldPerMonth`, `listWithTrainerTiers`

---

## Server-only routers

These live in `apps/server/src/routers/` (not `packages/api`) because they require server-only dependencies (Stripe SDK, Resend, Cloudflare Worker env). They're merged into `appRouter` at runtime and surface the same `client.routerName.procedureName(...)` interface on the web.

### payments
| Procedure | Auth | Description |
|-----------|------|-------------|
| `createPaymentIntent` | protected | Stripe Direct Charge PI for an appointment on the tenant's Connect account |
| `sendPaymentLink` | protected | Stripe Payment Link for staff to forward to a customer; idempotent unless `regenerate: true` |
| `getPaymentStatus` | protected | Return payment fields from the appointment row (synced from webhooks) |
| `refund` | protected | Stripe refund against the appointment's PaymentIntent on the snapshot acct |
| `createSetupIntent` | protected | Stripe SetupIntent for saving a card on file (off_session) |
| `listSavedCards` | protected | List the customer's saved cards on their snapshot Connect acct |
| `chargeSavedCard` | protected | Off-session charge with optional appointment binding |
| `createSalesOrderPaymentLink` | protected | Payment Link for a POS sale; idempotent unless `regenerate: true` |
| `purchasePackage` | protected | Package purchase with Payment Link; creates package_instance |

### customer-profiles (server-only procedures — separate from packages/api one)
| Procedure | Auth | Description |
|-----------|------|-------------|
| `addEmailAndDispatchMagicLink` | protected | Replace placeholder email + send Better-Auth magic link |
| `resendMagicLink` | protected | Re-send magic link for a user with a real email |
| `createUnclaimed` | protected | Quick Add: create CP user + tenant member + customer_profile in one call. Idempotent on phone collision (CU-006) |
| `sendClaimLink` | protected | Swap unclaimed profile's placeholder email + dispatch magic link |

### partner-stripe
Partner-level Stripe Connect onboarding + payout origination (S-partner-stripe-onboarding, PR #32). Uses Standard accounts via OAuth per ADR-0001 v2 (MY platforms restricted from Express/Custom). State signed with `BETTER_AUTH_SECRET` HMAC; 5-part format `orgId.partnerId.country.ts.sig` rejects the org-level 3- and 4-part legacy formats (cross-flow replay protection). OAuth callback lives at `/api/stripe/connect/partner/callback` (Hono route, not oRPC). Webhook handlers in `apps/server/src/services/partner-stripe-webhooks.service.ts` consume `account.updated` (partner branch via `metadata.partnerId`) and `transfer.{created,reversed}`.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `createOnboardingUrl` | protected | Build Stripe Connect OAuth authorize URL for a partner; signs CSRF state; verifies partner is an active member of the tenant before signing |
| `getStatus` | protected | Read cached `partner_stripe_accounts` row — deterministic shape (always-present fields) regardless of whether the row exists |
| `refresh` | protected | Re-pull capability state from Stripe and persist it (`accounts.retrieve` → derive `pending | active | restricted | rejected`) |
| `confirmViaStripe` | protected | Fire `stripe.transfers.create` for a pending payout. Guards: status=pending + method=stripe_connect + partner has Connect account + `payouts_enabled=true`. Idempotency key `confirm-payout:<payoutId>`. Maps service errors → oRPC codes (NOT_FOUND / BAD_REQUEST / BAD_GATEWAY) |

### auth
| Procedure | Auth | Description |
|-----------|------|-------------|
| `userContext` | protected | Current user's orgs + roles + permissions (called on every page load) |

### admin (server-only impersonation)
| Procedure | Auth | Description |
|-----------|------|-------------|
| `impersonateUser` | protected | Platform admin starts impersonation (super_admin / support only) |
| `stopImpersonating` | protected | End active impersonation session |

### subscriptions (Stripe SaaS subscriptions for tenant billing)
| Procedure | Auth | Description |
|-----------|------|-------------|
| `checkout` | protected | Create Stripe Checkout Session for SaaS subscription |
| `manage` | protected | Stripe Billing Portal session for self-serve billing changes |

---

## admin
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getImpersonationStatus` | protected | Return current impersonation session status |
| `impersonateUser` | protected | Start impersonating a user (super_admin / support only) |
| `me` | protected | Return platform admin status for current caller |
| `stopImpersonating` | protected | End active impersonation session |

## analytics
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getDashboardKpis` | protected | Returns KPI metrics for dashboard home |
| `getStaffPerformance` | protected | Staff performance summary for date range |

## announcements
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new announcement; accepts optional `scopedBranchIds` array |
| `delete` | protected | Delete announcement by id |
| `list` | protected | List announcements; accepts `isAdmin` param to include all org announcements |
| `listActive` | protected | List active announcements visible to user |
| `update` | protected | Update announcement details; accepts optional `scopedBranchIds` array |

## appointments
| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancelFuture` | protected | Cancel all future occurrences of a recurring series from a given date |
| `cancelSeries` | protected | Cancel all occurrences of a recurring appointment series |
| `create` | protected | Create new appointment (staff); accepts recurrence rule input |
| `getById` | protected | Get appointment details (staff or client owner) |
| `list` | protected | List appointments by branch/date; returns virtual occurrences via listAppointmentsWithRecurrence |
| `listForUser` | protected | List appointments for current user (client view) |
| `materializeOccurrence` | protected | Persist a virtual recurrence occurrence as a concrete row |
| `splitSeries` | protected | Split a recurring series at a given date, materializing the target occurrence |
| `update` | protected | Update appointment status/details |

## audit-logs
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List audit logs with optional entity/action filters |

## auth
| Procedure | Auth | Description |
|-----------|------|-------------|
| `login` | public | Authenticate user and return access tokens |
| `userContext` | protected | Get current user context with organizations and hierarchy |
| `verifyEmail` | public | Verify user email with token |

## brands
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new brand |
| `delete` | protected | Delete brand by id |
| `getById` | protected | Get brand details by id |
| `list` | protected | List brands with optional search |
| `update` | protected | Update brand details |

## cancelled-sales
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getById` | protected | Get cancelled sale details |
| `list` | protected | List cancelled sales with optional filters |

## category-buffer-overrides
| Procedure | Auth | Description |
|-----------|------|-------------|
| `listForMember` | protected | List category buffer overrides for a specific member (requires user_management or service_management read) |
| `listMine` | protected | List category buffer overrides for the calling member (no permission gate) |
| `updateMine` | protected | Set/clear calling member's category buffer override; validates member has services in category |
| `upsert` | protected | Set/clear category buffer override for a specific member (requires user_management or service_management update) |

## category-commission
PR #32: `upsert` permission widened to `category_commission_management:create` OR `:update` (was `create`-only). `getByCategory` now accepts optional `includeInactive` (defaults true so the admin form continues to see deactivated configs to re-enable). The DELETE+INSERT in `upsertCategoryCommissionConfig` now reads the prior `isActive` and preserves it across the re-insert (no more silent re-activation on edit). Per-cycle commission caps (`maxPerCycleCents`) are no longer bound to UTC calendar-month — `applyCommissionCaps` resolves the window via `commission_cycle_configs` (migration 0077): per-(branch | tenant) policy with types `calendar_month | monthly_anchored | semi_monthly | weekly`.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `delete` | protected | Delete commission config for category |
| `getByCategory` | protected | Get commission config for a product category; optional `includeInactive` (default true) |
| `upsert` | protected | Create/update commission config with slots and conditional rates; accepts `create` OR `update` permission |

## check-ins
| Procedure | Auth | Description |
|-----------|------|-------------|
| `deleteCheckIn` | protected | Delete check-in record (reverts credits) |
| `getActivePackageForMember` | protected | Get earliest-expiring active package for member |
| `list` | protected | List check-ins with optional filters |
| `listTodaysBookings` | protected | List today's bookings annotated with check-in status |
| `recordBulkCheckIn` | protected | Record check-ins for multiple bookings |
| `recordCheckIn` | protected | Record check-in for member or walk-in |

## class-slots
| Procedure | Auth | Description |
|-----------|------|-------------|
| `bookingCounts` | protected | Get booking count summary for date range |
| `cancel` | protected | Cancel a class slot |
| `create` | protected | Create new class slot |
| `getById` | protected | Get class slot details |
| `getSignups` | protected | Get attendee list for class slot |
| `list` | protected | List class slots with optional filters |
| `update` | protected | Update class slot details |

## commission-splits
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Bulk approve pending commission splits |
| `createManualAdjustment` | protected | Create manual commission bonus/clawback |
| `getByAppointment` | protected | Get commission splits for an appointment |
| `getMyCommissions` | protected | Get commissions for current staff member |
| `liabilityByStaff` | protected | Commission liability grouped by staff member |
| `liabilitySummary` | protected | Aggregate commission liability for date range |
| `list` | protected | List commission splits |
| `listLedger` | protected | Paginated commission ledger with filters |
| `listPendingReview` | protected | List splits awaiting review |
| `markPaid` | protected | Bulk mark approved splits as paid |
| `markPaidBatch` | protected | Batch mark approved splits as paid by member/date |
| `markPaidById` | protected | Mark a single split as paid by id |
| `resolveReview` | protected | Resolve a pending review item (approve/reject) |
| `void` | protected | Void a commission split with reason |
| `voidById` | protected | Void a single split by id with reason |

## customer-directory
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getById` | protected | Get full customer detail (for drawer view) |
| `list` | protected | List customers with aggregated metrics |

## customer-profiles
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get current user customer profile |
| `upsert` | protected | Update customer profile (self-scoped) |
| `upsertForCustomer` | protected | Update customer profile (admin-scoped by id) |

## expenses
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve expense submission |
| `create` | protected | Create expense submission |
| `getById` | protected | Get expense details |
| `list` | protected | List expenses with optional filters |
| `markPaid` | protected | Mark expense as paid |
| `reject` | protected | Reject expense with reason |

## goods-receipts
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create goods receipt |
| `disputeInvoice` | protected | Raise a dispute on a goods receipt invoice |
| `getById` | protected | Get goods receipt details |
| `getInvoicePreview` | protected | Get invoice preview for a goods receipt |
| `list` | protected | List goods receipts |
| `listInvoices` | protected | List invoices with optional purchaseOrderId filter and pagination |
| `markInvoicePaid` | protected | Mark a goods receipt invoice as paid |
| `update` | protected | Update goods receipt details |

## google-calendar
| Procedure | Auth | Description |
|-----------|------|-------------|
| `disconnect` | protected | Revoke Google Calendar connection |
| `status` | protected | Get Google Calendar connection status |

## hierarchy
| Procedure | Auth | Description |
|-----------|------|-------------|
| `bulkReassignMembers` | protected | Reassign multiple members to new hierarchy scope |
| `createNode` | protected | Create hierarchy node (country/region/area/branch) |
| `deleteNode` | protected | Delete hierarchy node |
| `getDescendants` | protected | Get descendant nodes for a hierarchy node |
| `getNode` | protected | Get hierarchy node details |
| `listAllMembers` | protected | List all members across entire organization |
| `listMembers` | protected | List members within hierarchy scope |
| `listNodes` | protected | List hierarchy nodes |
| `listNodesWithStats` | protected | List hierarchy nodes with member/service stats |
| `moveNode` | protected | Move node to different parent |
| `reassignMember` | protected | Reassign member to new hierarchy scope |
| `updateNode` | protected | Update hierarchy node details |

## installment-plans
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new installment plan |
| `deactivate` | protected | Deactivate installment plan |
| `getByCode` | protected | Get installment plan by code |
| `getById` | protected | Get installment plan by id |
| `list` | protected | List installment plans |
| `setDefault` | protected | Set default installment plan |
| `update` | protected | Update installment plan details |

## installments
| Procedure | Auth | Description |
|-----------|------|-------------|
| `adjustCredits` | protected | Adjust package credits for installment |
| `confirmPayment` | protected | Confirm installment payment received |
| `processRefund` | protected | Process refund for installment |

## invitations
| Procedure | Auth | Description |
|-----------|------|-------------|
| `accept` | public | Accept invitation by token |
| `create` | protected | Create new member invitation |
| `decline` | public | Decline invitation by token |
| `getByToken` | public | Get invitation details by token |
| `list` | protected | List pending invitations |
| `resend` | protected | Resend invitation email |
| `revoke` | protected | Revoke pending invitation |
| `verifyEmailByToken` | public | Verify email during signup |

## invoices
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new invoice |
| `getById` | protected | Get invoice details |
| `list` | protected | List invoices with optional filters |
| `paymentStatusHistory` | protected | Cursor-paginated payment status transition log for an invoice |
| `update` | protected | Update invoice details |

## member-profiles
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get member profile details |
| `upsert` | protected | Create/update member profile |

## members
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new organization member |
| `deactivate` | protected | Deactivate member account |
| `getById` | protected | Get member details by id |
| `list` | protected | List members with optional filters |
| `newToday` | protected | Count members created today (dashboard KPI) |
| `reactivate` | protected | Reactivate deactivated member |
| `remove` | protected | Remove member from organization |
| `restore` | protected | Restore soft-deleted member |
| `retryGhlSync` | protected | Manually retry GHL staff sync for a member |
| `softDelete` | protected | Soft-delete member (sets deletedAt) |
| `suspend` | protected | Suspend member account |
| `updateRole` | protected | Update member role |
| `updateScope` | protected | Update member hierarchy scope |

## notification-preferences
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get user notification preferences |
| `update` | protected | Update notification preference settings |

## notifications
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getUnreadCount` | protected | Get unread notification count |
| `list` | protected | List notifications with optional filters |
| `markAllRead` | protected | Mark all notifications as read |
| `markRead` | protected | Mark notification as read |

## organization-settings
| Procedure | Auth | Description |
|-----------|------|-------------|
| `get` | protected | Get organization settings |
| `upsert` | protected | Update organization settings |

## package-instance-staff
| Procedure | Auth | Description |
|-----------|------|-------------|
| `assign` | protected | Assign (or UPSERT) a staff member to a slot on a package instance (package_management:update) |
| `list` | protected | List all staff assignments for a package instance (package_management:read) |
| `remove` | protected | Remove a staff member from a package instance by staffId (package_management:update) |
| `replace` | protected | Atomically replace ALL staff assignments for a package instance (package_management:update) |

## package-instances
| Procedure | Auth | Description |
|-----------|------|-------------|
| `assignTrainer` | protected | Assign a trainer to a pending package, transitioning it to active (admin or trainer self-assign) |
| `bulkApprove` | protected | Bulk approve pending package instances |
| `bulkAssign` | protected | Bulk assign trainers to pending packages |
| `bulkReject` | protected | Bulk reject pending package instances |
| `cancel` | protected | Cancel an active package instance |
| `create` | protected | Create new package instance; approval gate: purchased packages start pending when org setting enabled |
| `extend` | protected | Extend package expiry date |
| `freeze` | protected | Freeze an active package instance |
| `getActiveForClient` | protected | Get active packages for client (session user; native app) |
| `getById` | protected | Get package instance details (enriched with assignedTrainerName, preferredTrainerName) |
| `listAll` | protected | List all package instances for org (service_management:read); returns clientName |
| `listAssignedToMe` | protected | List packages assigned to the current trainer |
| `listExpiring` | protected | List packages expiring soon (reports:read) |
| `listForClient` | protected | List packages for specific client (session user; native app) |
| `listMemberships` | protected | List membership packages with RBAC scope (service_management:read) |
| `listPending` | protected | List packages awaiting trainer assignment (admin or trainer; enriched with customerName, preferredTrainerName) |
| `reject` | protected | Reject a pending package — admin only; sets status cancelled and notifies customer |
| `statusHistory` | protected | Cursor-paginated status transition log (package_management:read) |
| `unfreeze` | protected | Unfreeze a frozen package instance |

## payouts
Per-row state machine added in PR #32 (S-payouts-state-machine). Lifecycle: `pending → paid` (via `markPaid` or `confirmViaStripe`), `pending|processing → failed` (`markFailed`), `failed → pending` (`retry`), `pending|failed → canceled` (`cancel`, also reverts linked splits to `approved`). Each transition acquires `SELECT … FOR UPDATE` on the payout row. `runBatch` gained `confirmImmediately?: boolean` (default true preserves legacy cash-flow semantics; `false` inserts at `pending` for non-cash methods so the operator settles via `markPaid` / `confirmViaStripe`). `paymentMethod` enum extended with `"stripe_connect"`.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List payouts to staff/suppliers; admin RBAC-bypasses, non-admins see rows where they're the recipient OR (appointment branch | batch branch) ∈ accessibleNodeIds (PR #32 F-15 refinement) |
| `previewBatch` | protected | Preview the approved splits that would be batched for given staff in a period (no writes) |
| `runBatch` | protected | Insert payout rows + flip splits; optional `confirmImmediately` (default true) + `branchId` (anchors `payout_batches`); supports `bank_transfer | cash | check | other | stripe_connect` |
| `processForRecipient` | protected | Thin wrapper over `runBatch` scoped to one recipient; defaults period to first-of-month → now |
| `recipientSummary` | protected | Lifetime payout stats for a recipient (`totalPaid` includes reversals; `avgPerCycle` excludes negative rows + groups by `batchId` when non-null) |
| `markPaid` | protected | `pending|processing → paid`. Operator-initiated when out-of-band settlement clears. `paymentReference` required. Flips linked `commission_splits` to paid |
| `markFailed` | protected | `pending|processing → failed`. Records reason in notes. Linked splits untouched so a `retry` keeps the existing payout linkage |
| `retry` | protected | `failed → pending`. Resets `paidAt`. No effect on linked splits |
| `cancel` | protected | `pending|failed → canceled`. Reverts linked commission_splits to `approved` and clears their `payoutId` (re-eligible for a future batch) |

## permissions
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List available permissions |

## pos
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getReceiptData` | protected | Get receipt data for printing |
| `recordSale` | protected | Record point-of-sale transaction |
| `searchCustomers` | protected | Search customers for POS transaction |

## preferred-times
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List preferred times for package instance |
| `upsert` | protected | Set preferred appointment times (up to 4 slots: dayOfWeek + time + priority) |

## product-categories
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create product category |
| `delete` | protected | Delete product category |
| `getById` | protected | Get product category details |
| `list` | protected | List product categories |
| `update` | protected | Update product category |

## products
| Procedure | Auth | Description |
|-----------|------|-------------|
| `adjustStock` | protected | Adjust product stock levels |
| `create` | protected | Create new product |
| `deleteBranchPrice` | protected | Delete a branch-specific price override for a product |
| `expireBranchPrice` | protected | Expire a branch-specific price override for a product |
| `getById` | protected | Get product details |
| `getStock` | protected | Get product stock level |
| `list` | protected | List products with optional filters |
| `update` | protected | Update product details |

## promotions
| Procedure | Auth | Description |
|-----------|------|-------------|
| `apply` | protected | Apply promotion code to order |
| `create` | protected | Create new promotion |
| `deactivate` | protected | Deactivate promotion |
| `list` | protected | List promotions |
| `update` | protected | Update promotion details |
| `validate` | protected | Validate promotion code |

## purchase-orders
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve pending purchase order |
| `cancel` | protected | Cancel purchase order |
| `create` | protected | Create new purchase order |
| `getById` | protected | Get purchase order details |
| `list` | protected | List purchase orders |
| `receiveItems` | protected | Mark PO items as received |

## refunds
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve refund request |
| `bulkApprove` | protected | Bulk approve multiple refund requests |
| `createPartial` | protected | Create partial refund against package instance session credits |
| `getById` | protected | Get refund details |
| `list` | protected | List refund requests |
| `process` | protected | Process approved refund |
| `reject` | protected | Reject refund request |
| `request` | protected | Request refund for sale order |

## registration
| Procedure | Auth | Description |
|-----------|------|-------------|
| `complete` | protected | Complete organization registration |
| `listBranches` | public | List organization branches for registration |
| `listCountries` | public | List countries for registration |

## role-permissions
| Procedure | Auth | Description |
|-----------|------|-------------|
| `add` | protected | Add permission to role |
| `list` | protected | List role permissions |
| `remove` | protected | Remove permission from role |

## roles
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new custom role |
| `delete` | protected | Delete custom role |
| `list` | protected | List available roles |
| `update` | protected | Update role details |

## rooms
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new room |
| `delete` | protected | Delete room |
| `getById` | protected | Get room details |
| `list` | protected | List rooms |
| `update` | protected | Update room details |

## sales-orders
| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancel` | protected | Cancel sales order |
| `create` | protected | Create new sales order |
| `getById` | protected | Get sales order details |
| `list` | protected | List sales orders |
| `statusHistory` | protected | Cursor-paginated status transition log for a sales order |
| `update` | protected | Update sales order details |

## service-categories
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create service category |
| `getById` | protected | Get service category details |
| `list` | protected | List service categories |
| `update` | protected | Update service category |

## service-category-config
| Procedure | Auth | Description |
|-----------|------|-------------|
| `getByCategoryId` | protected | Get service category booking config |
| `upsert` | protected | Update service category config (duration, capacity, booking rules) |

## service-members
| Procedure | Auth | Description |
|-----------|------|-------------|
| `assign` | protected | Assign member to service |
| `listForMember` | protected | List services for a specific member (admin view) |
| `listForService` | protected | List members assigned to a specific service |
| `listMine` | protected | List services for current member (self-scoped) |
| `remove` | protected | Remove member from service |
| `updateBuffer` | protected | Update service buffer time for a specific member (admin) |
| `updateMyBuffer` | protected | Update buffer time for own service assignment (self-scoped) |

## services
| Procedure | Auth | Description |
|-----------|------|-------------|
| `avgSessionsSoldPerMonth` | protected | Average sessions sold per month for analytics |
| `create` | protected | Create new service |
| `deleteBranchPrice` | protected | Delete a branch-specific price override for a service |
| `duplicate` | protected | Duplicate an existing service |
| `expireBranchPrice` | protected | Expire a branch-specific price override for a service |
| `getById` | protected | Get service details |
| `list` | protected | List services with optional filters |
| `listPriceOverrides` | protected | List branch price overrides for a service |
| `listWithTrainerTiers` | protected | List services with trainer tier assignments |
| `resolvePrice` | protected | Resolve effective price for service/branch/customer type |
| `revenueShareByCategory` | protected | Revenue share breakdown by service category |
| `setBranchPrice` | protected | Set branch-specific price override |
| `update` | protected | Update service details |

## stock-requests
| Procedure | Auth | Description |
|-----------|------|-------------|
| `approve` | protected | Approve stock transfer request |
| `create` | protected | Create stock transfer request |
| `fulfill` | protected | Complete stock transfer |
| `getById` | protected | Get stock request details |
| `list` | protected | List stock requests |
| `reject` | protected | Reject stock request |

## suppliers
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create new supplier |
| `deactivate` | protected | Deactivate supplier |
| `getById` | protected | Get supplier details |
| `list` | protected | List suppliers |
| `update` | protected | Update supplier details |

## tax-rates
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create tax rate |
| `deactivate` | protected | Deactivate tax rate |
| `getById` | protected | Get tax rate details |
| `getDefault` | protected | Get default tax rate |
| `list` | protected | List tax rates |
| `setDefault` | protected | Set default tax rate |
| `update` | protected | Update tax rate details |

## tenant-admin
| Procedure | Auth | Description |
|-----------|------|-------------|
| `impersonateMember` | protected | Impersonate staff member in own organization |
| `stopImpersonating` | protected | End tenant-admin impersonation session |

## trainer-availability
| Procedure | Auth | Description |
|-----------|------|-------------|
| `delete` | protected | Delete trainer availability slot |
| `list` | protected | List trainer availability |
| `upsert` | protected | Set trainer availability schedule |

## trainer-tiers
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create trainer tier |
| `delete` | protected | Delete trainer tier |
| `list` | protected | List trainer tiers |
| `update` | protected | Update trainer tier |

## transfer-orders
| Procedure | Auth | Description |
|-----------|------|-------------|
| `cancel` | protected | Cancel transfer order |
| `complete` | protected | Complete transfer order |
| `create` | protected | Create inventory transfer order |
| `getById` | protected | Get transfer order details |
| `list` | protected | List transfer orders |
| `markInTransit` | protected | Mark transfer as in transit |

## units-of-measure
| Procedure | Auth | Description |
|-----------|------|-------------|
| `create` | protected | Create unit of measure |
| `delete` | protected | Delete unit of measure |
| `getById` | protected | Get unit of measure details |
| `list` | protected | List units of measure |
| `update` | protected | Update unit of measure |

## user-activity-log
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List user activity with optional activity type filter |

## walk-in-customers
| Procedure | Auth | Description |
|-----------|------|-------------|
| `list` | protected | List walk-in customers |
