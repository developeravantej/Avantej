# Installment System — Manual Testing Checklist

> All web UI and backend are implemented. Run through each section in order.
> Dev server: `bun dev` (web :3001, server :3000). Native: `bun native` or Expo Go.
> Admin credentials: `franchisee@gmail.com` / `password123`

---

## Pre-requisites

1. Server running with `bun dev:server`
2. At least one service package configured (use Test Fitness Franchise org)
3. Test admin: `franchisee@gmail.com` / `password123`
4. Test client: any registered native app user

---

## Phase 1 — Schema & Admin Configuration

### 1A — Payment Plans toggle on Service form

| # | Step | Expected |
|---|------|----------|
| 1 | Web app → `/dashboard/service/view` | Services table loads |
| 2 | Click "New Service" or edit an existing service | Dialog/sheet opens |
| 3 | Scroll to bottom of form | "Payment Plans" section visible with 3 toggles (Full, Half, Quarterly) |
| 4 | Toggle "Half Payment" on | Toggle turns on; "Installment Interval (days)" input appears below |
| 5 | Change interval to `14` | Input accepts value |
| 6 | Toggle "Quarterly Payment" on | Both Half and Quarterly toggled on |
| 7 | Click Save | Toast "saved" appears; sheet closes |
| 8 | Re-open the same package for edit | Both toggles still on; interval shows `14` |
| 9 | Toggle all off and save | Saves empty payment plans |

### 1B — Payment Settings (Grace Period)

| # | Step | Expected |
|---|------|----------|
| 1 | Web app → sidebar → Settings → Payment Settings | Page loads |
| 2 | Grace period input shows default value `7` | Input populated |
| 3 | Change to `14` → click Save | Toast "Settings saved" |
| 4 | Refresh page | Input still shows `14` |
| 5 | Change back to `7` → Save | Resets to 7 |

---

## Phase 2 — Native Purchase Flow

### 2A — Plan selection screen appears

| # | Step | Expected |
|---|------|----------|
| 1 | Native app → Dashboard → Buy Package | Setup screen loads |
| 2 | Select a service that has **no payment plans** configured | Complete flow without seeing plan screen (auto-skips to review) |
| 3 | Select a service that has **Half + Quarterly** configured | After Info step, Plan selection screen appears as step 4 of 8 |
| 4 | Plan screen shows plan cards | Full Payment, Half Payment, Quarterly Payment cards visible |
| 5 | Each card shows installment count and per-installment amount | e.g. "Half Payment — 2 payments — RM 500 each" |
| 6 | Tap "Half Payment" → card highlights | Card visually selected |
| 7 | Tap Continue | Navigates to Review screen |

### 2B — Full payment plan (auto-skip)

| # | Step | Expected |
|---|------|----------|
| 1 | Service with only "Full" plan configured | Plan screen auto-skips, goes directly to Review |

### 2C — Complete purchase with Half plan

| # | Step | Expected |
|---|------|----------|
| 1 | Go through full purchase flow, select Half Payment | |
| 2 | Pay screen shows "Payment Plan: Half Payment (2×)" summary card | Card visible |
| 3 | Pay screen shows first installment amount | e.g. "First installment: RM 500 + tax" |
| 4 | Tap Confirm Purchase | Package instance created |
| 5 | Done screen appears | "Payment is pending confirmation" message |
| 6 | **Admin web app** → `/dashboard/packages/installments/view` | New entry visible with status "Active", progress "0 of 2" |
| 7 | Check `creditsRemaining` on the package instance | Should be **0** (not full credits) until admin confirms payment |

---

## Phase 3 — Admin Payment Confirmation & Locking

### 3A — Admin Installments Dashboard

| # | Step | Expected |
|---|------|----------|
| 1 | Web app → sidebar → Business → Appointments → Installments | `/dashboard/packages/installments/view` loads |
| 2 | Table shows all installment packages | Columns: Client, Plan, Credits, Progress, Next Due, Status |
| 3 | Status filter tabs: All / Active / Overdue / Locked | Clicking each filters results |
| 4 | Click a row | Detail sheet opens on the right |
| 5 | Sheet shows installment timeline | Each installment row with amount, due date, status |
| 6 | Pending installment shows "Confirm Payment" button | Button visible |

### 3B — Confirm Payment

| # | Step | Expected |
|---|------|----------|
| 1 | In detail sheet, click "Confirm Payment" on installment 1 | Dialog opens |
| 2 | Dialog shows: "Confirm payment for Installment 1 of 2?" | Correct installment number |
| 3 | Select payment method "Cash" | Selector works |
| 4 | Add optional note | Notes textarea accepts text |
| 5 | Click Confirm | Dialog closes; toast "Payment confirmed" |
| 6 | Installment 1 now shows "Paid ✓" in timeline | Status updated |
| 7 | Package instance `creditsRemaining` now = 5 (for 10-credit Half plan) | Correct: floor(10 × 1/2) |
| 8 | Client opens native app → packages list | Credits show "5 unlocked" |

### 3C — Credit Blocking During Booking (check-on-access)

| # | Step | Expected |
|---|------|----------|
| 1 | Client has Half plan with 0 credits unlocked (no payment confirmed yet) | |
| 2 | Staff tries to book appointment using this package | Error: "Not enough credits. You have 0 credits available. Complete your next installment to unlock more." |
| 3 | After admin confirms payment (5 credits unlocked) | Booking with 1 credit succeeds |
| 4 | Book 5 appointments (exhaust all 5 credits) | 6th booking fails: "Not enough credits" |

### 3D — Package Locking (check-on-access)

| # | Step | Expected |
|---|------|----------|
| 1 | Manually set `next_due_date` to yesterday in DB for a test package | (direct DB edit via Drizzle Studio) |
| 2 | Staff tries to book appointment for that client | System evaluates overdue → starts grace period |
| 3 | Package now has `grace_period_ends_at` set | Visible in DB |
| 4 | Set `grace_period_ends_at` to yesterday in DB | |
| 5 | Staff tries to book again | Package locks → Error: "Package is locked due to unpaid installment." |
| 6 | Admin installments dashboard → filter "Locked" | Package appears in locked list |

### 3E — Manual Unlock

| # | Step | Expected |
|---|------|----------|
| 1 | Admin opens locked package in detail sheet | "Manual Unlock" button visible |
| 2 | Click "Manual Unlock" | Dialog opens with mandatory reason field |
| 3 | Try to confirm without reason | Button disabled or validation error |
| 4 | Enter reason → Confirm | Toast "Package unlocked"; `is_locked` = false |
| 5 | Staff can now book appointments again | Booking succeeds |
| 6 | `credits_unlocked` unchanged | Was not affected by unlock (credit count unchanged) |

### 3F — Process Refund

| # | Step | Expected |
|---|------|----------|
| 1 | Admin opens any installment package in detail sheet | "Process Refund" button visible |
| 2 | Click "Process Refund" | Dialog opens with amount (pre-filled) and reason |
| 3 | Enter reason → Confirm | Toast "Refund processed" |
| 4 | Package status = "cancelled", paymentStatus = "refunded" | In DB / admin view |
| 5 | Client can no longer book using this package | Booking error: "Package is not active" |

### 3G — Second Installment Confirmation (complete plan)

| # | Step | Expected |
|---|------|----------|
| 1 | Admin confirms installment 2 of 2 on a Half plan | |
| 2 | `installments_paid` = 2, `credits_unlocked` = 10 (full) | All credits unlocked |
| 3 | `next_due_date` cleared, `grace_period_ends_at` cleared | No more pending installments |
| 4 | Package progress shows "2 of 2" in admin dashboard | |
| 5 | Client can now book up to 10 appointments total | |

---

## Credit Formula Verification

Manually verify these calculations are correct in the DB after confirming payments:

| Credits Total | Plan | After Payment 1 | After Payment 2 | After Payment 3 | After Payment 4 |
|---|---|---|---|---|---|
| 10 | Full (1×) | 10 | — | — | — |
| 10 | Half (2×) | 5 | 10 | — | — |
| 10 | Quarterly (4×) | 2 | 5 | 7 | 10 |
| 8 | Half (2×) | 4 | 8 | — | — |
| 8 | Quarterly (4×) | 2 | 4 | 6 | 8 |

---

## Regression Tests (must still work)

| # | Feature | Check |
|---|---------|-------|
| 1 | Legacy package (no payment plan) | Booking works, all credits available immediately |
| 2 | Staff-assigned packages | Still created with `creditsRemaining = creditsTotal`, unaffected |
| 3 | Appointment booking (no package) | Still works without packageInstanceId |
| 4 | Service form (package fields) | Name, session count, price, expiry still save correctly via `/dashboard/service/view` |
| 5 | Package Instances admin table | Still loads at `/dashboard/packages/instances/view` |
| 6 | Tax rates settings page | Still loads at `/dashboard/settings/tax-rates` |

---

## Known Gaps (out of scope for now — do not test)

- Native app packages screen does not yet show installment details on cards
- Notification emails / in-app push when installment becomes overdue
- Coach/trainer client payment status visibility
- Automatic overdue detection without a booking trigger (no cron job — by design for V1)
