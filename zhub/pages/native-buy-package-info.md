# Buy Package — Info

**Route:** `(app)/dashboard/buy-package/info`
**File:** `apps/native/app/(app)/dashboard/buy-package/info.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 3/8 per this screen's counter, step 3/7 per most others) — prev: schedule, next: plan
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** The user optionally enters a free-text remark about their purchase (e.g. health notes, preferences, special requests).
**Produces:** A multi-line text input (min height 150px) pre-filled with any existing remark from context.
**On success:** Continue tapped → remark written to context (null if empty) → navigates to `./plan`.
**On failure / error states:** No validation (field is optional). No API calls, no network errors.

---

## 2. How It Works

**Execution flow:**
```
InfoScreen
  → state.remark pre-fills local remark state
  → User edits multiline TextInput
  → handleContinue → update({ remark: remark || null }) → router.push("./plan")
```

**Inputs:** `state.remark` from context for pre-fill; free-text entry from user
**State management:** Local `remark: string` (initialised from `state.remark ?? ""`); writes to context on continue
**Outputs:** Scrollable screen with header image, progress indicator, remark textarea, Continue button
**Side effects:** None (no API calls)

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper

**Context:** Reads `remark` (pre-fill). Writes: `remark`

**Navigation:** `./plan` — on Continue button tap (always enabled)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| (none) | — | — |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| remark | string \| null | Pre-fills textarea; written to context on continue |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- This is the only step where the screen's own step counter (`currentStep = 3, totalSteps = 8`) differs from the step indicator labels (`steps` array shows 7 labels). All other screens use `totalSteps = 7` in the progress text. This is a UI inconsistency — the progress bar will display "Step 3 of 8 / 38%" while the step dots only show 7 nodes.
- Remark is persisted as `null` (not empty string) when left blank.
- No character limit is enforced in the UI; the DB column is unconstrained text.
