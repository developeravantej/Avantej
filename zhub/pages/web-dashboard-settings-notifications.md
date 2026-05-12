# Notification Preferences

**Route:** `/dashboard/settings/notifications`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/notifications.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Control which notification channels (email, SMS, push) and types (booking reminders, confirmations, promotions, package expiry) to receive.
**Produces:** Two cards: "Notification Channels" (3 toggles) and "Notification Content" (4 toggles), each with a label and description.
**On success:** Preference saved; "Saved" indicator shows briefly (1.5s).
**On failure / error states:** Loading skeletons, error toast.

---

## 2. How It Works

**Execution flow:**
1. Page loads; `useUserContext()` reads `organizationId`
2. `useQuery` fetches `client.notificationPreferences.get()` with 60s stale time
3. Form values merge API response with defaults (null → all enabled)
4. User toggles a switch → `handleToggle()` → `mutation.mutate({ [key]: value })`
5. On optimistic update: `saveState` → "saving" → "saved" → "idle" (1.5s timer)
6. On error: show toast, revert state to "idle"

**Inputs:**
- Toggles for 7 preference keys: `emailEnabled`, `smsEnabled`, `pushEnabled`, `bookingReminders`, `bookingConfirmations`, `promotionalEmails`, `packageExpiry`

**State management:**
- TanStack Query: `["notificationPreferences", organizationId]`
- Local state: `saveState` (idle|saving|saved)
- Defaults: all true (first-time users get all notifications)

**Outputs:**
- Two preference cards, each with rows of label, description, and toggle
- Save state indicator (Saving…/Saved) in top-right corner
- Skeleton loaders during initial load

**Side effects:**
- Mutation fires on each toggle (not debounced; each toggle is a separate API call)
- 1.5s "Saved" indicator auto-dismisses
- No query invalidation; mutation only updates UI

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.notificationPreferences.get({ organizationId })` — fetch current prefs
- `client.notificationPreferences.update({ organizationId, ...field })` — save one toggle

**Uses these components:**
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` — layout
- `Switch` — toggle controls
- `Bell` icon — page header
- Custom `SettingRow` component — label + description + toggle
- Custom `SkeletonCard` + `SkeletonRow` — loading state

**Uses these hooks:**
- `useUserContext()` — org ID
- `useQuery()` — fetch preferences
- `useMutation()` — save toggle
- `useState()` — saveState
- `useEffect()` — none (no side effects tracked)

**Navigation: who navigates here:** Settings sidebar
**Navigation: where it goes:** None (settings page)

---

## 4. Data Shapes

**DB tables touched:** `notificationPreferences` (multi-tenant per org)
**Key types / Zod schemas:**
```typescript
type NotifPrefs = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  bookingReminders: boolean;
  bookingConfirmations: boolean;
  promotionalEmails: boolean;
  packageExpiry: boolean;
};

type ChannelSetting = {
  key: keyof NotifPrefs;
  label: string;
  description: string;
};
```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):**
- Rapid toggle clicks (mutation queuing)
- Error recovery (saveState should return to idle)
- Stale data merge logic (API null vs. default true)
- 1.5s timer edge cases

---

## 6. Notes

**No debounce:** Each toggle immediately fires a mutation. No batching or debounce; users hitting multiple switches in rapid succession will trigger multiple API calls.

**Defaults on first visit:** If API returns null for a preference, the form assumes true. This means new organizations default to all notifications enabled, which is conservative but may result in spam without opt-in.

**Save state indicator:** Uses 2×2px dot + text in top-right corner (lines 276–289). "Saving…" (amber, pulsing), "Saved" (green, static), then auto-dismiss to "idle" after 1.5s.

**No query invalidation:** The mutation only updates the UI state; it doesn't re-fetch the full preference object. If the backend modifies other fields, they won't be reflected until a hard refresh.

**Skeleton cards:** Loading state shows 3 skeleton rows under "Notification Channels" and 4 under "Notification Content" (lines 248–249), matching the structure.

**Organization guard:** If no org is selected, shows a message asking user to select one (lines 225–230).
