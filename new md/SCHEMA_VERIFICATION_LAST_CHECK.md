# Last Check: SERVER_SCHEMA_FINAL_V2.0.md vs Codebase

Section-by-section verification against `packages/db/src/schema/`.

---

## 1. Control Panel Database ✅

| Section | Status | Notes |
|---------|--------|------|
| **user** (Better-Auth) | ✅ | Doc columns match auth.ts (id, name, email, email_verified, image, role, banned, ban_reason, ban_expires, created_at, updated_at, last_login_at). |
| **session, account, verification** | ✅ | Doc says no changes; not enumerated. |
| **subscriptions** | ✅ | Not enumerated in doc. |
| **organizations** | ✅ | All columns match including schema_version. No unique on name. |
| **organization_analytics** | ✅ | All columns and indexes match. |
| **organization_members, platform_admins, admin_sessions** | ✅ | Doc says no changes. |

---

## 2. Tenant – Core Tables ✅

| Section | Status | Notes |
|---------|--------|------|
| **hierarchy_nodes** | ✅ | Doc says no changes. Code: id, name, type, parent_id, depth, address, pic_user_id, created_at, updated_at. |
| **members** | ✅ | Doc columns match. Note: code role comment includes "client"; doc states members = staff only (design intent). |
| **invitations** | ✅ | Doc says no changes. |

---

## 3. Tenant – RBAC ✅

| Section | Status | Notes |
|---------|--------|------|
| **roles, permissions, role_permissions** | ✅ | Doc says no changes. |

---

## 4. Tenant – Service Management ✅

| Section | Status | Notes |
|---------|--------|------|
| **service_categories** | ✅ | Doc matches code: id, name, description, display_order, branch_id, is_active, created_at, updated_at. |
| **services** | ✅ | Doc matches code (including title, description, type, scheduling_type, etc.). |
| **service_members** | ✅ | Doc matches code. |

---

## 5. Tenant – Package Management ⚠️ FIXED

| Section | Status | Notes |
|---------|--------|------|
| **packages** | ⚠️→✅ | **Was wrong**: Doc had service_id, title, description, type, credits, schedule, price, is_active. **Code** has: name, appointment_type, cross_usage_enabled, session_count, price_per_session, max_clients_per_session, expiry_days, expiry_date, auto_generate_invoice, branch_id, allowed_service_ids, is_archived, created_at, updated_at. **Fix**: Doc section updated to match codebase. |
| **package_assignments** | ✅ | Doc says no changes. |
| **package_instances** | ✅ | Doc matches code. |
| **preferred_times** | ✅ | Doc matches (time as text, priority NOT NULL). |

---

## 6. Tenant – Appointments & Recurrence ✅

| Section | Status | Notes |
|---------|--------|------|
| **appointments** | ✅ | All columns match including trainer_id (uuid), package_instance_id, class_slot_id. |
| **recurrence_rules** | ✅ | Doc matches code. ends_type: "never" \| "on_date" \| "after_occurrences". |
| **class_slots** | ✅ | Doc matches code (branch_id, date timestamp, start_time/end_time text, spots_booked, spots_available, is_cancelled, instructor_id, location). |

---

## 7. Tenant – Waitlist ⚠️ FIXED

| Section | Status | Notes |
|---------|--------|------|
| **waitlist_entries** | ⚠️→✅ | **Was wrong**: Doc had service_id; code has no service_id. Code has: position, expires_at, appointment_id; status "waiting" \| "notified" \| "booked" \| "expired" \| "cancelled". Unique (class_slot_id, user_id). **Fix**: Doc updated to match codebase. |

---

## 8. Tenant – Payments & Items ⚠️ FIXED

| Section | Status | Notes |
|---------|--------|------|
| **payments** | ✅ | Code has amount, tax_amount, total_amount (integer cents), customer_id, stripe_payment_intent_id, platform_fee_*, franchiser_amount, appointment_id, user_id, payment_number, payment_method, refunded_at, refund_amount, failure_reason. Doc lists subset; code is source of truth. |
| **payment_items** | ⚠️→✅ | **Was wrong**: Doc said unit_price/total_price decimal(10,2). **Code** has integer (cents). **Fix**: Doc updated to integer. |

---

## 9. Tenant – Notifications & Preferences ⚠️ FIXED

| Section | Status | Notes |
|---------|--------|------|
| **notifications** | ✅ | Code has no updated_at; doc does not list updated_at. ✅ |
| **notification_preferences** | ⚠️→✅ | **Was wrong**: Doc had push_enabled default false; code default true. Doc missing booking_confirmations, package_expiry. **Fix**: Doc updated (push default true; add booking_confirmations, package_expiry). |

---

## 10. Tenant – Profiles ✅

| Section | Status | Notes |
|---------|--------|------|
| **member_profiles** | ✅ | Doc matches code. |
| **customer_profiles** | ✅ | Doc matches code. |
| **user_activity_log** | ✅ | Code has no updated_at; doc does not list updated_at. ✅ |

---

## 11. Tenant – Additional Tables ⚠️ FIXED

| Section | Status | Notes |
|---------|--------|------|
| **announcements** | ⚠️→✅ | **Was wrong**: Doc had organization_id; **code** has branch_id, is_pinned, target_audience default "all". No organization_id. **Fix**: Doc updated to branch_id, is_pinned; target_audience "all" \| "staff" \| "clients". |
| **expenses** | ⚠️→✅ | **Was wrong**: Doc had organization_id; **code** has branch_id. Code has rejection_reason, paid_by, payment_reference, expense_date; category and description NOT NULL. **Fix**: Doc updated to match codebase. |
| **service_category_config** | ⚠️→✅ | **Was wrong**: Doc had "duration", "max_attendees"; **code** has default_duration, default_max_attendees. **Fix**: Doc updated to default_duration, default_max_attendees. |

---

## Summary of Fixes Applied

1. **packages** – Replaced doc definition with codebase schema (name, appointment_type, session_count, price_per_session, branch_id, allowed_service_ids, is_archived, etc.).
2. **waitlist_entries** – Removed service_id; added position, expires_at, appointment_id; status values and indexes aligned with code.
3. **notification_preferences** – push_enabled default true; added booking_confirmations, package_expiry.
4. **payment_items** – unit_price and total_price documented as integer (cents).
5. **announcements** – organization_id → branch_id; added is_pinned; target_audience values corrected.
6. **expenses** – organization_id → branch_id; added rejection_reason, approved_by, approved_at, paid_at, paid_by, payment_reference, expense_date; category/description NOT NULL.
7. **service_category_config** – duration/max_attendees → default_duration/default_max_attendees.

---

## Final Section-by-Section Check (Latest)

Additional fixes applied in this pass:

| Area | Fix |
|------|-----|
| **payments** | Doc fully aligned with codebase: all amounts as integer (cents); added stripe_payment_intent_id, stripe_charge_id, customer_id, stripe_customer_id, tax_amount, total_amount, platform_fee_*, franchiser_amount, appointment_id, description, metadata; removed decimal(10,2). |
| **payment_items** | All columns marked Existing; item_type includes `discount`; indexes noted. |
| **notifications** | All columns marked Existing; matches codebase. |
| **user_activity_log** | All columns marked Existing; activity_type list includes booking_created, booking_cancelled; matches codebase. |
| **Summary of Changes** | packages and payments descriptions updated to match codebase (no title/credits/schedule in packages; payments integer cents and full column set). |
| **Field Mapping Reference** | Service: removed popularity_percentage. Booking: package_instance_id, trainer_id → members.id; date/time from start_time/end_time; removed instructor, scheduled_date, scheduled_time, studio. Package: codebase fields (name, appointment_type, session_count, price_per_session, etc.); note that title/credits/schedule not in codebase. |
| **Relationships Diagram** | Removed duplicate line; trainer_id is uuid (members.id) only. |
| **Sample Queries** | package_instances: user_id → client_id, p.title → p.name. Upcoming bookings: scheduled_date/scheduled_time → start_time/end_time; JOIN members m ON b.trainer_id = m.id; trainer name from member_profiles. Class slots: cs.time → start_time, end_time. Waitlist: removed service_id; use position, status 'waiting'; ON CONFLICT (class_slot_id, user_id). Fitness progress: client_id, p.name; workouts_completed/renewal_date as computed. Materialized view: client_id, p.name, computed workouts_completed/renewal_date. |
| **Indexes & Performance** | scheduled_date/scheduled_time → start_time; appointments partition by start_time. |
| **Business Rules** | scheduled_date constraint note updated to start_time. |
| **Migration previews** | Migration 1: note codebase has no unique on organizations.name. Migration 2: note codebase already has services fields; do not add sessions, expirable, popularity_percentage. Migration 3: note use service_category_config, not service_categories for commission/config. |

---

**Verification date**: Section-by-section check complete. All fixes applied to SERVER_SCHEMA_FINAL_V2.0.md.
