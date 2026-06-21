# Migration — Locked Decisions + Gap Check & Brainstorm

Companion to `MIGRATION-STRATEGY.md`. Date: 2026-06-18.

## Decisions locked (client)
1. **Multi-country** — MYR + THB + SGD all in scope (not MYR-only).
2. **Backfill commission amounts** — historical commission values are to be loaded, not attribution-only.
3. **Migrate history** — historical redemptions/claims, appointments, sales all migrated (not start-fresh from cutover).
4. **Provision Better-Auth logins** — all staff and clients get accounts.

Each decision unlocks new work and new risks. Captured below.

---

## 🔴 BLOCKER created by decision #2 — the source has no commission amounts
The `sales` table carries WHO got commission (`lead_originator`, `sales_person`, `primary/secondary_coach`, `allocation_1/2` staff IDs + name snapshots) but **no amount or percentage column per allocation**. The only money on a sales row is `product_total_amount`, `payment_amount`, `outstanding_amount`.

So "backfill commission amounts" splits into TWO distinct streams:
- **Coach session payouts → DATA EXISTS.** `redemption.claim_amount` is the per-session coach payout. Migrate directly as historical paid claims. ✅
- **Sales commissions (salesperson / lead originator / allocation 1&2) → DATA MISSING.** No amounts in source. To backfill we need ONE of:
  (a) the client's historical commission **rule set** (% by role/tier/product/branch) to recompute, or
  (b) a separate **commission report/export** from their old system that has the actual paid amounts, or
  (c) downgrade to attribution-only for sales commissions (keep who, drop amount).
  **→ Must get this from the client before sales-commission backfill is possible.**

---

## 🔴 Decision #1 (multi-country) is a PLATFORM-READINESS gate, not just a data task
Avantej today assumes effectively single-currency. Multi-country needs code work BEFORE/ALONGSIDE the load:
- `payments.currency` **defaults to `'usd'`**; `appointments.currency` defaults `'MYR'`. Aggregations/dashboards sum cents without currency segregation.
- `payout_batches.totalCents` and payout rollups **sum across rows** — mixing MYR/THB/SGD in one batch is meaningless. Need **per-currency (per-country) batches**.
- **Tax differs per country:** MY SST (6%/8%), TH VAT (7%), SG GST (9%). `tax_rates` is per-tenant — need per-country/branch tax config + correct historical tax on migrated sales.
- Reporting/KPIs: revenue across 3 currencies needs either FX normalization or strict per-currency views. Decide the reporting model.
- Identity docs differ per country: MY NRIC vs TH national ID vs SG NRIC/FIN — `identity_type` already varies; uniqueness/validation should be country-scoped.
- **Phone normalization** spans +60 / +66 / +65.
- **Timezones:** MY/SG = UTC+8, TH = UTC+7. Must confirm whether source timestamps are local or UTC and normalize per-branch — appointment times are the high-risk ones.

**→ Recommend a small "multi-currency hardening" workstream as a precondition gate.**

---

## 🟠 Decision #4 (provision logins) — do it lazily, not as a mass email blast
- **Shared emails:** families share one email. Avantej already models this via `account_groups` + nullable `customer_profiles.userId` (dependents). Source `client.email` duplicates must route into account groups, NOT collide on the control-panel `user` unique-email constraint.
- **Staff who are also clients:** a `staff.email` may equal a `client.email`. Decide precedence / single identity.
- **No source passwords** → every account starts unclaimed. Use the existing `isUnclaimed` + magic-link claim flow; set `emailVerified=false`. **Do not send thousands of invite emails at cutover** — let users claim on first login, or send a staged announced campaign.
- **Three-way provisioning per user** (from strategy doc): control-panel `user` (Better-Auth) + `organization_members` registry (status=active, role) + tenant `members`/`customer_profiles`, bridged by `userId` text.

---

## 🟡 Additional gaps the strategy under-weighted

**Data fidelity / lossy areas**
- **Installment history is lossy.** Flat `sales` = one row, one `payment_amount` + `outstanding_amount`. If `payment_type='instalment'`, individual installment events aren't in the source. Reconstruct `installment_plans` as **current state only** (total, paid-to-date implied by outstanding); historical per-installment schedule/receipts likely unavailable. Confirm acceptable.
- **Price-at-sale:** use the sales row's `product_total_amount`, NOT current `services.price` — products have `effective_start/end_date` versioning; the sale captured its own price.
- **`collective` and `region`** have no clean target. Avantej's hierarchy is a **fixed 4-level tree** (org→country→state→branch) — neither fits as a node. Decide: store on `branch_details` as metadata, add a brand/grouping (`brands` table?), or drop.
- **`branch_tier` / `pricing_tier`:** if pricing_tier means branches use different price lists, that must drive per-branch `service_prices` during the load, not just a label.
- **`staff.manager_staff_id` reporting line** has no target — add column or drop.

**Referential / ordering**
- **Circular & self-refs:** `appointment.redemption_id ↔ redemption.appointment_id`; `appointment.rescheduled_from_appointment_id`; `staff.manager_staff_id`. Load in **two passes** (insert rows, then UPDATE the cross/self FKs).
- **NULL `client_id` on GHL-only sales** (contact before client existed): decide — synthesize a lead/walk-in `customer_profiles` from the buyer snapshot, or hold those orders.
- **`created_by` NOT NULL** on many tables → need a synthetic **migration/system user id**.
- **Cancellation numbers:** historical `cancelled` sales need `cancellation_number` backfilled and the tenant cancellation sequence advanced past the max imported value (else live cancellations collide).
- **`sales_order_number` global uniqueness:** verify `sales_order_no` is unique across the WHOLE multi-country export before load.

**Operational continuity**
- **GHL live wiring:** `ghl_location_id/contact_id/opportunity_id` should populate Avantej's `ghl_contact_links` / `ghl_user_links` so ongoing GHL sync keeps working post-cutover — not just stored as dead history.
- **Lead sources:** `source_system` / lead acquisition → `lead_sources` lookup + `customer_profiles.leadSourceId`.
- **Freeze windows:** `client package.freeze_start/end_date` → `membership_holds` table (Avantej has it), not only `package_instances.frozenUntil`.
- **Secondary coaches:** map `secondary_coach_id` (appointments, packages) via `appointment_staff` junction + package coach fields.

**Logistics (need answers)**
- **Volume:** sample is 6–16 rows = structure only. Need real counts (clients/sales/appointments may be 10k–100k+) → drives batching, Neon sizing, runtime.
- **Real export format:** same 8-tab xlsx? CSV dumps? Direct Aoikumo API pull? Determines loader input.
- **Cutover model:** old-system write-freeze window + delta migration for records created mid-migration; define source-of-truth during cutover.
- **Reconciliation acceptance:** client will compare old vs new reports — define tie-out targets (total revenue, outstanding AR, sessions remaining, commissions paid) as sign-off gates.

---

## 🔴 Data-quality blockers discovered while building loaders (2026-06-19)

Verified against the real workbook during the dry-run build. These are SOURCE
issues the client must fix in their export — code can't paper over them.

1. **Cross-reference key mismatch (clients).** Transactional sheets reference
   clients as `CL-0000N`, but the `client` dimension leaves `client_id` BLANK
   (only `external_client_id = aoikumo_9001` populated). They don't join — all 16
   migrated appointments came through with a NULL customer link. The export must
   populate a consistent client key across dimension + transactions.
2. **Blank `product_id` on `client package`.** Packages carry no product ref
   (and no `product_name`), only `sales_order_id`. `package_instances.serviceId`
   is NOT NULL → packages can't be created until the export populates product on
   packages (or sales is loaded to bridge order→product).
3. **Blank internal ids are the norm.** `staff_id`, `product_id`, `client_id` are
   all blank in dimensions; the stable keys are `external_*_id` / `*_code`
   (STF-xxx, MY-xxx, aoikumo_xxx). Loaders key on those. But transactions then
   reference clients by `CL-xxx` (see #1) — inconsistent with the dimension.

## Net new client questions raised by these decisions
1. Source of historical **sales-commission amounts** — rules to recompute, or a separate export? (blocks #2)
2. Reporting model for **3 currencies** — per-currency views, or FX-normalized rollups?
3. **Tax** rates + treatment per country, historical and going-forward.
4. **Volume** + **export format** + **cutover window**.
5. Handling of **shared emails** and **staff-who-are-also-clients**.
6. Targets for **`collective` / `region` / tiers / manager line** (keep or drop).
7. **Reconciliation** acceptance thresholds for sign-off.
