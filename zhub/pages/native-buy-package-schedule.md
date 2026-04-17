# Buy Package — Schedule

**Route:** `(app)/dashboard/buy-package/schedule`
**File:** `apps/native/app/(app)/dashboard/buy-package/schedule.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 2/7) — prev: setup, next: info
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** For private (personal training) services, the user picks up to 4 preferred day-and-time slots. For semi-private/class services, a fixed schedule notice is shown instead.
**Produces:** If `serviceType === "private"`: a day-picker (horizontal scroll of 7 days) + time picker (platform-native on iOS, custom scroll wheel on Android). If `serviceType !== "private"`: a read-only card stating fixed schedule.
**On success:** At least one preferred time selected (private) or no selection required (classes) → context written → navigates to `./info`.
**On failure / error states:** Continue button is hidden until at least one preferred time is added (private only). No API calls — no network error states.

---

## 2. How It Works

**Execution flow:**
```
ScheduleScreen
  → state.serviceType === "private" ? show day/time picker : show fixed schedule card
  → User selects day → expands time picker inline
  → iOS: DateTimePicker (spinner mode)
  → Android: AndroidTimePicker (custom ScrollView wheel, snaps to 5-min intervals)
  → "Add This Time" → adds {day, time} to local preferredTimes array (max 4)
  → handleContinue → update({ preferredTimes }) → router.push("./info")
```

**Inputs:** `state.serviceType` from context; user day + time tap interactions
**State management:** Local `preferredTimes: PreferredTime[]`, `expandedDay: string | null`, `selectedTime: Date`
**Outputs:** Preferred times chip list (removal via × button), expandable time picker per day
**Side effects:** None (no API calls)

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper
- `AndroidTimePicker` (inline) — custom scroll-wheel time picker for Android
- `DateTimePicker` — `@react-native-community/datetimepicker` — iOS native spinner

**Context:** Reads `serviceType` (to branch UI), `preferredTimes` (pre-populate). Writes: `preferredTimes`

**Navigation:** `./info` — on Continue button tap

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| (none) | — | — |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| serviceType | "private" \| "semi_private" \| null | Determines which UI branch to render |
| preferredTimes | Array<{ day: string; time: string }> | Pre-populates selections on re-entry; written on continue |
| serviceName | string \| null | Displayed in fixed-schedule card for classes |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- Maximum of 4 preferred times enforced in UI — "Add This Time" button is disabled at capacity.
- Duplicate day+time combinations are silently rejected (`exists` check before push).
- Time format is 12-hour AM/PM (`h:mm AM/PM`). Minutes snap to 5-minute intervals on Android.
- The Android `AndroidTimePicker` uses `ScrollView` snap scrolling — it does not use the system time picker.
- For class (semi_private) services, `preferredTimes` stays empty and the Continue button is always visible.
- Step indicator on this screen shows `totalSteps = 7`, matching most other screens (info.tsx diverges with 8).
