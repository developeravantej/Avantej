# Schedule Screen

**Route:** `(app)/dashboard/buy-package/schedule`
**File:** `apps/native/app/(app)/dashboard/buy-package/schedule.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 2/7) — prev: setup, next: info
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** For private training, select up to 4 preferred day/time slots. For group classes, display fixed schedule notice.

**Produces:**
- Private: Horizontal day selector, time picker (iOS DateTimePicker / custom Android scroller), selected preferences chips, add/remove buttons.
- Classes: Fixed schedule info card (no interaction).

**On success:** Preferred times saved to state; navigates to info screen.

**On failure / error states:**
- No preferred times selected for private training: Continue button hidden.
- Classes (semi_private): Button always visible; no selection required.

---

## 2. How It Works

**Execution flow:**
1. Determine service type from PurchaseFlow state (`serviceType === "private"`).
2. If private: render day/time selector UI. If classes: render static info card.
3. Private flow:
   - User taps day → toggle expand that day.
   - User taps time picker or AndroidTimePicker (platform-dependent).
   - `formatTime()` converts Date to 12-hour AM/PM string.
   - Add button saves {day, time} to `preferredTimes` array (max 4).
   - Remove button filters out by index.
4. Continue button enabled only if private has >=1 time or if classes.
5. Push to `./info`.

**Inputs:**
- Navigation params: none (data from previous step in context).
- Local state: `preferredTimes`, `expandedDay`, `selectedTime`.

**State management:**
- PurchaseFlow context: holds `serviceType`, provides `preferredTimes` initial state.
- Local state: day/time picker UI state (selectedTime, expandedDay).

**Outputs:**
- On continue: `update({ preferredTimes })`.
- Navigates to `./info`.

**Side effects:**
- Tab bar hidden (via useFocusEffect, not shown in this file but inherited pattern).
- Time formatting: platform-aware (native DateTimePicker vs custom Android scroll).

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `Container` — wrapper.
- `DateTimePicker` from `@react-native-community/datetimepicker` — iOS time selector.
- `AndroidTimePicker` (custom) — lines 58–314, custom scroll picker for Android.

**Uses these hooks:**
- `usePurchaseFlow` — read/write preferred times.
- `useRef` — ref to scroll views (AndroidTimePicker).
- `useState` — UI state for day, time.

**Navigation: who navigates here:** `./setup` on continue.

**Navigation: where it goes:** `./info` on continue.

---

## 4. Data Shapes

**DB tables touched:** None (UI only; saved at payment step).

**Key types / Zod schemas:**
- `PreferredTime`: `{ day: string; time: string }` (lines 316–319).
- `DayOfWeek`: "monday" | "tuesday" | ... (used in pay screen when persisting).

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Android time picker scroll momentum and snap behavior.
- Time format parsing edge cases (rounding to 5-min intervals).
- Day/time duplicate detection.
- Large preferred times list (>4) — max enforced but not tested.
- Platform-specific DateTimePicker dismissal handling.

---

## 6. Notes

- `DAYS_OF_WEEK` hardcoded array (lines 29–37); should align with DayOfWeek enum.
- Time picker respects 5-minute intervals (MINUTES array, line 53).
- `formatTime()` converts to 12-hour format; does not persist timezone.
- Android picker (lines 58–314) is custom-built with ScrollView snap behavior; complex and untested.
- Classes (semi_private) bypass scheduling entirely — consider whether to collect fixed schedule info.
- Progress indicator shows step 2/7 but steps array shows 7 steps (should be consistent with other screens).
