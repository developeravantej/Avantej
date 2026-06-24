# Sample Dataset & Schema (xlsx) vs Avantej Live Schema — Gap Doc

Source: `sample_dataset_and_schema.xlsx` (10 sheets: README + 8 tables + schema_dictionary).
Verified at file level (raw `workbook.xml` / `sharedStrings.xml`) on 2026-06-18.

The sheet is a **denormalized 8-table PT-coaching model** (Aoikumo + GHL integration, multi-currency MY/TH/SG):
`location / staff / product / client → sales → client package → appointment → redemption`.

Status legend: ✅ direct map · ≈ close/partial · ❌ missing in Avantej · ⭐ net-new concept worth adopting

---

## 1. location (21) → `hierarchy_nodes` (type='branch') + `branch_details`
- ✅ branch_id→id, branch_name→name, created_at/updated_at
- ≈ branch_manager_staff_id→branch_details.pic_user_id, address_1→branch_details.address
- 🔀 state/country/country_code/region modeled as **hierarchy ancestor nodes**, not columns (RBAC depends on tree)
- ❌ branch_code, display_name, branch_tier, pricing_tier, multi-state status, address_2, city, postal_code, collective, opening_date, closing_date

## 2. staff (22) → `members` + `member_profiles`
- ✅ staff_id→id, status, home_branch_id→hierarchyScopeId, coach_tier→trainerTierId, created_at→joinedAt
- ≈ names/email/phone via control-panel user + member_profiles
- ⭐ external_staff_id/source; has_coach_role/has_non_coach_role; staff_type; start_date/end_date; manager_staff_id (reporting line)
- Avantej adds: full RBAC (roleId→roles/role_permissions), soft-delete, lead/household/invitation links, profile bio/certs

## 3. product (19) → `services` (NOT `products` — that's retail inventory)
- ✅ name/price/session_count→sessionCount/validity_days→expiryDays/is_active→isActive
- ⭐ product_code, display_name, product_type (new_sale/renewal/add_on), sessions_per_week, currency, country, effective_start/end_date (versioned pricing)
- Avantej adds: tax, commission bps, Stripe sync, installments, class-slot templates; separate `products` table for SKU/stock/supplier/UoM (sheet has no inventory)

## 4. client (29) → `customer_profiles`
- ✅ phone, gender, dob→dateOfBirth, emergency contact, primary_coach_id→primaryStaffMemberId
- ⚠️ idendity_no — NRIC number (typo in sheet); identity_type also present
- ⭐ external_client_id/source, status lifecycle (lead→trial→active→drop_off), structured address, secondary_coach_id, emergency_contact_relationship, stored full_name/preferred_name
- Avantej adds: households/account-groups, credit points, medical notes, fitness goals, lead attribution, Stripe card-on-file, claimed/unclaimed + soft-delete

## 5. sales (48) → `sales_orders` (+ sales_order_items, payments, commission_splits)
- ✅ sales_order_id→id, sales_order_no→salesOrderNumber, client_id→customerId, branch_id→branchId, status, notes
- ⭐ source_system + ghl_location/contact/opportunity_id inline; buyer snapshot; product snapshot (1 order=1 product); payment_type/method; inline commission allocation (lead_originator/sales_person/primary+secondary_coach/allocation_1+2 with name snapshots); receipt_1-3_url; verified_by_admin/verified_at
- Avantej adds: multi-line orders, walk-in customers, comp/approval, refunds+cancellations, tax, commission ENGINE (vs flat columns), soldBy/leadSourceUserId

## 6. client package (22) → `package_instances`
- ✅ status, start/end_date→startsAt/expiresAt, total/redeemed/remaining→creditsTotal/Used/Remaining, freeze→frozenUntil, sales_order_id→salesOrderId
- ⭐ ghl_contact_id, separate freeze_start/end_date, primary/secondary_coach_id on package
- Avantej adds: installment tracking (plan type/paid/waived/unlocked/due/grace/lock), Stripe auto-charge, e-sig/terms, approval flow, walk-in

## 7. appointment (20) → `appointments`
- ✅ coach_id→trainerId, branch_id→branchId, sales_order_id, type, status, start/end_at→startTime/endTime, duration_minutes→duration, cancellation, rescheduled_from→rescheduleHistory
- ⭐ secondary_coach_id inline (you use appointment_staff junction), redemption_id link, booked_by/cancelled_by_staff_id
- Avantej adds: Stripe payments, recurrence_rules, rooms, class_slots, Google Calendar, package_instance linkage, commission snapshots

## 8. redemption (18) → NO DIRECT TABLE (closest: payout_batches + commission_splits + check_ins)
- ⭐⭐ Whole entity is net-new: redemption_status (draft→submitted→approved→rejected→paid), claim_amount, currency, submitted_by/at, payout_batch_id, paid_at
- A coach session-claim ledger sitting between appointment and payout. Avantej computes commission off appointments but has no claim→approve→pay record.

---

## Top 3 to adopt
1. **redemption** as a real claim-ledger entity into the payout/commission flow.
2. **external_id + source_system** on client/staff/sales → clean Aoikumo/GHL import + dedup.
3. **Explicit sales commission-allocation roles** (lead originator / closer / allocation 1-2) — extends current soldBy/leadSourceUserId.

## Do NOT adopt wholesale
Flattening would drop: multi-tenancy, hierarchy RBAC, inventory/POS goods, tax, refunds, commission config engine, Stripe lifecycle, notifications, audit logs. The flat `sales` row is a good **reporting view** shape, not an OLTP replacement.
