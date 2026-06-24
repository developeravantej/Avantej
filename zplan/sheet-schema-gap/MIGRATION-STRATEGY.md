# Avantej Client Data Migration Strategy

**Source:** `sample_dataset_and_schema.xlsx` — 8 denormalized operational tables (Aoikumo + GHL + legacy sheets), multi-currency MY/TH/SG, PT-coaching model.
**Target:** Avantej live tenant schema (~100 normalized tables, database-per-tenant via Neon branches).
**Builds on:** `zplan/sheet-schema-gap/GAP.md` (field-level mapping). This doc adds load sequencing, transforms, identity resolution, schema gaps, DQ risks, validation, and a phased plan.
**Latest tenant migration on `main`:** `0094_*`. New migrations authored here start at **`0095`**.

---

## 1. Executive Summary

**Overall difficulty: HIGH but tractable.** The source is a clean denormalized export, not raw spreadsheets, which removes a whole class of parsing pain. The hard parts are structural, not dirty-data: (a) flat geography → a 4-level hierarchy TREE that RBAC + data isolation depend on; (b) a fully-built **commission engine** in the target that the source models as flat allocation columns; (c) the **redemption** entity (coach session-claim ledger) which has **no target table**; and (d) multi-currency source vs Avantej's MYR-cents money model.

This is a one-org, one-tenant-DB load — multi-tenancy isolation is not at risk during migration (we load into exactly one Neon branch). The dominant correctness risks are financial reconciliation and referential integrity across the 8-table dependency chain.

**Top 5 risks (ranked):**

1. **Redemption has no home.** The source's coach session-claim ledger (draft→submitted→approved→rejected→paid, with `claim_amount`/`payout_batch_id`) maps to nothing in Avantej. Avantej *computes* commission off appointments/sales; it has no submitted-claim record. **Decision required + new migration.** This is the single biggest scope item. (See §3.8, §5.)
2. **Multi-currency.** Source rows carry `currency` (MYR/THB/SGD). Avantej money is integer cents, and most flows assume a single org currency (MYR default on appointments). Mixed-currency sales/payouts in one tenant will silently mis-aggregate every financial KPI. **Go/no-go precondition: confirm the purchasing entity is MYR-only, or scope migration to MYR rows only.** (See §6.)
3. **Commission model mismatch.** Source = 6 inline allocation columns per sale (lead_originator / sales_person / primary+secondary coach / allocation_1+2). Target = a commission *engine* (tracks, tiers, conditions, weightages, `commission_splits` with strict CHECK constraints and partial unique indexes). We must decide: **replay history through the engine, or insert frozen `commission_splits` rows directly?** Direct insert is the only sane choice for historical data (the engine config that produced the original numbers no longer exists). (See §3.5.)
4. **Identity resolution across 3 source systems.** `client_id`/`staff_id` are internal sheet IDs; `external_*_id` + `ghl_*_id` are the real Aoikumo/GHL keys. Sales rows carry **name snapshots and a nullable `client_id`** (GHL-only leads). Without a crosswalk + dedup strategy, we get duplicate members/customers and orphan FKs. (See §4.)
5. **Money precision + outstanding balances.** `product_total_amount` / `payment_amount` / `outstanding_amount` are decimals; Avantej is integer cents. Rounding errors compound across thousands of rows. Partially-paid orders (`outstanding_amount > 0`) must map onto Avantej's installment / payment-status model, not be dropped. (See §3.5, §6.)

**Go / No-Go preconditions (must clear ALL before production cutover):**

- [ ] **Currency policy confirmed.** Single MYR tenant, OR explicit decision to drop/segregate non-MYR rows. (Risk #2)
- [ ] **Redemption decision signed off** — new `coach_session_claims` table vs. map-onto-payouts. (Risk #1, §5)
- [ ] **Commission backfill policy signed off** — frozen-split insert vs. no historical commission. (Risk #3)
- [ ] **All new migrations (§5) authored, `bun gen:migrations` run, `bun verify:migrations` green, applied to a throwaway Neon branch.**
- [ ] **Dry-run load on throwaway branch passes all §7 reconciliation gates.**
- [ ] **Source extract is frozen** (a fixed snapshot, not a live-moving export) for the cutover window.

---

## 2. Load Order / Dependency Graph

Load strictly in this order. Each step assumes all prior steps committed. Build an **ID crosswalk** (§4) as you go — every insert records `legacy_id → avantej_uuid`.

```
STEP 0  Tenant bootstrap (control-panel + Neon)
        └─ org row (organizations) + Neon branch provisioned
        └─ runTenantMigrations() → schema at 0094 + new 0095+ migrations
        └─ seedRBACData() → system roles (admin/trainer/staff/client) + permissions

STEP 1  Hierarchy tree  (location → hierarchy_nodes)         [no deps]
        └─ 1a org root node (depth 0)
        └─ 1b country nodes (depth 1, dedup from location.country/country_code)
        └─ 1c state nodes (depth 2, dedup from location.state, parent=country)
        └─ 1d branch nodes (depth 3, parent=state, set country_node_id)
        └─ 1e branch_details (address, pic_user_id placeholder)

STEP 2  Staff  (staff → control-panel user + members + member_profiles)
        depends on: hierarchy (home_branch_id → hierarchyScopeId), roles
        └─ 2a control-panel users (Better-Auth) + organization_members registry
        └─ 2b tenant members (roleId, hierarchyScopeId, trainerTierId)
        └─ 2c member_profiles
        └─ 2d trainer_tiers (dedup from staff.coach_tier) — load BEFORE 2b
        └─ 2e backfill branch_details.pic_user_id (location.branch_manager_staff_id)

STEP 3  Services  (product → services [+ service_prices])    depends on: hierarchy (branchId)
        └─ 3a service_categories (synthesize from product_category)
        └─ 3b services
        └─ 3c service_prices (versioned pricing from effective_start/end_date)

STEP 4  Customers  (client → control-panel user + customer_profiles)
        depends on: hierarchy (home_branch), members (primary/secondary coach → primaryStaffMemberId)
        └─ 4a control-panel users + organization_members (role='client')
        └─ 4b customer_profiles

STEP 5  Sales  (sales → sales_orders + sales_order_items + payments + payment_items + commission_splits)
        depends on: customers, services, members, hierarchy
        └─ 5a sales_orders
        └─ 5b sales_order_items (1 line per order — source is 1-product-per-order)
        └─ 5c payments + payment_items (handle outstanding_amount)
        └─ 5d commission_splits (from inline allocation columns) [if backfill approved]

STEP 6  Packages  (client package → package_instances [+ installments])
        depends on: services, sales_orders, customers, members
        └─ 6a package_instances (credits math, freeze window)
        └─ 6b installments (only if outstanding_amount / payment plan present)

STEP 7  Appointments  (appointment → appointments + appointment_staff)
        depends on: customers, members (coach), hierarchy, services, package_instances, sales_orders
        └─ 7a appointments (primary coach → trainerId)
        └─ 7b appointment_staff (secondary coach → junction row)
        └─ 7c second pass: rescheduled_from_appointment_id → rescheduleHistory

STEP 8  Redemptions  (redemption → NEW coach_session_claims OR payouts/payout_batches)
        depends on: appointments, members, sales_orders, commission_splits
        └─ DECISION-GATED (§5). Last because it references almost everything.
```

**Critical sequencing notes:**

- `trainer_tiers` (2d) and `service_categories` (3a) are **lookup tables synthesized from source enum-ish columns** — they must exist before the rows that FK to them.
- Geography MUST be first. `members.hierarchyScopeId`, `services.branchId`, `sales_orders.branchId`, `appointments.branchId` all FK to `hierarchy_nodes` with `onDelete: restrict`. A missing branch node blocks the whole chain.
- Control-panel user provisioning (2a, 4a) happens in the **control-panel DB**, tenant rows (2b, 4b) in the **tenant DB**. The bridge is `userId` text (no FK). Order: user first, then member/profile.

---

## 3. Per-Table Transformation Spec

### 3.1 `location` → `hierarchy_nodes` (+ `branch_details`)

**This is the highest-effort transform.** Source has flat `state`/`country`/`country_code`/`region`; target needs a 4-level tree (`organization → country → state → branch`) because `accessibleNodeIds` (RBAC) and tenant data isolation traverse it.

Synthesis algorithm:
1. Create the **org root** (depth 0, type `organization`, parentId NULL, countryNodeId NULL). Name = the franchise/org name.
2. **Dedup countries:** `SELECT DISTINCT country, country_code` → one `country` node each (depth 1, parent = org root, countryNodeId NULL).
3. **Dedup states:** `SELECT DISTINCT country, state` → one `state` node each (depth 2, parent = matching country node, countryNodeId = that country node id).
4. **Branch nodes:** one per `location` row (depth 3, type `branch`, parent = matching state node, **countryNodeId = ancestor country node** — this denormalized FK is maintained by `createHierarchyNode` in the live app; for bulk load set it explicitly).
5. `slug` is **NOT NULL** on every node — derive a slug (kebab-case of name); honor the partial unique indexes (`hierarchy_sibling_slug_unique` on (parent_id, slug), `hierarchy_nodes_branch_name_unique` on name where type='branch', `hierarchy_country_name_unique`, `hierarchy_state_sibling_name_unique`). De-collide by appending branch_code.

Column mapping deltas vs GAP.md:
- `branch_id` → crosswalk to new `hierarchy_nodes.id` (uuid). **Do NOT reuse source branch_id as the PK** unless it is already a uuid — keep it in the crosswalk.
- `branch_name` → `hierarchy_nodes.name`. Branch names are **globally unique** (DB index) — if source has dupes across states, append `branch_code` to disambiguate.
- `address_1` (+ `address_2`, `city`, `postal_code`) → **concatenate into** `branch_details.address` (single text column). Structured sub-fields are LOST unless we add columns.
- `branch_manager_staff_id` → `branch_details.pic_user_id` (text, control-panel userId). **Resolve via the staff crosswalk in step 2e** (after staff users exist).
- `created_at` / `updated_at` → carry over.

**No clean target home (decisions required):**
- `branch_code`, `display_name`, `branch_tier`, `pricing_tier`, `collective`, `opening_date`, `closing_date`, `status` (branch-level active/closed), structured `address_2`/`city`/`postal_code`/`region`. → **New `branch_details` columns** (§5, mig `0095`). `region` is interesting: source has BOTH `state` and `region` — Avantej's tree only has one intermediate level (`state`). Recommend: use `state` for the tree level, store `region` as a `branch_details` tag column. Confirm with client which one drives RBAC scoping.
- `pricing_tier` is the bridge to `service_prices` (§3.3) — a branch's pricing tier should select which price row applies. Store on `branch_details` and use it during sales/package price resolution.

### 3.2 `staff` → control-panel `user` + tenant `members` + `member_profiles`

Three-target split:
- **(a) control-panel `user`** (Better-Auth): `email`, `full_name`/`first_name`+`last_name`, phone. Provision via Better-Auth admin API (so the account/password rows are consistent), NOT a raw INSERT. For staff with no email → generate a placeholder (`staff+<external_id>@<org-domain>.invalid`) and flag for claim, OR leave unprovisioned and store name-only on member_profiles. **Decision: do staff get login accounts on day 1?**
- **(b) `organization_members`** (control-panel registry): role, status='active', userId, organizationId.
- **(c) tenant `members`**: `userId` (→ control-panel user), `role` (text fast-path) + `roleId` (FK to seeded `roles`), `hierarchyScopeId` (← home_branch_id via crosswalk), `status`, `joinedAt` (← start_date), `trainerTierId` (← coach_tier via trainer_tiers crosswalk).
- **(d) `member_profiles`**: `displayName` (← preferred_name/full_name), `phoneNumber`, `bio`/`specialization`/`certifications` (none in source → null).

Role mapping logic (`primary_role` + `has_coach_role` + `has_non_coach_role` + `staff_type`):
- `has_coach_role=true` → role `trainer`. `has_non_coach_role=true` only → `staff`. Both → pick `trainer` (commission-eligible) or a custom role; **decision required**. Admins/managers → `admin`. Map `primary_role` text to the seeded `roles.name`; create custom roles if the source has roles outside admin/trainer/staff/client.
- `coach_tier` → dedup into `trainer_tiers` (name = tier label, rank derived from tier order). Set `members.trainerTierId`.

Column mapping deltas vs GAP.md — **no target home:**
- `external_staff_id` / `external_staff_source` → needed for idempotent re-runs and dedup. **New column on `members`** (§5) OR a dedicated crosswalk table (§4, preferred — keeps tenant schema clean).
- `manager_staff_id` (reporting line) → **Avantej has no reporting hierarchy for staff** (the hierarchy tree is geographic, not org-chart). Options: (i) drop, (ii) new `members.manager_member_id` self-FK column. **Decision required** — likely low value for v1, recommend defer.
- `has_coach_role` / `has_non_coach_role` / `staff_type` / `start_date` / `end_date` → no structured home. Recommend **new `member_employment` columns or table** (§5) if the client needs employment lifecycle reporting; otherwise fold into role assignment and drop.
- `end_date` (terminated staff) → set `members.status` and `members.deletedAt` (soft-delete) rather than hard-omit, so historical commission/sales FK to a real member.

### 3.3 `product` → `services` (+ `service_prices`)

Source `product` is a **PT package/program catalog**, NOT retail goods → maps to `services` (which has absorbed package fields), never `products`.

Mapping:
- `product_name` → `services.name` (+ `title` ← display_name). `standard_price` (decimal) → `services.price` (integer cents). `is_active` → `isActive`.
- `session_count` → `services.sessionCount`; set `expirable=true` and `expiryDays` ← `validity_days` (or derive from `validity_weeks × 7`). `services.duration` is **NOT NULL** (seconds) — source has no per-session duration; **default to a sensible value** (e.g. 3600s/60min) and flag. `maxAttendees` is NOT NULL — default 1 for `session_type` private.
- `product_category` → dedup into `service_categories` (FK `categoryId`).
- `branchId`: source product is org/country-level (`country` column), not branch-scoped. `services.branchId` is nullable → leave NULL (org-wide) unless the client wants per-branch service rows.

**Versioned pricing** (`effective_start_date` / `effective_end_date` + multiple price rows per product over time) → `service_prices`:
- Each historical price version → a `service_prices` row: `serviceId`, `priceCents`, `effectiveFrom` ← effective_start_date, `effectiveUntil` ← effective_end_date, `branchId` NULL (or per pricing_tier), `customerType` NULL.
- The **current** price also goes on `services.price` (the fallback in the lookup chain).
- If `pricing_tier` differentiates price by branch tier, encode that as `service_prices` rows keyed by branch (one row per branch in that tier) OR add `customerType`-style tier support — **decision required** (Avantej's lookup chain is service×branch×customerType, no native "pricing tier" dimension).

**No target home:** `product_code`, `product_type` (new_sale/renewal/add_on), `sessions_per_week`, `currency`, `country`, `validity_weeks` (if `validity_days` also present, redundant). `product_type` is semantically important (renewal vs new-sale drives commission in many gyms) — recommend **new `services` columns** `product_code`, `external_product_type`, `sessions_per_week` (§5) if reporting needs them.

### 3.4 `client` → control-panel `user` + tenant `customer_profiles`

Two-target split (mirrors staff):
- **control-panel `user`** + `organization_members` (role `client`). For GHL-only leads with no real email → either generate placeholder or use the `accountGroupId`/dependent pattern (`customer_profiles.userId` is nullable). **Members-with-no-login is supported** (userId NULL + isUnclaimed=true).
- **tenant `customer_profiles`**: `phone`, `gender`, `dateOfBirth` ← date_of_birth, `address` (concatenate address_1/2 + city/postal/state — single text col), `emergencyContactName`/`emergencyContactPhone`, `primaryStaffMemberId` ← primary_coach_id (via staff crosswalk), `notes`.

Mapping deltas vs GAP.md — **no target home:**
- `idendity_no` (NRIC — typo in source) + `identity_type` → **Avantej has NO identity/NRIC field.** Malaysian gyms frequently need this (IC for contracts/e-invoice). **New columns** `customer_profiles.identity_type` + `identity_no` (§5). High recommend.
- `secondary_coach_id` → `customer_profiles` only models ONE `primaryStaffMemberId`. **New column** `secondary_staff_member_id` OR drop. Decision required.
- `emergency_contact_relationship` → no column. New column or fold into `emergencyContactName` text. Low priority.
- `status` lifecycle (lead→trial→active→drop_off) → Avantej customer_profiles has `isDeleted`/`isUnclaimed`/`isActive`-ish flags but **no lifecycle status enum**. Map: active→normal, drop_off→`isDeleted=false` but flag; lead/trial → `isUnclaimed`/`leadAcquisitionType`. **New column** `customer_profiles.lifecycle_status` recommended if the client runs funnel reporting (§5).
- `external_client_id` / `external_client_source` → crosswalk table (§4), not a tenant column.
- `full_name` / `preferred_name` → name lives on the control-panel `user` (Better-Auth); store `preferred_name` if a column exists or skip. `home_branch_id` → customer_profiles has **no branch scope** (customers aren't hierarchy-scoped); capture via their member/sales branch, or add a column. Decision required.

### 3.5 `sales` → `sales_orders` + `sales_order_items` + `payments` (+ `payment_items`) + `commission_splits`

Source: **1 row = 1 order = 1 product**, with inline commission allocations, inline buyer/product snapshots, multi-currency, and GHL ids. Split across 4-5 target tables.

**sales_orders:**
- `sales_order_id` → crosswalk to new uuid (`id`). `sales_order_no` → `salesOrderNumber` (NOT NULL unique — keep source value if unique, else prefix). `client_id` → `customerId` (text = member.userId via crosswalk); `customerName` ← full_name snapshot (NOT NULL); `customerType='member'` (or `walk_in` for GHL-only/no-client_id rows — see DQ §6). `branch_id` → `branchId` (via crosswalk, NOT NULL, FK restrict). `sales_order_status` → `status` (map enum, §6). `payment_date`/`created_at` → `date`/`createdAt`. `notes` → `notes`. `totalAmount` ← product_total_amount (→ cents). `verified_by_admin_staff_id`/`verified_at` → no native field — fold into `notes` or **new columns** (§5).
- **Origination commission (mig 0086 already exists):** `sales_person_staff_id` → `soldBy`; `lead_originator_staff_id` → `leadSourceUserId`. Both are plain text userIds (via crosswalk).

**sales_order_items:** one row per order (source is single-product). `serviceId` ← product_id (via crosswalk — it's a service, not a product). `description` ← product_name (NOT NULL). `quantity`=1, `unitPrice`=`totalPrice`= product_total_amount in cents. Set `commissionDeferred` per policy (service lines defer to appointment in live flow; for historical data set false — already earned).

**payments + payment_items:**
- `payments.stripePaymentIntentId` is **NOT NULL unique** — historical non-Stripe payments have no PI id. **This is a hard blocker:** either generate synthetic ids (`legacy_<sales_order_no>`) or relax the constraint. Recommend **synthetic id** to preserve uniqueness without a schema change.
- `amount`/`totalAmount` ← payment_amount (cents); `currency` ← currency (DQ risk §6 — target default 'usd', set MYR). `paymentMethod` ← payment_method; `status` ← payment_status (map). `franchiserAmount` is NOT NULL — compute = totalAmount (no platform fee on historical). `customerId` NOT NULL ← client_id.
- `outstanding_amount > 0` → the order is **partially paid**. Either (i) record payment for the paid portion + create `installments` for the remainder (if it's a plan), or (ii) set `package_instances.paymentStatus='pending'` with remaining due. **Decision required** — driven by whether outstanding represents an installment plan or just unpaid balance.
- `receipt_1_url`/`_2`/`_3` → no native multi-receipt field. Fold into `payments.metadata` (JSON) or `notes`.

**commission_splits (DECISION-GATED — see Risk #3):** Source has 6 allocation slots: `lead_originator`, `sales_person`, `primary_coach`, `secondary_coach`, `sales_allocation_1`, `sales_allocation_2` (each with staff_id + name snapshot). Avantej's `commission_splits` requires: exactly one of appointmentId/salesOrderId/packageInstanceId (CHECK), `staffId`, `splitPercentage` (0-100), `calculatedAmount` (cents), `status`, `earnedAt` (NOT NULL), and respects partial unique indexes on (sales_order_id, staff_id) and the track-aware index (mig 0092). 
- **Recommended approach: insert frozen historical splits directly**, one per non-null allocation, `salesOrderId` set, `status='paid'` (historical), `earnedAt`=payment_date, `splitType='manual'`, `earnReason='manual'`, `roleType` set per slot (sales_person→sales, lead_originator→marketing/referrer, coaches→trainer). `splitPercentage`/`calculatedAmount`: **the source does NOT give us the amount or %** — only WHO. **This is a gap:** if the client needs historical commission $ amounts, the source must supply them (another sheet?) or we backfill % from current config and accept it's approximate. **Decision required.** Note the unique index allows only ONE split per (sales_order_id, staff_id) — if the same staff appears in two allocation slots on one order, collapse to one row.
- The constraint `commission_splits_so_track_staff_inst_unique` (mig 0092) keys on (sales_order_id, track_id, staff_id, COALESCE(installment_id,sentinel)) — set `trackId` consistently (or NULL) to avoid violations.

**No target home:** `source_system`, `ghl_location_id`/`ghl_contact_id`/`ghl_opportunity_id` (→ crosswalk §4), `referrer_name`/`referrer_contact` (free text — fold to notes or new column), staff/coach **name snapshots** (we resolve to ids; names are recoverable via join — drop). `product_total_amount` vs `payment_amount` discrepancy = `outstanding_amount` — reconcile (§7).

### 3.6 `client package` → `package_instances` (+ `installments`)

Mapping:
- `client_package_id` → crosswalk to `id`. `sales_order_id` → `salesOrderId` (FK). `client_id` → `clientId` (text userId via crosswalk). `product_id` → `serviceId` (NOT NULL FK restrict). `package_status` → `status` (map to pending/active/frozen/completed/expired/exhausted/cancelled). `start_date`/`end_date` → `startsAt`/`expiresAt` (both NOT NULL).
- **Credits math:** `total_session_count` → `creditsTotal`; `redeemed_session_count` → `creditsUsed`. **`creditsRemaining` is a GENERATED column** (`COALESCE(credits_unlocked, credits_total) - credits_used`) — **do NOT insert it.** Verify source `remaining_session_count == total - redeemed`; if not, the source is inconsistent (DQ §6) — trust total/used, recompute remaining, log discrepancies.
- **Freeze:** `package_instances` has only `frozenUntil` (single timestamp). Source has `freeze_start_date` + `freeze_end_date`. Map `frozenUntil` ← freeze_end_date; `freeze_start_date` has no home → drop or fold to `remark`. If status is currently frozen, set `status='frozen'`.
- `primary_coach_id` → `preferredTrainerId`/`assignedTrainerId` (FK members.id — note: this FK is to `members.id` uuid, NOT userId). `secondary_coach_id` → no second-coach field on package → drop or new column.
- Required NOT NULL fields to synthesize: `source` ('purchased'), `paymentStatus` (derive from sales outstanding), `creditsTotal`. `purchaseNumber` unique → derive from sales_order_no.
- `last_redemption_at` → no native column → drop or fold to remark.

**installments:** only create if the linked sale had `outstanding_amount` / a payment plan. Set `package_instances.paymentPlanType`, `installmentsTotal`, `installmentsPaid`, `creditsUnlocked`, `nextDueDate`. If everything was paid upfront, `paymentPlanType='full'`, all credits unlocked.

### 3.7 `appointment` → `appointments` (+ `appointment_staff`)

- `appointment_id` → crosswalk to `id`. `client_id` → `userId` (text). `coach_id` (primary) → `trainerId` (FK members.id via crosswalk — **uuid, not userId**). `branch_id` → `branchId` (NOT NULL FK). `sales_order_id` → `salesOrderId`. `appointment_type` → `type` ("private"/"semi-private"). `appointment_status` → `status` (map: scheduled→confirmed, completed→completed, cancelled→cancelled, no_show→no-show). `start_at`/`end_at` → `startTime`/`endTime`; `duration_minutes` → `duration`. `cancelled_at`/`cancellation_reason` → same. `notes` → `notes`. `createdBy` NOT NULL ← booked_by_staff_id (userId via crosswalk).
- Required NOT NULL synthesis: `sessionTotal`, `pricePerClient` (derive from the service price / package credit value — likely 0 for credit-redeemed sessions, or the per-session price), `createdBy`.
- **`secondary_coach_id` → `appointment_staff` junction row** (staffId = userId, slotIndex per commission slot). The primary coach should ALSO get an `appointment_staff` row if commission slots are used. 
- `redemption_id` → links to the redemption ledger (§3.8) — depends on the redemption decision. Store as crosswalk note for now.
- **`rescheduled_from_appointment_id`** → Avantej uses `rescheduleHistory` (jsonb append-only array of {from,to,at,by}) AND a `recurringParentId` self-FK. Do a **second pass** after all appointments exist: for each row with `rescheduled_from`, append an entry to the *target* appointment's `rescheduleHistory`. `booked_by`/`cancelled_by_staff_id` → `createdBy` / fold cancellation actor into notes (no native cancelledBy on appointments — there's `cancelledAt`/`cancellationReason` only).
- `package_instance` link: source appointment has no direct package_instance_id, but `redemption` ties session usage to packages. Resolve `packageInstanceId` via the redemption/sales_order linkage if needed.

### 3.8 `redemption` → **NO TARGET TABLE** (decision-gated)

The redemption entity is a **coach session-claim ledger**: a coach submits a claim for sessions delivered (`redeemed_session_count`, `claim_amount`, `currency`), it flows draft→submitted→approved→rejected→paid, links to a `payout_batch_id` and `paid_at`. Avantej **computes** commission off appointments/sales into `commission_splits` and pays via `payouts`/`payout_batches`, but has **no submitted-claim record** — there is no "coach asserts I did these sessions, manager approves, then it's paid" artifact.

**Concrete recommendation: create a new tenant table `coach_session_claims`** (mig `0096`, §5). It is genuinely net-new (GAP.md flags it ⭐⭐). Do NOT force-fit onto `commission_splits` — splits are per-sale/appointment auto-computed amounts, while redemptions are per-coach-batch claims with their own lifecycle; conflating them corrupts both the commission audit trail and the payout model.

Sketch:
```sql
CREATE TABLE coach_session_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  client_id text,                       -- member.userId
  coach_id text NOT NULL,               -- member.userId (cross-DB, no FK)
  branch_id uuid REFERENCES hierarchy_nodes(id) ON DELETE RESTRICT,
  sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  package_instance_id uuid REFERENCES package_instances(id) ON DELETE SET NULL,
  redemption_type text NOT NULL,        -- session | adjustment | ...
  status text NOT NULL DEFAULT 'draft', -- draft|submitted|approved|rejected|paid
  redeemed_session_count integer NOT NULL DEFAULT 0,
  claim_amount integer NOT NULL DEFAULT 0,   -- integer cents
  currency text NOT NULL DEFAULT 'MYR',
  submitted_by text, submitted_at timestamptz,
  payout_batch_id uuid REFERENCES payout_batches(id) ON DELETE SET NULL,
  paid_at timestamptz,
  notes text,
  -- migration crosswalk
  legacy_redemption_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_session_claims_coach_idx ON coach_session_claims(coach_id);
CREATE INDEX coach_session_claims_status_idx ON coach_session_claims(status);
CREATE INDEX coach_session_claims_batch_idx ON coach_session_claims(payout_batch_id);
```
- `redemption.payout_batch_id` → first create `payout_batches` rows (crosswalk), then link. `paid` redemptions can additionally generate `payouts` rows if the client wants the payout ledger populated. **Decision: do paid redemptions also backfill `payouts`?**
- This table needs service-layer + router + UI to be *usable* in the live app — that's a feature build beyond migration. For migration alone, the table + data is enough; flag the app-integration as separate scope.

---

## 4. Identity Resolution & Idempotency

**Principle:** never reuse source internal ids as Avantej PKs. Maintain explicit crosswalk tables in a **staging schema** (separate Postgres schema in the throwaway/staging branch, or a dedicated `_migration` schema) so loads are idempotent and re-runnable.

Crosswalk tables (one per entity):
```
mig_xwalk_branch   (legacy_branch_id   text PK, node_id uuid, branch_code text)
mig_xwalk_staff    (legacy_staff_id    text PK, user_id text, member_id uuid,
                    external_staff_id text, external_staff_source text)
mig_xwalk_service  (legacy_product_id  text PK, service_id uuid, product_code text)
mig_xwalk_client   (legacy_client_id   text PK, user_id text, profile_id uuid,
                    external_client_id text, ghl_contact_id text)
mig_xwalk_sales    (legacy_sales_order_id text PK, order_id uuid)
mig_xwalk_package  (legacy_package_id  text PK, instance_id uuid)
mig_xwalk_appt     (legacy_appt_id     text PK, appointment_id uuid)
mig_xwalk_redemption (legacy_redemption_id text PK, claim_id uuid)
mig_xwalk_batch    (legacy_payout_batch_id text PK, batch_id uuid)
```

**Dedup strategy (multi-source):**
- **Clients:** dedup key priority = `ghl_contact_id` → `external_client_id`+`external_client_source` → `email` (normalized lower/trim) → `phone_number` (normalized). The same human may appear under multiple `client_id`s across Aoikumo + GHL; collapse to ONE control-panel user + customer_profile, keep all legacy ids pointing at it in the crosswalk.
- **Staff:** dedup by `external_staff_id`+`external_staff_source` → `email`. 
- **Sales rows with NULL client_id** (GHL-only): match to a client via `ghl_contact_id`; if no match, create a `walk_in_customers` row (customerType='walk_in') rather than dropping the sale.

**Idempotency rules:**
- Every loader does `INSERT ... ON CONFLICT DO NOTHING` keyed on the crosswalk, or checks the crosswalk before insert. Re-running the load on a partially-loaded branch must be a no-op for already-loaded rows.
- Carry `legacy_*_id` columns on the new tables where a §5 migration adds them (e.g. `coach_session_claims.legacy_redemption_id`), so reconciliation can join source↔target without the staging schema.
- Synthetic-but-deterministic ids (e.g. `payments.stripePaymentIntentId = 'legacy_' || sales_order_no`) so re-runs don't create duplicates.

---

## 5. Schema Gaps Requiring New Tenant Migrations

Author these as idempotent SQL in `packages/db/src/migrations/tenant/`, starting at **`0095`**, then `bun gen:migrations`, `bun verify:migrations`, embed in `migrate-tenant.ts`, apply to the throwaway branch first. (Per CLAUDE.md: never `db:push` tenant schema; git autocrlf can flip LF→CRLF and break verify — just re-run gen:migrations.)

| # | Migration | Table | Columns / Object | Why |
|---|---|---|---|---|
| 0095 | branch_details extension | `branch_details` | `branch_code`, `display_name`, `branch_tier`, `pricing_tier`, `region`, `city`, `postal_code`, `opening_date`, `closing_date`, `branch_status` | location fields with no home; `pricing_tier` drives price resolution; dates/tier needed for reporting |
| 0096 | coach session claims | **new** `coach_session_claims` | full table per §3.8 sketch | redemption has NO target — the biggest gap |
| 0097 | customer identity | `customer_profiles` | `identity_type`, `identity_no`, `secondary_staff_member_id` (FK members.id SET NULL), `lifecycle_status`, `emergency_contact_relationship` | NRIC is essential for MY gyms/e-invoice; secondary coach; funnel status |
| 0098 | member employment | `members` (or new `member_employment`) | `external_staff_id`, `external_staff_source`, `staff_type`, `employment_start_date`, `employment_end_date`, `manager_member_id` (self-FK, optional) | staff lifecycle + dedup key; reporting line |
| 0099 | service catalog extras | `services` | `product_code`, `external_product_type` (new_sale/renewal/add_on), `sessions_per_week` | renewal-vs-new drives commission; product_code for reconciliation |
| 0100 | sales verification + source | `sales_orders` | `verified_by` (text userId), `verified_at`, `source_system`, `external_order_id` | admin verification audit + source provenance |

**Crosswalk / provenance columns (lighter alternative):** rather than fat `external_*` columns on every tenant table, prefer the staging crosswalk tables (§4) and add only the `legacy_*_id` columns strictly needed for post-cutover reconciliation. The table above is the maximal version; trim per client reporting needs. **Every column above is a client decision** — confirm which are reporting-load-bearing before authoring migrations.

**Constraints that block load WITHOUT a schema change but are better worked around in data:**
- `payments.stripePaymentIntentId NOT NULL UNIQUE` → use synthetic ids, do NOT relax (relaxing weakens the live Stripe invariant).
- `package_instances.creditsRemaining` GENERATED → never insert it.

---

## 6. Data-Quality Risks & Pre-Migration Cleansing

| Risk | Detail | Mitigation |
|---|---|---|
| **Multi-currency** | `currency` ∈ {MYR, THB, SGD} on sales/redemption/product. Avantej aggregates assume one currency; `payments.currency` defaults 'usd', `appointments.currency` 'MYR'. | **Confirm tenant is MYR-only.** If mixed, either (a) scope migration to MYR rows, or (b) store currency per-row and accept KPIs must filter by currency. NO FX conversion without an explicit, dated rate table from the client. |
| **Decimal → cents** | `product_total_amount`, `payment_amount`, `outstanding_amount`, `claim_amount`, `standard_price` are decimals. | `ROUND(value * 100)` to integer cents; assert no value has >2 decimal places pre-load; reconcile summed cents vs summed source decimals (§7). |
| **`idendity_no` typo** | Source column is misspelled. | Map `idendity_no` → `identity_no` explicitly in the loader; don't let a column-name auto-mapper silently drop it. |
| **NULL client_id on sales** | GHL-only leads have no `client_id`. | Resolve via `ghl_contact_id`; fallback → `walk_in_customers` row. Never drop a paid sale. |
| **Credits inconsistency** | `remaining_session_count` may ≠ `total - redeemed`. | Trust total/used, recompute remaining (it's a GENERATED column anyway); log every mismatch for client review. |
| **Status enum mismatches** | Source statuses (sales_order_status, package_status, appointment_status, redemption_status) won't match Avantej's literal sets. | Build explicit mapping tables per status field; FAIL the load on any unmapped value (don't default-bucket silently). |
| **Name snapshots as truth** | Sales/appointment rows carry staff/client name strings that may disagree with the staff/client master. | Resolve to ids via crosswalk; treat names as display-only; log disagreements (possible wrong-id linkage). |
| **Orphan FKs** | A sale/appointment may reference a branch/staff/client/product id absent from the master sheets. | Pre-flight referential-integrity scan (§7) BEFORE any insert; quarantine orphans, don't insert with NULL FK where NOT NULL. |
| **Globally-unique branch names** | DB enforces unique branch name. | Pre-scan for duplicate `branch_name`; disambiguate with `branch_code`. |
| **Duplicate-numbered migrations (0051–0063)** | Existing history quirk. | Our new 0095+ are clean; just keep them idempotent and `type::text` casts if touching the enum. |
| **`sales_order_no` collisions** | `salesOrderNumber` is unique NOT NULL. | Pre-scan for dupes; prefix/suffix collisions. |

---

## 7. Validation & Reconciliation

Run on the throwaway/staging branch after each load step; re-run all gates before production cutover.

**Row-count gates (source → target, via crosswalk):**
- `count(location)` == `count(hierarchy_nodes WHERE type='branch')`
- `count(staff)` == `count(members)` (minus any intentionally-merged dupes — log the delta)
- `count(client distinct after dedup)` == `count(customer_profiles)`
- `count(product)` == `count(services)`
- `count(sales)` == `count(sales_orders)` == `count(sales_order_items)` (1:1:1)
- `count(client package)` == `count(package_instances)`
- `count(appointment)` == `count(appointments)`; secondary coaches == extra `appointment_staff` rows
- `count(redemption)` == `count(coach_session_claims)`

**Financial reconciliation (the critical gates):**
- `SUM(sales.payment_amount)` (→cents) == `SUM(payments.totalAmount)` for migrated rows.
- `SUM(sales.product_total_amount)` == `SUM(sales_order_items.totalPrice)` == `SUM(sales_orders.totalAmount)`.
- `SUM(sales.outstanding_amount)` == `SUM(product_total - payment)` == remaining installment/package due.
- Per-currency subtotals match (if multi-currency retained).
- `SUM(redemption.claim_amount)` == `SUM(coach_session_claims.claim_amount)`.
- If commission backfilled: `SUM(commission_splits.calculatedAmount)` reconciles to whatever source amount basis was agreed (flag that source gives WHO not how-much — §3.5).

**Integrity / recomputation:**
- Every `members.hierarchyScopeId`, `services.branchId`, `sales_orders.branchId`, `appointments.branchId` resolves to a real `hierarchy_nodes.id` (no orphans).
- `package_instances.creditsRemaining` (generated) == source `remaining_session_count` for rows where source was internally consistent; list exceptions.
- RBAC smoke: pick a branch-scoped staff member, compute `accessibleNodeIds`, confirm it includes their branch and excludes sibling branches (multi-tenant/scope isolation sanity).

**Spot-check queries (manual, per CLAUDE.md "functionally tested"):**
- Pick 10 random clients spanning Aoikumo-only, GHL-only, and both; verify single deduped profile, correct coach, correct package credits.
- Pick 5 partially-paid sales; verify outstanding shows correctly in package/installment.
- Open the app at `http://avantej.localhost:3021/` against the staging branch; verify a branch, a staff member's commission view, a customer 360, a package with redeemed sessions render.

**Rollback story:** because each tenant is its own Neon branch, the production cutover loads into a **fresh branch**. If validation fails post-cutover, **discard the branch and re-provision** — no in-place undo needed. Keep the pre-load branch snapshot. The staging schema (`mig_xwalk_*`) can be dropped after sign-off or retained for audit.

---

## 8. Phased Plan

**Phase 0 — Prep & decisions (no DB writes).**
- Resolve all §1 go/no-go decisions (currency, redemption, commission backfill, which §5 columns).
- Freeze a source snapshot. Build status-mapping tables + dedup rules.
- **Gate:** all decisions signed off; source frozen.

**Phase 1 — Schema (throwaway branch).**
- Author migrations `0095`–`0100` (only those approved). `bun gen:migrations` → `bun verify:migrations` green → embed in `migrate-tenant.ts`.
- Provision a throwaway Neon branch; `migrate-all-tenants.ts --filter=<throwaway> --dry-run` then apply (`--concurrency=1`). `seedRBACData` runs.
- **Gate:** throwaway branch at version 0100, `verify:migrations` green, RBAC roles seeded.

**Phase 2 — Staging load (throwaway branch).**
- Create `mig_xwalk_*` staging tables. Run loaders in §2 order (steps 0–8). Idempotent inserts.
- **Gate:** all §7 row-count + financial reconciliation gates pass; orphan/quarantine list reviewed with client.

**Phase 3 — Dry-run validation.**
- Run §7 integrity/recompute checks + spot-checks. Browser-verify key screens against staging branch.
- Client UAT on staging: they confirm a sample of their real clients/sales/packages look right.
- **Gate:** client sign-off on staging data; financial totals match their books.

**Phase 4 — Production cutover.**
- Provision the **real tenant Neon branch** (or use the already-created org's branch). Apply migrations (dry-run → `--concurrency=1`).
- Re-run loaders against the fresh production branch from the same frozen snapshot.
- Re-run ALL §7 gates on production. Browser smoke + RBAC isolation check.
- **Gate:** production reconciliation green → release to client. If any gate fails → discard branch, fix, re-provision (rollback = re-create branch).

**Phase 5 — Post-cutover.**
- Backfill `branch_details.pic_user_id` (needed staff to exist first — already in step 2e but re-verify).
- Hand off `coach_session_claims` app-integration (service/router/UI) as a **separate feature ticket** — migration loads the data, but making it operable in the live app is product work beyond this migration.
- Retain staging crosswalk for 30 days for audit, then drop.

---

## Decisions the Client MUST Make (consolidated)

1. **Currency:** MYR-only tenant, or multi-currency retained / non-MYR dropped? (blocks everything)
2. **Redemption:** approve new `coach_session_claims` table? Do paid redemptions also backfill `payouts`?
3. **Commission history:** backfill frozen `commission_splits`? Source gives WHO not how-much — accept approximate %/amount, or supply amounts?
4. **Outstanding balances:** treat as installment plans (→ `installments`) or unpaid balance (→ paymentStatus pending)?
5. **Staff logins:** provision Better-Auth accounts day 1, or name-only members until they claim?
6. **Which §5 columns are reporting-load-bearing** (NRIC, secondary coach, lifecycle status, staff employment, manager reporting line, product_type, verified_by)? Each = a column we add or drop.
7. **`region` vs `state`:** which drives the hierarchy/RBAC level? (source has both)
8. **`pricing_tier`:** how does it select price — per-branch `service_prices` rows, or a new tier dimension?
9. **Branch-scoped customers:** does `client.home_branch_id` need a home (new column) or is sales-branch enough?
