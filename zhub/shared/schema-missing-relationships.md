# Schema — Missing Relationships Audit

Domain-expert audit identifying relationships that **should exist but don't**. Severity scale: **critical** (blocks correct behavior), **should-have** (gap with workaround), **nice-to-have** (polish).

Generated 2026-05-06. Source: 8 domain audits + cross-domain + senior critique + fresh-eyes + operator + DB engineer + red-team.

---

## TL;DR — Do This Order

### Phase 0 — Migration infrastructure (BLOCKS everything else)
- Replace embedded tenant migration runner (`MIGRATION_0007_SHORT_KORATH` string in `migrate-tenant.ts`) w/ file-based loader
- Add per-branch `tenant_migrations` table; gate new-branch provisioning on latest version
- Without this, all 95+ fixes ship 1 hand-embedded string × N Neon branches each = operational bomb

### Phase 1 — Drift fixes (cheap, fix actual prod inconsistency first)
- **D1**: `appointment_clients.walk_in_customer_id` schema RESTRICT vs live NO ACTION
- **D2**: `package_instances.preferred_trainer_id` schema FK declared, live missing
- **D3**: `ghl_branch_links` rename to `ghl_location_links` (CP)

### Phase 2 — P0 within-domain critical (after red-team filter)
1. **Trainer/room EXCLUDE constraint** (use raw SQL, `NOT VALID` + `VALIDATE`, partial w/ status filter)
2. `members.role` add NULLABLE `roleId` ALONGSIDE text col (NEVER replace — fast-path RBAC load-bearing)
3. `payout_batches` parent table (period grouping for reconciliation)
4. `commission_configs` versioning (disputed splits reproducible)
5. `commission_splits.package_instance_id` link (extend CHECK w/ NOT VALID)
6. Branch-scoped pricing (`service_prices`, `product_prices`)
7. Tax-rate per line (`sales_order_items.tax_rate_id`, `payment_items.tax_rate_id`)
8. Stock movement audit log (RANGE-partitioned by month)
9. Per-entity `_status_history` for sales_orders, payments, package_instances, appointments (NOT generic polymorphic)

### Phase 3 — Operator priority (weekly fires)
10. Member freeze/pause/hold table
11. Lead source attribution
12. Comp / friends-and-family tracking
13. Commission cap/floor/exclusion fields
14. Refund line items (partial-package refund)
15. Household / family linking

### Deferred / Rejected (Red-team filter)
- `partner_stripe_accounts` FK upgrade (PG limitation per Phase 2S decision)
- `notifications.userId` discriminator (no current polymorphism)
- `audit_logs.actorMemberId` FK (documented denorm-for-speed)
- `dashboard_snapshots` FK + unique (app-side enforced)
- `subscriptions.payerUserId` FK Critical (Stripe is system of record)
- Cross-domain X3 universal hierarchyNodeId via TRIGGER (use set-on-insert immutable)
- Identity #1 `roleId NOT NULL` replacement (additive only)
- Generic `entity_status_history` polymorphic (per-entity instead)
- `appointment_staff.staff_id` FK (cross-DB convention)
- Engagement #3 announcements multi-branch (already nullable = org-wide)
- All "audit fields on every table" sweeps (engineer pain, not operator pain)

### Migration ordering rules (apply per fix)
- All new FKs: nullable + `NOT VALID` CHECK + batched backfill + `VALIDATE`
- All text→uuid migrations: new col + backfill + swap + drop (no `ALTER TYPE`)
- Every new FK ships w/ supporting composite index
- Drizzle `relations()` updates batched per migration
- Test fixtures (`apps/server/src/tests/helpers/fixtures.ts`) updated alongside

**True actionable count after filter**: ~30-35 items (not 150).

---

## Unresolved contradictions (resolve before triage)

| # | Item | Resolution |
|---|---|---|
| C1 | `members.role` FK severity | **Additive nullable `roleId` only** — DON'T replace text col. Fast-path `role === "admin"` load-bearing |
| C2 | `payment_items.promotion_id` | Add real FK via raw migration (LHDN audit needs it). Service-layer enforcement = nice but FK is cheap insurance |
| C3 | X1 customer entity vs M7 staff/customer separation | `customers` parent w/ `type` discriminator; CHECK constraint enforces type='customer' for customer_profile FKs |
| C4 | X5 generic vs M6 polymorphic anti-pattern | **Per-entity `_status_history` tables** (sales_orders, payments, package_instances). Share Drizzle helper for shape |
| C5 | partner_stripe per-hierarchy direction | Belongs on `legal_entities` (new) → hierarchy_nodes FK; not on partner_stripe_accounts |
| C6 | notifications.userId discriminator | **DROP claim** — no current polymorphism; revisit if customers ever notified |
| C7 | audit_logs.actorMemberId FK | **DROP claim** — documented denorm-for-speed |
| C8 | dashboard_snapshots FK + unique | **Defensive only** — defer; revisit if app upserts ever fail |
| C9 | X3 universal hierarchyNodeId | **Set-on-insert immutable denorm** (not trigger). Drop "security hole" framing — it's perf optimization |
| C10 | subscriptions payer FK Critical | Downgrade to should-have. Stripe is system of record; `organizations.subscriptionId` is canonical inverse |

---

## Genuinely new gaps (caught in final pass)

- **No `@design-decision` registry**: comments like "denormalized for speed" repeatedly re-litigated. Promote to structured registry so reviewers stop proposing fixes for intentional choices
- **No backfill cost estimates** on any proposal: X3 denorm × 44 tables, `promotion_usages` text→uuid, `members.role` — prioritization w/o row counts + downtime = noise
- **`organizationMembers` cache contract unspecified**: MEMORY.md says cache, doc never asks staleness SLA / sync semantics. Cross-DB FK debate downstream of this
- **Drizzle `relations()` blast radius**: 95 FKs = 95 relations() edits across `packages/db`, never budgeted
- **Test fixture breakage**: `apps/server/src/tests/helpers/fixtures.ts` hardcodes shapes; every FK addition breaks fixtures. Update alongside each migration
- **`isActive` → `deletedAt` migration silently breaks call sites**: every `WHERE isActive = true` filter needs audit before flip
- **No row-count baseline**: w/o knowing current size of each table, can't estimate migration window or partitioning urgency

---

---

## Identity & Hierarchy

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | `members.role` (text) → `roles.id` | **critical** | Roles table exists with priority + custom roles; `members.role` is free-text. Custom roles never assignable. | `roleId uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT` |
| 2 | `invitations.role` (text) → `roles.id` | **critical** | Same disconnect — accepting invite with custom role impossible | `roleId uuid NOT NULL REFERENCES roles(id)` |
| 3 | Member ↔ Role multi-assignment | should-have | Franchise staff often hold dual roles (trainer + manager) | `member_roles(member_id, role_id, hierarchy_scope_id)` |
| 4 | `members.invitationId` audit link | should-have | No FK linking accepted invitation to created member; lost audit trail | `members.invitationId uuid REFERENCES invitations(id)` |
| 5 | `members` audit fields (`createdBy`/`updatedBy`/`updatedAt`) | should-have | Only `joinedAt` exists; no record of role/status transitions | Add cols + `member_audit_log` table |
| 6 | `organization_settings` per-hierarchy-node scope | should-have | Settings global per tenant; multi-branch needs branch overrides (hours, tax, branding) | `hierarchyNodeId uuid REFERENCES hierarchy_nodes(id) CASCADE` |
| 7 | `hierarchy_nodes.picUserId` → `members.id` | should-have | PIC stored as control-panel userId; no integrity check that PIC is a tenant member | Add `picMemberId uuid REFERENCES members(id) SET NULL` |
| 8 | Role scope-depth integrity | should-have | "branch_manager" role assignable at organization scope w/o constraint | `roles.allowedScopeDepths int[]` + check |
| 9 | `role_permissions.scope` enum | nice-to-have | Free-text "organization/team/own/branch"; typos break RBAC silently | pgEnum `role_permission_scope` |
| 10 | `roles`/`permissions`/`trainer_tiers` audit fields | nice-to-have | High-impact tables w/o createdBy/updatedBy | Add cols |

---

## Services & Catalog

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | `rooms` ↔ `services` compatibility | **High** | `rooms.type` free text; cannot enforce "yoga service in yoga room" | Junction `service_rooms` OR `service_categories.allowedRoomTypes[]` |
| 2 | `service_members.role` (lead/assistant/substitute) | **High** | Only `isPrimary` bool; cannot model multi-trainer + commission-split per role | `role text` + `displayOrder int` |
| 3 | Product variants (size/color/flavor) | **High** | Flat SKU; protein "Choc 1kg" vs "Vanilla 2kg" = separate rows, broken reporting | Self-ref `parent_product_id` + `variant_attributes jsonb` |
| 4 | Product bundles / kits | **High** | Cannot express "Starter Kit = shaker + protein + tee"; inventory can't decrement components | New `product_bundle_items` |
| 5 | Service-included consumables | Medium | Stock can't auto-decrement on appointment completion | New `service_consumables(service_id, product_id, qty_per_session)` |
| 6 | Branch-scoped price tiers | **High** | `services.price` and `products.price` single int; multi-branch can't price KL ≠ Penang | New `service_prices` and `product_prices` |
| 7 | `brands.supplierId` | Medium | Brand usually distributed by one supplier; today every product re-enters supplierId | `brands.default_supplier_id` FK |
| 8 | `suppliers` ↔ `product_categories` | Low | PO forms need to filter eligible products | Junction `supplier_categories` |
| 9 | `service_categories.allowedRoomIds[]` | Medium | Same as #1 at category level | Junction or array |
| 10 | Catalog audit fields (services/categories/products/brands/rooms) | **High** | Other tables carry createdBy; catalog edits unattributed → no compliance trail for SKU/price changes | `created_by`, `updated_by` text |
| 11 | `product_categories` parent/child hierarchy | Medium | Flat list; "Supplements > Protein > Whey" impossible | Self-ref `parent_id` |
| 12 | `product_categories.branchId` | Low | service_categories per-branch; product_categories global = inconsistent | Add `branch_id` |
| 13 | `product_stock` reservation/lot tracking | Medium | No `reserved_qty`; no batch/lot/expiry — needed for supplements | New `product_stock_lots` |
| 14 | Multi-image gallery | Low | Single `imageUrl` per service/product | `service_media`, `product_media` |
| 15 | `brands.isActive` / `product_categories.isActive` | Low | Cannot soft-deactivate without nulling FKs | Add `isActive bool` |

---

## Appointments & Scheduling

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | `appointments.cancellation_reason` lookup | Medium | Free text breaks no-show/cancel reporting + commission policy enforcement | New `cancellation_reasons` table + FK on appointments/class_slots |
| 2 | `waitlist_entries.userId` polymorphic client | **High** | `userId text` no FK; can't tell if member/customer_profile/walk-in. Orphan-prone, breaks notifications | Mirror check_ins pattern: `client_type` + `client_id`, OR split FKs |
| 3 | Appointment status history / audit | **High** | Status transitions (pending→confirmed→completed/cancelled) drive commission/refund/disputes; overwritten in place w/ no who/when | New `appointment_status_history` |
| 4 | `check_ins.packageInstanceId` no FK | **High** | Plain uuid; drift risk; credit-consumption reports reference deleted packages | Add FK SET NULL |
| 5 | `recurrence_rules` exception/skip dates | Medium | Skipping single occurrence requires materialize-then-cancel; can't pre-skip future | New `recurrence_exceptions` |
| 6 | `preferred_times` only on package_instances | Medium | Walk-ins/lead intakes/non-package customers can't express scheduling preference | Polymorphic via customer_profile_id |
| 7 | Trainer/room conflict prevention | **High** | Two overlapping appointments same trainer/room allowed; only `conflictResolved` flag (advisory) | Postgres EXCLUDE constraint w/ tstzrange |
| 8 | class_slots instructor vs trainer_availability | Medium | Instructor assignable outside availability windows; no DB guard | Trigger or include in EXCLUDE constraint |
| 9 | `appointment_staff.staff_id` real FK | Medium | text → members.userId by comment; joins to commission_splits drift-prone | Store members.id uuid w/ FK |
| 10 | `coach_intake_exceptions` → replacement appointment | Low | Exception independent of any reschedule it caused; no audit | Optional `replacement_appointment_id` |

---

## Sales & Payments

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | `sales_order_items.tax_rate_id` → tax_rates | **High** | Tax rates time-bounded; without per-line capture, historical orders unreproducible if rate edited. LHDN MyInvois compliance | Nullable FK RESTRICT |
| 2 | `payment_items.tax_rate_id` → tax_rates | **High** | `itemType="tax"` exists but no link to which rate produced it | Nullable FK RESTRICT |
| 3 | `payment_items.promotion_id` real FK | Medium | Comment cites circular import — but promotions doesn't import payment_items. No real risk; orphans possible | Real FK via migration |
| 4 | `promotion_usages.sales_order_id` (currently text) → uuid FK | **High** | text "for flexibility" but order id has no flexibility excuse; dangling refs on order delete; breaks JOINs | Change to uuid + FK |
| 5 | `promotions` ↔ services/products applicability | Medium | `applicableProductIds`/`applicableServiceIds` jsonb arrays; no FK; stale on delete; can't query "promos for service X" | Junctions `promotion_services`, `promotion_products` |
| 6 | `installment_plans` ↔ package_instances FK | Medium | `paymentPlanType` plain text code; renames silently break | `installment_plan_id uuid REFERENCES installment_plans(id)` |
| 7 | `customer_profiles` ↔ walk_in_customers conversion | Medium | When walk-in registers, no link → loses purchase/appointment history | One-way `customer_profile_id` on walk_in_customers |
| 8 | `payments.invoice_id` → invoices | Medium | Today only invoices→sales_orders; multi-payment invoices (deposits/installments) inferred via order | Nullable invoice_id FK |
| 9 | `installment_events.payment_id` → payments | Medium | Events only link to installment_id; reconciliation joins indirect | Nullable payment_id FK |
| 10 | Refund line items | Medium | refunds header-only; partial refunds against multi-item orders / credit packages lose granularity | New `refund_items` |
| 11 | walk_in_customers uniqueness on phone/email | Low | Same person registered twice splits histories | Partial unique index |

---

## Commission & Payouts

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | `commission_splits` ↔ `package_instances` | **High** | Splits target only appointmentId OR salesOrderId (CHECK). Commissions on package sale/redemption — sales-order captures initial sale but not per-redemption coach attribution; `package_instance_staff` never linked to splits | Add nullable `package_instance_id` FK; extend CHECK to one-of-three |
| 2 | `payout_batches` parent table | **High** | `payouts` has no batchId/cycle grouping. Period runs can't reconcile/retry/report as unit; Stripe failures orphaned | New `payout_batches(id, period_start, period_end, status, initiated_by, totals)` + `payouts.batch_id` FK |
| 3 | `category_commission_configs` version history | **High** | Splits snapshot scalars but config rows mutate in place; disputed splits can't recompute against config at `earnedAt` | New `_versions` table OR `version int` + `effective_from/until` on configs; splits store `configVersionId` |
| 4 | `payouts.recipientId` → `members.userId` (real FK) | Medium | Same-tenant DB, text-only. Same for `commission_splits.staffId`, `approvedBy`, `paidBy`, `manualPayoutConfirmedBy` (6 cols total) | Upgrade `members.userId` unique INDEX → unique CONSTRAINT; add FKs |
| 5 | `partner_stripe_accounts.partnerId` → `members.userId` | Medium | Per MEMORY.md, FK removed because target was index not constraint. Long-term: deleted member leaves dangling Stripe account | Same constraint upgrade + restore FK RESTRICT |
| 6 | `partner_stripe_accounts` ↔ `hierarchy_nodes` | Medium | One Stripe account per partner globally; trainer at 2 branches w/ separate payout entities can't model | Add `hierarchyNodeId` FK; relax unique to `(partner_id, hierarchy_node_id)` |
| 7 | Approval audit trail | Low | `approvedBy`/`paidBy`/`confirmedBy` lose multi-step history | New `commission_split_approvals(split_id, actor_id, action, at)` |
| 8 | `payouts.commission_split_id` redundant | Medium | Singular FK conflicts with batching; payouts aggregate many splits | Drop col; rely on `commission_splits.payout_id` (already exists) |

## Inventory Ops

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | Stock movement audit log | **critical** | Every `product_stock.quantity` mutation (receive/transfer/sale/refund/adjustment) unauditable. Cannot reconcile shrinkage, reverse bad receipt, prove SOX | New `stock_movements(product_id, branch_id, delta_qty, balance_after, source_type, source_id, performed_by, occurred_at)` |
| 2 | stock_request → transfer_order fulfillment | **High** | Fulfilled stock_request has no traceable transfer; can't answer "did central ship what was requested" | `transfer_orders.stock_request_id` FK SET NULL OR junction for partial fulfillment |
| 3 | Per-line goods receipt records (3-way match) | **High** | `purchase_order_items.receivedQty` is running counter — no when/who/which-delivery/condition. No partial receipt history, supplier dispute, 3-way match | New `goods_receipts` + `goods_receipt_items` |
| 4 | Supplier invoice/bill link | **High** | `purchase_orders.totalAmount` exists, no link to supplier billing → AP cannot match invoice to PO | New `supplier_invoices(supplier_id, po_id, invoice_number, billed_amount, due_date, status)` |
| 5 | transfer_order_items received/damaged qty | **High** | Items have `quantity` only; destination can't confirm short shipment | Add `received_qty`, `damaged_qty` cols; consider `transfer_receipts` table |
| 6 | stock_request_items fulfilled qty | Medium | No qty_approved vs qty_requested vs qty_fulfilled per line | Add `approved_qty`, `fulfilled_qty` cols |
| 7 | Reorder point on product_stock | Medium | Has `minStockLevel` but no `reorderPoint`/`reorderQty`/`maxStockLevel` for auto-PO suggestions | Add cols |
| 8 | PO approval audit trail | Medium | `approvedBy`/`approvedAt` single-shot; no rejection reason, no multi-step | New `purchase_order_approvals` |
| 9 | Multi-currency / FX per PO | Medium | Foreign suppliers; no currency_code or fx_rate; booking value drifts vs payment | Add `currency_code text`, `fx_rate int` (bps); optional `fx_rates` table |
| 10 | Damaged / quarantine bucket on stock | Medium | Single `quantity` conflates sellable + damaged + in-transit | Split cols (`available_qty`, `quarantine_qty`, `damaged_qty`, `in_transit_qty`) OR `stock_buckets` table |
| 11 | Tax rate FK on PO | Low | `taxAmount` int but no FK to `tax_rates`; rate lost on update | `purchase_orders.tax_rate_id` FK + snapshot `tax_rate_bps` |
| 12 | 3-way match record | Low | Once GRN + supplier_invoice exist, need explicit match for AP reconciliation | `po_match(po_item_id, grn_item_id, invoice_line_id, variance_cents)` |

## Engagement & Integrations

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | `notifications.userId` discriminator | **High** | All queries filter by user, value unconstrained text; recipient may be member OR customer | `recipientType: "member"|"customer"` + nullable `memberId` + `customerProfileId` FKs |
| 2 | `notifications.relatedType` polymorphic | Medium | No allowed-list CHECK; no orphan cleanup when related entity deleted | CHECK enum + per-type nullable FKs for hot paths |
| 3 | `announcements` multi-branch fanout | **High** | Single `branchId`; "post to all branches in region X" forces N copies, breaks edit/dismiss | New junction `announcement_scopes(announcement_id, hierarchy_node_id)` |
| 4 | `announcements.createdBy` → members | Low | No FK; no convention mirror to members.id | Add `createdByMemberId` FK |
| 5 | `audit_logs.entityType` allowed-list | Medium | Vocabulary in comments only; typos compile | CHECK constraint or `audit_entity_types` lookup |
| 6 | `audit_logs.actorMemberId` not FK'd | Medium | Comment says "denormalized for speed"; orphan risk on member delete | Add real FK SET NULL |
| 7 | `audit_logs.branchId` not FK'd | Medium | Plain uuid; no integrity vs hierarchy_nodes | Add FK SET NULL |
| 8 | `expenses.category` lookup table | Medium | Hard-coded enum-by-comment; no GL-account mapping | New `expense_categories` table + FK |
| 9 | `expenses.submittedBy/approvedBy/paidBy` → members | Medium | Three text actor fields; common join target | Parallel `*MemberId uuid` FKs |
| 10 | `member_sessions` rename | Medium | Actually impersonation-audit, not member sessions; collides with Better-Auth `session` semantics | Rename to `impersonation_sessions`; add `originalSessionToken` for audit |
| 11 | `notification_preferences.userId` scope | **High** | Marked unique but no org/branch scope; user in multiple branches w/ different prefs breaks model | Add `memberId` FK; drop standalone unique on userId |
| 12 | `google_calendar_connections` token rotation | Medium | No `encryptionKeyId`/`tokenRotatedAt`; key rotation can't identify stale ciphertexts | Add cols |
| 13 | `google_calendar_event_mappings` drift detection | Low | No direction or lastSyncedHash | Add `lastKnownEtag`, `direction enum` |
| 14 | `ghl_contact_links` member-side | Medium | Pairs only with customerProfile; staff-side leads unmapped | Add nullable `memberId` FK + CHECK at-least-one |
| 15 | `ghl_sync_events.ghlContactId` link | Low | Cannot join failures back to link w/o text-match | Add nullable `contactLinkId` FK |
| 16 | `dashboard_snapshots.branchId` not FK'd | Medium | Plain uuid; orphans on branch delete | Add FK CASCADE |
| 17 | `dashboard_snapshots` uniqueness | Medium | No unique on `(orgId, branchId, period, snapshotDate)`; duplicates possible | Add unique index |
| 18 | `user_activity_log` polymorphic | Medium | Same shape as notifications — no FK convention, no entity-type CHECK | Add discriminator + CHECK |

## Control Panel

| # | Missing relationship | Severity | Why | Suggested FK |
|---|---|---|---|---|
| 1 | `organizations.ownerUserId` action + history | **High** | NO ACTION + nullable; user delete silently orphans org. Owner change has no audit | `ON DELETE RESTRICT` + new `organization_ownership_history` |
| 2 | `subscriptions` payer FK | **Critical** | No userId/organizationId on subs; can't answer "who pays" without joining via `organizations.subscriptionId` (inverse). Orphan subs possible | Add `payerUserId` FK RESTRICT |
| 3 | `subscriptions` billing/trial history | Medium | status/tier mutated in place; no record of upgrades/downgrades/trial→paid/past_due episodes | New `subscription_events` |
| 4 | `organizations.paymentStatus` enum | Medium | Free-text drift ("active"/"Active"); same for stripeConnectStatus, stripeConnectAccountType | pgEnum |
| 5 | `organization_branches` cache sync FK | **High** | Cross-DB so no real FK, but no `lastSyncedAt`, no checksum, no sync-event log; stale-prone | Add cols + `branch_sync_events` audit |
| 6 | `platform_admins.grantedBy` action | **High** | SET NULL on user delete loses grant audit; compliance gap for super_admin grants | Change to RESTRICT or add immutable `platform_admin_grants` history |
| 7 | `admin_sessions` per-action audit | **Critical** | Impersonation tracks start/end only; no record of which tenant rows mutated under session. Forensics gap | New `admin_session_actions(sessionId, tenantOrgId, tenantTable, tenantRowId, action, payloadHash, occurredAt)` |
| 8 | `admin_sessions.organizationId` action | Medium | SET NULL on org delete erases which tenant impersonation occurred in | Change to RESTRICT or denormalize org name/slug snapshot |
| 9 | `organization_members.role` lookup | **High** | Free text duplicated across orgs; typos vs tenant DB roles | New `platform_roles` table + FK; OR junction `org_member_roles` for multi-role |
| 10 | `organization_members` lifecycle | Medium | No invitedBy/removedAt/removedBy | Add cols |
| 11 | `user` audit | Medium | createdAt/updatedAt only; PII edits untracked | Add `updatedByUserId`, `deletedAt`, `deletedByUserId` OR `user_audit_log` table |
| 12 | `verification.userId` + purpose enum | Low | Email-verify/password-reset/magic-link via one untyped table | Add `userId` FK CASCADE + `purpose pgEnum` |
| 13 | `ghl_location_links` link history | Low | Webhook routing changes silent; secret rotation untracked | Add `linkedByUserId`, rotation cols + events table |
| 14 | `organization_analytics` time-series | Low | Single-row-per-org overwritten each sync; no trend data | New `organization_analytics_snapshots` |
| 15 | `session.impersonatedBy` → `admin_sessions.id` | Medium | Better-Auth writes plain text; can't join to retrieve start time/scope | Add `adminSessionId` FK SET NULL |

---

## Cross-Domain Gaps (NEW — span multiple domains)

| # | Gap | Domains | Severity | Why | Suggested model |
|---|---|---|---|---|---|
| X1 | **Customer identity polymorphic across 6+ domains, no canonical resolver** | Sales, Appointments, Packages, Engagement, Commission, Refunds | **critical** | `clientId text` / `walkInCustomerId` / `customerProfileId` / `userId` reinvented per table (`appointments`, `appointment_clients`, `sales_orders`, `waitlist_entries`, `notifications`, `refunds`, `check_ins`, `ghl_contact_links`). No single "customer" entity for LTV/consent/marketing/RBAC | New `customers(id, type enum: member|profile|walk_in)` parent; all client refs → `customers.id`. OR shared CHECK helper applied uniformly |
| X2 | **No first-class `memberships` / `subscription` tenant entity** | Sales, Packages, Commission, Appointments, Engagement | **critical** | "Active member, Gold tier, Branch X, D1–D2, Coach Y owns retention" implied by overlapping `package_instances` + `installment_plans` + `customer_profiles.membershipTier` but no canonical row. Renewals/churn/retention-commission/access-gating blocked | New `memberships(customer_id, tier, branch_id, starts_at, ends_at, source_package_instance_id, owning_coach_member_id, status)` + `_status_history` |
| X3 | **No tenant-wide `hierarchy_node_id` on transactional tables** | All tenant × Hierarchy/RBAC | **critical** | Only ~16 of ~60 tenant tables carry `branchId`. `payments`, `payment_items`, `installments`, `commission_splits`, `payouts`, `notifications`, `recurrence_rules`, `service_members`, `member_profiles` need 2-4 joins to authorize → `accessibleNodeIds` filters either skipped (security hole) or expensive | Add nullable `hierarchyNodeId` denorm + index on every tenant-scoped table; backfill via parent FK + trigger to keep in sync |
| X4 | **Refund→commission-reversal→payout-adjustment chain has no FK path** | Sales, Commission, Payouts | **critical** | `refunds` doesn't reference `commission_splits` or `payouts`. Sale refunded after payout shipped → no recorded clawback. `commission_splits.status` enum lacks "reversed_by_refund" | `commission_split_reversals(reversed_split_id, refund_id, new_split_id, payout_adjustment_id)` + `reversal_of_split_id` self-FK |
| X5 | Lifecycle/status_history missing for every money-bearing entity | Sales, Payments, Packages, Promotions, Subs(CP) | should-have | Existing doc flags appointments only. `sales_orders`/`payments`/`package_instances`/`installments`/`promotions`/`purchase_orders`/`invoices`/`walk_in_customers` all mutate status in place. Disputes/fraud forensics/AR aging/MRR cohort blocked | Generic `entity_status_history(entity_type, entity_id, from, to, actor, reason, at)` OR per-table |
| X6 | No per-branch / per-coach rollup tables | Sales, Commission, Engagement(dashboards), Hierarchy | should-have | `dashboard_snapshots` org+branch only; no coach dim, no cohort dim. Every dashboard re-aggregates `payments`+`commission_splits`+`appointments`. Time-bomb at 8+ branches × N years | `branch_revenue_daily` + `coach_performance_daily` |
| X7 | Soft-delete inconsistency = orphan-visibility leak | All | should-have | Mix of `isActive bool` (services/products/brands/taxRates), `deletedAt` (some), hard delete (most). `service_members` rows survive when `services.isActive=false` → appear in schedules | Project-wide `deletedAt` convention; deprecate `isActive` as soft-delete; keep only as user toggle |
| X8 | Cross-DB FK gap: `customer_profiles.userId` → CP user.id text-only | Identity (CP×Tenant) | should-have | Same class as `members.userId`. Customer who becomes tenant user (franchisee buys own package) can't be reconciled; loyalty data lost | `customer_profile_user_links` audit table + reconciliation worker |
| X9 | No `permission_grant_audit` | Identity, Engagement, CP | should-have | Granting/revoking permissions mutates `role_permissions` in place. SOC2/ISO needs "who granted X to Y at Z". Must chain CP impersonation | `permission_grants_history(role_id, permission_id, scope, granted_by_member_id, granted_via_admin_session_id NULL, granted_at, revoked_at)` |
| X10 | `expenses` ↔ `payouts` ↔ `purchase_orders` share no "cash outflow" supertype | Inventory, Commission, Engagement, Accounting | should-have | All three move money out; P&L must UNION ALL w/ hand-rolled maps. No FK parent → bank reconciliation impossible w/o external GL | `cash_outflows(source_type, source_id, amount, posted_at, reconciled_bank_txn_id)` polymorphic |
| X11 | CP `subscriptions.tier` ↔ tenant feature usage no link | CP × all tenant | should-have | Tenant code reads tier via runtime context; no row records "this feature used while on tier X". Downgrade disputes / feature-usage billing impossible | Tenant `feature_usage_events(feature_key, member_id, at, subscription_tier_snapshot)` |
| X12 | `gcal_event_mappings` + `appointments` + `class_slots` no unified "scheduled occurrence" parent | Appointments, Integrations | nice-to-have | Three tables each represent "thing on calendar"; sync drift + cross-table double-booking + external dedupe bypass FK graph | `scheduled_occurrence(id, type enum, start, end, hierarchy_node_id, room_id, primary_staff_id)` parent |

**Highest-leverage 3**: X1 customer entity, X2 memberships, X3 universal hierarchyNodeId. Each unblocks several others.

---

## Senior Architect Critique

### Severity recalibrations

| Item | Original | Should be | Reason |
|---|---|---|---|
| Trainer/room EXCLUDE constraint | High | **critical** | Double-booking = P0 customer-trust bug in fitness SaaS |
| `payment_items.promotion_id` real FK | Medium | **High** | Required for LHDN audit (which promo discounted which line); circular-import excuse misreads direction |
| `service_members.role` (lead/asst/sub) | High | should-have | v2 concern; most gyms ship single-trainer first |

### Suggestions to revise

| Item | Issue |
|---|---|
| `members.role` text → roles.id FK (replace) | **Don't replace** — breaks fast-path `member.role === "admin"` shortcut (per MEMORY.md). Add nullable `roleId` ALONGSIDE; treat as additive |
| `payouts.commission_split_id` drop col | **Don't drop yet** — keep as denorm "primary split" pointer for single-split payouts (common case). Drop only AFTER `payout_batches` lands + backfilled |

### Missed gaps

| # | Gap | Type |
|---|---|---|
| M1 | `appointment_clients.walk_in_customer_id` schema/live drift (RESTRICT vs NO ACTION) | drift — walk-in delete silently orphans rows |
| M2 | `package_instances.preferred_trainer_id` FK declared in schema, missing in live | drift — runtime cascade diverges from Drizzle expectations |
| M3 | `ghl_branch_links` exists in live, not schema | smell — ungoverned table, `db:push` could drop |
| M4 | Cross-DB user identity strategy | missed — `members.userId` → CP `user.id` across DB boundary; "unique idx → constraint + FK" only solves within-tenant. Need sync/tombstone strategy for user deletes |
| M5 | No `org_id` on tenant tables | smell — DB-per-tenant hides coupling; cost consolidation later forces full backfill |
| M6 | Polymorphic patterns proliferating (`notifications.relatedType`, `user_activity_log`, `audit_logs.entityType`) | smell — three independent polymorphic conventions; unify with `entity_ref(type, id)` + CHECK catalog |
| M7 | `customer_profiles.user_id` no validation it's a customer not staff | missed — staff user.id silently writeable as customer profile; identity confusion w/ `payments.customer_id` |
| M8 | Time-series partitioning | missed — `appointments`, `check_ins`, `audit_logs`, `notifications`, proposed `stock_movements` need range partitioning by year 2 |

### Migration ordering risks

If all 95 fixes applied naively:

1. `members.role` text→FK before backfilling roles → breaks login
2. `promotion_usages.sales_order_id` text→uuid requires data conversion + downtime
3. RESTRICT on `organizations.ownerUserId` blocks pending user-delete jobs
4. EXCLUDE on appointments fails if existing data has overlaps — needs pre-flight cleanup
5. `payouts.commission_split_id` drop must wait for `payout_batches`
6. Cross-DB FK upgrades need simultaneous CP + tenant migrations across N Neon branches; sequential applies leave drift
7. CHECK extensions on existing rows need `NOT VALID` + `VALIDATE CONSTRAINT` two-step

### Top-15 should include

ERD drift items (M1, M2) are actual prod inconsistencies, not gaps — arguably more urgent than half the top-15.

---

## Fresh-Eyes Final Audit (categorical blind spots + contradictions)

### Internal contradictions to resolve

| # | Issue |
|---|---|
| F1 | Header "Top critical gaps" enumerates 24 — rename or trim |
| F2 | X1 (unify customer entity) vs senior-critique M7 (enforce strict customer/staff separation) — incompatible. Pick one |
| F3 | Identity #1 still labels `members.role` FK **critical** w/ NOT NULL despite senior critique downgrade to additive. Revise |
| F4 | X8 (customer cross-DB) duplicates senior-critique M4. Dedupe |
| F23 | Doc proposes generic `entity_status_history` (X5) AND condemns polymorphic tables (M6). Pick per-entity OR generic |
| F5 | Three independent approval-history tables proposed (PO #8, Commission #7, X9 grants). Same polymorphic smell — unify |

### Scope errors (Better-Auth managed tables)

| # | Issue |
|---|---|
| F6 | `member_sessions` rename — no actual collision w/ Better-Auth `session` (singular) |
| F7 | `verification.userId` FK proposal touches Better-Auth-managed table — needs `additionalFields` hook, not normal migration |
| F26 | `session.impersonatedBy → admin_sessions` — same Better-Auth scope issue |

### Wrong-direction / misshapen FKs

| # | Issue |
|---|---|
| F8 | `payments.invoice_id` FK creates triangular redundancy w/ existing `salesOrderId` on both sides. Use `invoice_payments` junction |
| F21 | `partner_stripe_accounts` per-hierarchy: Stripe Connect = per legal entity, not per branch. Belongs on `hierarchy_nodes.stripe_account_id` (parent owns) |
| F24 | `picMemberId → members.id` blocks org-creation flow when org owner has no tenant member row yet. Use CHECK (member OR is owner) |

### Cycle traps in proposals

| # | Issue |
|---|---|
| F19 | X4 `commission_split_reversals` self-FK + refund_id + payout_adjustment 3-way cycle requires deferred constraints |
| F20 | X1 `customers` parent forks people-resolution — some via customers, some via members. Bidirectional resolution needed |

### Categorical blind spots (entire areas missing)

| # | Category | Why it matters |
|---|---|---|
| F10 | Non-FK constraints | Partial unique idx (one active membership/customer), deferrable constraints, GENERATED cols (total_with_tax), column CHECK (cents ≥ 0, bps 0-10000), identity vs uuid |
| F11 | pgEnum systematic sweep | `members.status`, `appointments.status`, `payments.status`, `installments.status`, `refunds.status`, `notifications.type` — piecemeal, no audit |
| F12 | Index strategy | FK additions imply composite indexes (`hierarchy_node_id, status, created_at`; `member_id, earned_at` on commission_splits). FK without idx = perf cliff at scale |
| F13 | RLS policies | App-layer `accessibleNodeIds` only; PG row-level security on `hierarchy_node_id` would be defense-in-depth |
| F14 | Trigger invariants | `payment_items.sum = payments.amount`; `package_instances.remaining ≤ total`. Audit tables proposed, triggers absent |
| F25 | Cross-table consistency CHECKs | `recurrence_rules` belongs to service+trainer, both branch-scoped → 3-way node inconsistency possible |

### Operational concerns not addressed

| # | Concern |
|---|---|
| F15 | PDPA Malaysia / data retention: right-to-erasure on customer_profiles (cascade vs audit-trail conflict), TTL on audit_logs/notifications/user_activity_log, encryption-at-rest for gcal refresh tokens |
| F16 | Backup/restore: X3 universal `hierarchy_node_id` denorm + cross-DB FK upgrades complicate point-in-time restore of single tenant |
| F17 | Multi-tenant cloning: `payout_batches`/`goods_receipts` identity cols complicate ID remapping; no template-tenant strategy |
| F18 | Neon branch migration ordering: tenant-migration runner embeds each migration string. Each new constraint needs hand-embedding. Old tenants need backfill, new tenants spin up post-migration |
| F27 | Partitioning strategy: senior-M8 names tables but no spec — RANGE(created_at) within tenant DB, pg_partman or declarative |
| F28 | `walk_in_customers` partial unique on phone — MY phone not stable identity (prepaid churn). Email safer |
| F29 | PII column tagging — customer_profiles/members/walk_in_customers carry PII; notifications.body may carry PHI-adjacent. No COMMENT-tagging proposed for compliance scanning |
| F30 | Migration testability — no shadow-test or rollback plan for DB-per-tenant × N branches |

### Stale / mis-categorized

| # | Issue |
|---|---|
| F22 | `dashboard_snapshots` uniqueness — if app upserts already enforce (orgId, branchId, period), DB unique is defensive not "missing relationship" |
| F9 | EXCLUDE constraint on appointments needs (a) `btree_gist` ext (Neon serverless availability untested) (b) `WHERE status <> 'cancelled'` partial (c) tz-aware ranges. Implementation will fail without these |

---

## DB Engineer Review (Postgres/Drizzle/Neon)

### Blockers (will fail or break prod if applied as written)

| Item | Detail | Safer alternative |
|---|---|---|
| **EXCLUDE constraint on appointments** | `btree_gist` on Neon supported BUT GiST index can't `CREATE CONCURRENTLY` on partitioned tables; partial predicate + opclass combos under-supported by Drizzle `exclude()` helper | Raw SQL via `sql.raw()`; pre-validate `NOT VALID` then `VALIDATE CONSTRAINT` |
| **X3 universal hierarchyNodeId + sync trigger** | Trigger across ~44 tables = write amplification on every transactional write; conflicts read-committed when parent moves; 100M+ row backfill needs batching | Set-on-insert immutable denorm (app layer); reject branch reparenting at app layer; skip trigger |
| **Identity #1 `members.role` NOT NULL FK** | `ADD COLUMN NOT NULL REFERENCES` rewrites whole table + ACCESS EXCLUSIVE → blocks login | Add nullable, batch backfill, then `SET NOT NULL` via `NOT VALID` CHECK + `VALIDATE` |
| **Tenant migration runner** (`MIGRATION_0007_SHORT_KORATH` embedded string) | All 95 changes need hand-embedding + replay across N Neon branches; no ordering/idempotency for branches mid-rollout | **Phase 0**: file-based loader reading `drizzle/tenant/*.sql`, per-branch `tenant_migrations` table, gate new-branch provisioning on latest version |

### Risks

| Item | Detail |
|---|---|
| `promotion_usages` text→uuid | `ALTER TYPE uuid USING ...` while indexed = rewrite + lock. Use new col + backfill + swap |
| `payments.invoice_id` triangular | Read-committed + non-deferred = phantom invoice/order mismatch on concurrent insert. Use junction |
| `btree_gist` per Neon branch | Extension state per-branch not guaranteed identical post-fork; verify at branch-provision, not in feature migration |
| X4 commission_split_reversals deferred constraints | Drizzle helpers don't generate `DEFERRABLE INITIALLY DEFERRED`; needs raw SQL or break cycle w/ nullable + post-commit job |
| X5 generic entity_status_history | Polymorphic FK = no real referential integrity in PG. 100M rows = hot-spot. Defeats Drizzle relations inference |
| Stock movement audit | Critical but no partitioning spec. >50M rows/yr at chain scale kills product_stock reconciliation. Use RANGE partition by month from day 1 (pg_partman not on Neon — use declarative + cron) |
| `subscriptions.payerUserId` RESTRICT | Blocks PDPA right-to-erasure. Use SET NULL + immutable `subscription_payer_history` snapshot |

### Nits

| Item | Detail |
|---|---|
| F21 `stripe_account_id` on hierarchy_nodes | Stripe Connect = per legal entity, not per branch. Need separate `legal_entities` table; nodes FK to it |
| Drizzle `check()` w/ subquery | Lookup-table CHECKs need trigger (PG limit, not Drizzle). Use FK to lookup OR `pgEnum` (rewrites table on add) |
| Index strategy | Every new FK → composite idx in same PR. FK without idx = seq scan on parent delete; Neon autoscale masks until cold start |

**DB engineer bottom line**: doc conceptually strong, mechanically underspecified for DB-per-tenant Neon topology. Embedded migration runner = single biggest operational bomb. **Phase 0 (migration infra) before any of the 95 fixes.**

---

## Red-Team Counter-Claims (over-claimed / false-positive)

| Doc claim | Status | Evidence |
|---|---|---|
| Sales #4 promotion_usages.sales_order_id text → High | overstated | Write-once audit row; orphan risk low. Real reason for text = cross-module ordering, not "no excuse" |
| Sales #3 / S&P payment_items.promotion_id "no real risk" then escalated to High | correct-but-overstated | `payment-items.ts:24-26` documents service-layer enforcement. Hand-wavy LHDN justification |
| Commission #5 partner_stripe_accounts FK upgrade | **false-positive** | Re-litigates closed Phase 2S decision (per MEMORY.md). PG FK physically impossible w/ unique index (not constraint) target. Cross-DB strategy debate, not missing FK |
| Identity #1 members.role NOT NULL FK critical | overstated | Doc self-contradicts (senior critique already says additive only). Fast-path `role === "admin"` load-bearing |
| Appointments #2 waitlist polymorphic | overstated | Currently only books members. "Polymorphic" speculative for feature not built |
| Appointments #9 appointment_staff.staff_id "drift-prone" | correct-but-overstated | Documented cross-DB convention (members.userId canonical across codebase). Calling established pattern "drift-prone" misleading |
| Engagement #1 notifications.userId discriminator High | **false-positive** | Uniform usage = control-panel user.id; no current polymorphism. Discriminator solves non-problem |
| Engagement #3 announcements multi-branch fanout High | overstated | `branchId` already nullable (null = org-wide). 2-level scope (branch OR org) supported. Region X = speculative |
| Engagement #6 audit_logs.actorMemberId not FK'd | **false-positive** | `audit-logs.ts:11` documents "denormalized for filter speed; nullable for system actions". Design decision, not oversight |
| Engagement #16/#17 dashboard_snapshots FK + unique | doc self-acknowledges F22 | Listed twice; F22 already concedes app-side enforcement |
| Inventory #1 SOX framing | overstated severity | Malaysian SaaS = LHDN/PDPA, not SOX. Should-have, not "critical/SOX" |
| CP #2 subscriptions payer FK Critical | overstated | `stripeCustomerId` exists; Stripe = system of record. `organizations.subscriptionId` is inverse. Inflation |
| X3 universal hierarchyNodeId "security hole" | overstated | App-layer joins exist; "skipped → security hole" w/o evidence any router skips. Perf concern real, security framing FUD |
| Engagement #11 notification_preferences.userId scope | overstated | Each tenant DB = per-org by architecture. User-multi-branch-prefs conflates CP multi-org w/ tenant prefs |

**Over-claim patterns**: (a) re-litigating decisions documented in schema comments + MEMORY.md; (b) cross-DB FK proposals physically impossible per PG; (c) speculative polymorphism for features not built; (d) severity inflation invoking SOX/critical for v2 improvements; (e) doc surfaces both versions of internal contradictions w/o resolving.

---

## Operator Review (multi-branch gym franchisee perspective)

### Missing tables/relationships gym ops hit weekly

| # | Gap | Why operator hits this |
|---|---|---|
| O1 | **Member freeze/pause/hold** (medical/travel) | Daily request. Need `membership_holds(start, end, reason, fee_waived, max_days_per_year)` w/ auto-resume. Today only `isActive` toggle; workaround = manual `endsAt` extend, loses audit |
| O2 | **Trainer no-show + late-cancel grace policy** | Member cancels <12h = forfeit; trainer no-shows = free make-up + penalty. No `cancellation_policy_id` on package/service. Drives daily front-desk disputes |
| O3 | **Comp / friends-and-family / staff-pass tracking** | Free trials, influencer comps, staff family passes need flag ≠ "refunded $0". Today pollutes revenue + commission. Add `complimentary_reason` + commission exclusion |
| O4 | **Lead source attribution** | #1 Monday marketing question. `customer_profiles` has no `lead_source`/`referrer_member_id`/`campaign_id`. Referral commission impossible w/o it |
| O5 | **Trainer cross-branch transfer mid-month** | Coach KL→Penang on 15th. Commission/schedule/payout need clean cutover date. Need `coach_branch_assignments(member_id, branch_id, from, to)` history |
| O6 | **Walk-in payment conversion to package mid-session** | Drop-in RM50 → 10-pack purchase; drop-in should credit. Sales #7 covers customer link, misses payment conversion |
| O7 | **Partial-payment plans w/ guarantor / parent payer** | Parent pays for teen, spouse pays for spouse. `payments.payerCustomerId ≠ beneficiaryCustomerId` not modeled. Common for under-18 |
| O8 | **Bonus pay caps / clawback ceiling** | "Max RM3000/coach/month" / "no bonus on >30% discounts". Commission config has versioning but no cap/floor/exclusion fields. Finance asks every payroll |
| O9 | **Equipment / asset register** | Treadmill/bench maintenance + downtime affects bookable rooms. Missing entirely. Weekly use |
| O10 | **Waitlist auto-promote + no-show penalty rule** | Doc has waitlist polymorphic but no auto-promote on cancel + no "3 no-shows = ban 7 days" rule entity. Gym-class staple |
| O11 | **Household / family linking** | Couple/family share usage. No `member_household`. Common SKU |
| O12 | **Door-access / turnstile log** | 24h gyms; `check_ins` assumes staff-driven. Need `access_events(member_id, door_id, granted, reason)`. Late-cancel disputes ("I was here at 6am") |

### Severity recalibrations from ops perspective

| Item | Doc says | Operator says |
|---|---|---|
| `refund_items` partial-package refund (Sales #10) | Medium | **High** — weekly request "used 3 of 10 sessions, refund 7" |
| Trainer/room EXCLUDE constraint | critical | ✓ correct, P0 |
| `service_members.role` (lead/asst/sub) | High | ✓ should-have (group classes only; PT skips it) |
| Soft-delete consistency, audit fields on roles/permissions, X9 grant audit, partitioning | various | over-eng — engineer pain, not operator pain. Defer |
| X12 unified scheduled_occurrence | nice-to-have | over-eng — staff now reason about 4 tables vs 2 |
| X11 feature_usage_events for tier billing | should-have | premature — Avantej single-tier today |

### UX risks if implemented as written

| Item | Risk |
|---|---|
| `members.role` text→roleId | UI dropdown of official roles loses front-desk freedom ("Senior Coach (Yoga)"). Keep free-text label alongside |
| Branch-scoped pricing | Naive UI forces N prices per N branches per product. Default = single price, branch override expander |
| `tax_rate_id` per line | Cashier should NEVER pick tax. Auto-derive from service+branch+date. Dropdown = daily mistakes |
| Multi-branch announcement junction | Need "All branches in Region X" preset, not 30-checkbox list |

**Operator bottom line**: doc is engineering-thorough, operator-thin. Phase 0 should cover **freezes, lead source, comp tracking, commission caps, partial-package refunds, household linking** before any of the 24 top-criticals. Drift D1-D3 + trainer/room EXCLUDE correctly prioritized.

---

## Top critical gaps (final ranking, post-critique)

### Structural / cross-domain (highest leverage)
1. **X1 Customer entity** — unify polymorphic clientId/walkInCustomerId/customerProfileId
2. **X2 Memberships table** — first-class active-member entity
3. **X3 Universal hierarchyNodeId** on transactional tables — RBAC + perf
4. **X4 Refund→commission-reversal→payout chain** — clawback integrity

### Within-domain critical
5. **Trainer/room EXCLUDE constraint** (Appointments) — P0 double-booking
6. **`subscriptions` payer FK** (CP) — billing identity
7. **`admin_sessions` per-action audit** (CP) — forensics
8. **Stock movement audit log** (Inventory) — SOX/shrinkage
9. **Branch-scoped pricing** (Services) — multi-branch ops
10. **Tax-rate capture per line** (Sales) — LHDN MyInvois

### Drift items (actual prod inconsistencies — fix first)
11. **D1 `appointment_clients.walk_in_customer_id`** schema RESTRICT vs live NO ACTION
12. **D2 `package_instances.preferred_trainer_id`** schema FK declared, live missing
13. **D3 `ghl_branch_links` rename** to `ghl_location_links` — pending migration

### High-priority within-domain
14. `members.role` ALONGSIDE `roleId` (additive, not replace)
15. Appointment + sales_order + payment + package_instance status history
16. `payment_items.promotion_id` real FK (LHDN audit)
17. `payout_batches` parent table
18. `commission_configs` version history
19. `commission_splits.package_instance_id` link
20. Waitlist polymorphic client model
21. Goods receipt 3-way match
22. `organizations.ownerUserId` RESTRICT + history
23. `announcements` multi-branch fanout
24. Catalog audit fields (createdBy/updatedBy on services/products/brands)
