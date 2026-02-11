# Changes: SERVER_SCHEMA_FINAL_V2.0.md vs Current Codebase

Comparison of the schema document (`new md/SERVER_SCHEMA_FINAL_V2.0.md`) against the implemented schema in `packages/db` (Drizzle schema + migrations).  
**Scope**: What the doc specifies vs what is actually in the repo.

---

## 1. Control Panel

### 1.1 `organizations.name` – unique constraint

| Doc | Codebase |
|-----|----------|
| Add `CREATE UNIQUE INDEX idx_organizations_name_unique ON organizations(name)` | No unique on `name`. Only `slug`, `neon_project_id`, `stripe_connect_account_id` are unique. |

**Status**: **Not applied** – doc’s unique on `organizations.name` is not in schema or control-panel migrations.

### 1.2 `organizations.schema_version`

| Doc | Codebase |
|-----|----------|
| Not mentioned | Present: `schemaVersion: text("schema_version").default("0000")` (used for tenant schema migration tracking). |

**Status**: **Extra in code** – doc doesn’t describe it; codebase addition only.

---

## 2. Table / concept naming differences

| Doc | Codebase | Note |
|-----|----------|------|
| `package_purchases` | `package_instances` | Same idea: client/assigned package usage. Code unifies “purchases” and “assignments” into one table with `source` (`assigned` \| `purchased`). |
| `service_trainers` | `service_members` | Same idea: service ↔ trainer/staff. Code uses `service_members` + `member_id` (no optional `trainer_id` from a separate trainers table). |
| `user_profiles` (extended **user** profile) | `member_profiles` (extended **member** profile) | Doc: user_profiles = extended profile for any user. Code: member_profiles = extended profile for **staff/members** only. Code has `customer_profiles` for client-side extended data, but no table named `user_profiles`. |

So:

- **package_purchases** → implemented as **package_instances** (different name, broader concept).
- **service_trainers** → implemented as **service_members** (same role, different name; no optional `trainers` table).
- **user_profiles** → no direct equivalent; code has **member_profiles** + **customer_profiles** instead.

---

## 3. Optional `trainers` table

| Doc | Codebase |
|-----|----------|
| Optional table `trainers` (alternative to using `members` for trainers) | No `trainers` table. Uses `members` + `member_profiles` for trainer/staff details. |

**Status**: **Not implemented** – doc’s optional path “trainers table” not present; code uses members + member_profiles only.

---

## 4. Appointments

### 4.1 Trainer reference

| Doc | Codebase |
|-----|----------|
| `trainer_id` **text** – references `members.user_id` (Better-Auth user id) | `trainerId` **uuid** – references `members.id` (member row id) |

**Status**: **Different** – doc: trainer = Control Panel user id (text). Code: trainer = tenant member id (uuid). Same “who is the trainer” idea, different key (user_id vs member id).

### 4.2 Package link

| Doc | Codebase |
|-----|----------|
| `package_purchase_id` (uuid) → `package_purchases.id` | `packageInstanceId` (uuid) → `package_instances.id` |

**Status**: **Aligned in concept** – doc name is “purchase”, code name is “instance”; both link appointment to the package-usage row.

### 4.3 Fields only in doc (not in appointments table)

Doc adds these on `appointments`; they are **not** columns on the codebase `appointments` table:

- `scheduled_date` (date)
- `scheduled_time` (time)
- `price` (decimal) and `price_unit` (text)
- `instructor` (text)
- `is_auto_assigned` (boolean)
- `remark` (text)
- `studio` (text)
- `recurring_frequency_value`, `recurring_time_unit`, `recurring_repeat_on`, `recurring_monthly_type`, `recurring_ends_type`, `recurring_ends_occurrences`

**Status**: **Not applied** on `appointments` in code.

### 4.4 Recurrence: doc vs code

| Doc | Codebase |
|-----|----------|
| Recurrence stored as extra columns on `appointments` (e.g. `recurring_frequency_value`, `recurring_time_unit`, …) | Recurrence in separate table `recurrence_rules` (1:1 with appointment), with `frequency_value`, `time_unit`, `repeat_on`, `monthly_type`, `ends_type`, etc. |

**Status**: **Different design** – same business idea, different shape (columns on appointments vs normalised `recurrence_rules`).

### 4.5 Extra in code

- `classSlotId` (uuid → `class_slots.id`) – doc doesn’t show this FK on appointments (only references to class_slots elsewhere).

---

## 5. Package purchases / instances

| Doc (`package_purchases`) | Codebase (`package_instances`) |
|---------------------------|-------------------------------|
| `user_id` (text, Control Panel user) | `clientId` (text) – same idea |
| Separate from staff “package_assignments” | Unified: `source` = `assigned` \| `purchased`; `assignedBy` when assigned |
| Fields like `purchase_number`, `total_price`, `payment_id`, `credits_total`, `credits_remaining`, `workouts_completed`, `starts_at`, `expires_at`, `renewal_date`, `status`, etc. | Same concepts; naming/fields slightly different (e.g. `credits_used`, no `renewal_date` in schema read). |

**Status**: **Concept implemented** under different table name and slightly different field set; no separate `package_purchases` table.

---

## 6. Customer profiles

| Doc | Codebase |
|-----|----------|
| `(user_id`, `organization_id)` unique; org-scoped | `user_id` unique only; no `organization_id` (tenant DB = one org per DB, so org often implied). |
| Fields: phone, address, date_of_birth, emergency_contact_*, preferences (jsonb), credit_points, notes | Same idea; code has e.g. `medical_notes`, `fitness_goals` array; no `organization_id` or `preferences` jsonb in schema read. |

**Status**: **Mostly aligned** – difference mainly on uniqueness (per user vs per user+org) and some field names/types.

---

## 7. User profiles (doc) vs member_profiles + customer_profiles (code)

- **Doc**: Single “user_profiles” for extended user profile.
- **Code**:
  - **member_profiles**: extended profile for **members** (staff/trainers): `member_id`, display_name, bio, specialization, image_url, phone_number, certifications.
  - **customer_profiles**: extended profile for **customers**: user_id, phone, address, emergency contact, medical_notes, fitness_goals, credit_points, notes.

**Status**: **Different split** – no `user_profiles` table; code uses member_profiles + customer_profiles instead.

---

## 8. Control panel: organization_analytics

| Doc | Codebase |
|-----|----------|
| Not in doc | Table `organization_analytics` exists in control-panel schema (e.g. analytics / aggregates). |

**Status**: **Extra in code** – not specified in SERVER_SCHEMA_FINAL_V2.0.md.

---

## 9. Summary table

| Item | Doc | Code | Status |
|------|-----|------|--------|
| organizations.name unique | Yes | No | ❌ Not applied |
| organizations.schema_version | No | Yes | ➕ Code only |
| trainers table (optional) | Yes | No | ❌ Not implemented |
| service_trainers | Yes | service_members | ⚠️ Same idea, different name |
| package_purchases | Yes | package_instances | ⚠️ Same idea, different name + unified with assignments |
| user_profiles | Yes | member_profiles + customer_profiles | ⚠️ Different split |
| appointments.trainer_id | text (user_id) | uuid (member id) | ⚠️ Different type and meaning |
| appointments recurrence | Columns on appointments | recurrence_rules table | ⚠️ Different design |
| appointments extra fields | scheduled_date/time, price, price_unit, instructor, is_auto_assigned, remark, studio, recurring_* | Missing on appointments | ❌ Not on appointments in code |
| appointment → class_slot | — | classSlotId on appointments | ➕ Code only |
| organization_analytics | — | Present | ➕ Code only |

---

## 10. What “changed” relative to the doc

- **Implemented with different naming/design**: package_instances (vs package_purchases), service_members (vs service_trainers), member_profiles + customer_profiles (vs user_profiles), recurrence_rules (vs recurrence columns on appointments), trainer_id as member id (vs user id text).
- **Not implemented as in doc**: organizations name unique, optional trainers table, many new appointment columns and recurrence columns on appointments.
- **Only in code**: organizations.schema_version, organization_analytics, appointments.classSlotId.

If you want, next step can be: (1) a short “action list” (e.g. add unique on organizations.name, add missing appointment columns, or align trainer_id with doc), or (2) updating SERVER_SCHEMA_FINAL_V2.0.md to match the codebase.

---

## 11. Impact if you follow the .md (not the codebase)

If you implement the **remaining changes from the .md** and **do not** follow the current codebase design, here is what will be affected.

### High impact (breaking changes)

| Change (to match doc) | What is affected |
|------------------------|------------------|
| **Rename `package_instances` → `package_purchases`** | All schema files, migrations, FKs, and every reference: `packages/db` (schema, migrate-tenant), `appointments`, `preferred_times`, `organization_analytics`. You would also lose the unified "purchase + assign" model (`source` + `assignedBy`) unless you re-add it. |
| **Rename `service_members` → `service_trainers`** | Schema and migrations; any code that joins services to members. Concept is the same; only naming and optional `trainers` table differ. |
| **Change `appointments.trainer_id` from uuid (member id) to text (user_id)** | **Breaks** the current FK to `members.id`. All code that sets/reads `trainerId` must switch to Control Panel `user.id` and resolve member from `user_id` when needed. |
| **Move recurrence from `recurrence_rules` table into columns on `appointments`** | Requires a **data migration**: copy from `recurrence_rules` into new appointment columns. Then either drop `recurrence_rules` (and update any code that uses it) or keep both (redundant). |
| **Replace `member_profiles` + `customer_profiles` with single `user_profiles`** | Major refactor: two tables with different shapes (member vs customer) would become one. You'd need a data migration, new FKs, and to update all code that reads/writes member_profiles or customer_profiles. |

### Medium impact (additive but touches critical paths)

| Change (to match doc) | What is affected |
|------------------------|------------------|
| **Add optional `trainers` table** | New table and migrations. If you then use it instead of `members` for trainers, all "trainer" logic (e.g. appointments, service_trainers) must be updated to reference `trainers` instead of `members`. |
| **Add missing appointment columns** (scheduled_date, scheduled_time, price, price_unit, instructor, is_auto_assigned, remark, studio, recurring_*) | New columns and migrations. App and API code that creates/updates appointments would need to populate these; existing logic might duplicate `startTime`/`endTime` with `scheduled_date`/`scheduled_time`. |

### Lower impact (or "don't remove")

| Change | What is affected |
|--------|-------------------|
| **Add unique on `organizations.name`** | Migration only. **Risk**: fails if duplicate names already exist; you must clean data first. No app code change if you only add the index. |
| **Remove or omit `organizations.schema_version`** | **Do not remove.** It is used by `apps/server` (e.g. `migrate-all-tenants.ts`, `organizations.routes.ts`) for tenant schema versioning. Removing it would break multi-tenant migration. |
| **Remove or omit `organization_analytics`** | Only remove if nothing reads/writes it. Currently in schema only; if you add analytics features later, you'd need this or an equivalent. |
| **Remove or omit `appointments.classSlotId`** | Would break linking appointments to class slots and any logic that uses it (e.g. waitlist, scheduling). **Recommend keeping** unless the doc is updated to include it. |

### Summary

- **Following the .md for "remaining changes"** means: renames, trainer_id type change, recurrence and profile table redesign, and optional trainers table. That implies **large schema and data migrations** and **broad code changes** in `packages/db` and anywhere that uses these tables (APIs, server, future app code).
- **Following the codebase** (and updating the .md to match) avoids those breaks and keeps a single source of truth (the code) with the doc as documentation. The codebase design (e.g. `package_instances` with `source`, `recurrence_rules` table, `trainerId` as member id, `member_profiles` + `customer_profiles`) is already consistent; the main gap is the doc not describing it.
