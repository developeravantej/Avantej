# Buffer Time Feature — Manual Testing Checklist

## Prerequisites

- Dev server running: `bun dev`
- At least one service category with services configured
- At least one trainer assigned to one or more services
- Test accounts:
  - Admin: `franchisee@gmail.com` / `password123`
  - Trainer: a user with role `trainer` (or `staff`) assigned to services

---

## 1. Category Default Buffer (Admin)

**Where**: Sidebar → Service Categories → Edit any category

| # | Step | Expected |
|---|---|---|
| 1.1 | Open a service category in edit mode | "Buffer Time (minutes)" field visible in the Rules section |
| 1.2 | Set buffer to `15` → Save | Toast: "Service category updated successfully" |
| 1.3 | Re-open the category | Buffer time shows `15` |
| 1.4 | Open the category detail dialog | "Buffer Time" row shows `15 min` |
| 1.5 | Set buffer to `0` → Save | Buffer time shows `None` in detail dialog |

---

## 2. Staff Self-Service — My Services Page (Trainer/Staff)

**Where**: Log in as a trainer/staff → Sidebar → My Work → My Services

| # | Step | Expected |
|---|---|---|
| 2.1 | Log in as admin | "My Work" section does **not** appear in sidebar |
| 2.2 | Log in as trainer/staff | "My Work → My Services" link visible in sidebar |
| 2.3 | Open My Services | Table shows **one row per assigned service** with columns: Service (+ category subtitle), Category Default, My Override, Actions |
| 2.4 | "My Override" column for a service with no override set | Shows `— (using default)` |
| 2.5 | Click Edit on a service | Sheet opens with service name (read-only), category name (read-only, muted), buffer input, Save button |
| 2.6 | Leave input blank → Save | Override stays `null` — row shows `— (using default)` |
| 2.7 | Enter `10` → Save | Toast: "Buffer time updated". Row now shows badge `10 min` |
| 2.8 | Refresh page | Override of `10 min` persists |
| 2.9 | Re-open Edit on the same service | "Clear Override" button now visible |
| 2.10 | Click "Clear Override" | Override cleared, row returns to `— (using default)` |
| 2.11 | Trainer with no service assignments | Empty state: "You have no service assignments yet." |
| 2.12 | Two services in the same category; set override on one | Only that service's row shows the override — sibling service row unaffected |

---

## 3. Admin Manages Staff Buffer (Trainers Page)

**Where**: Log in as admin → Sidebar → Trainers → Edit a trainer

| # | Step | Expected |
|---|---|---|
| 3.1 | Open Trainer edit sheet | Three collapsible sections: Profile, Weekly Availability, **Category Buffer Times** |
| 3.2 | Expand "Category Buffer Times" | Loads trainer's assigned **services** (one row per service). Each row shows service name, category name + category default as subtitle, current override |
| 3.3 | Trainer has no service assignments | Section shows "This trainer has no service assignments." |
| 3.4 | Click the pencil icon on a service row | Inline number input + Save + Cancel appear |
| 3.5 | Enter `5` → Save | Toast: "Buffer time updated". Row shows `5 min`, inline editor closes |
| 3.6 | Enter blank → Save | Override cleared, row shows `Using default` |
| 3.7 | Click Cancel | Inline editor closes, no change made |
| 3.8 | Set override via admin → open trainer's My Services page (as that trainer) | Override is visible there too |

---

## 4. Booking Enforcement

**Where**: Calendar / Add Appointment modal

**Setup**: Set category buffer to `15 min`. Trainer A has an appointment from 10:00–11:00.

| # | Step | Expected |
|---|---|---|
| 4.1 | Book trainer A at 11:05 (within 15 min buffer) | Error: "This time conflicts with another appointment. A 15-minute buffer is required between bookings." |
| 4.2 | Book trainer A at 11:15 (exactly at buffer boundary) | Appointment created successfully |
| 4.3 | Set trainer's self-override to `10 min` | Buffer is now 10 min for this trainer |
| 4.4 | Book trainer A at 11:05 (within 10 min buffer) | Still blocked |
| 4.5 | Book trainer A at 11:10 (exactly at 10 min boundary) | Appointment created successfully |
| 4.6 | Clear trainer override (null) | Buffer reverts to category default (15 min) |
| 4.7 | Book a service with no trainer assigned | No buffer check — appointment created regardless |
| 4.8 | Book a service with trainer but category buffer = 0, no override | Back-to-back booking allowed |

---

## 5. Resolution Order

Confirms the cascade: staff service override → category default → 0.

| # | Scenario | Expected effective buffer |
|---|---|---|
| 5.1 | Category default = 15, staff override = 10 | **10 min** |
| 5.2 | Category default = 15, staff override = null | **15 min** |
| 5.3 | Category default = 0, staff override = null | **0 min** (no buffer) |
| 5.4 | Category default = 0, staff override = 5 | **5 min** |
| 5.5 | No category config, no override | **0 min** (no buffer) |

---

## 6. Authorization Boundaries

| # | Scenario | Expected |
|---|---|---|
| 6.1 | Trainer calls `updateMyBuffer` for a service they are **not** assigned to | Error: "You are not assigned to this service." |
| 6.2 | Trainer role tries to access `listForMember` (admin endpoint) | `FORBIDDEN` error |
| 6.3 | Trainer role tries to access `updateBuffer` (admin endpoint) | `FORBIDDEN` error |
| 6.4 | Admin does not see "My Work" in sidebar | Sidebar shows no "My Work" group (note: system admin accounts also see "My Work" — this is expected) |
