# Notification Preferences

**Route:** `/dashboard/settings/notifications`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/notifications.tsx:1`
**Platform:** web
**Auth required:** authenticated (all roles can edit their own preferences)
**Last updated:** 2026-04-21

---

## 1. What It Does

**Purpose (user perspective):** Control how and when the user receives notifications — toggle channels (Email, SMS, Push) and content types (Booking Reminders, Booking Confirmations, Promotional Emails, Package Expiry) per organization.

**Produces:** Two Cards — "Notification Channels" (3 switches) and "Notification Content" (4 switches) — with auto-save on each toggle and a persistent save-state indicator (colored dot + "Saving…" / "Saved").

**On success:** Dot turns green with "Saved" text; resets to idle after 1.5 s.

**On failure:** `toast.error("Failed to save preference")`; save state returns to idle.

**On no org:** Centered "Select an organization…" message.

---

## 2. How It Works

**Execution flow:**
```
NotificationPreferencesPage
  → useUserContext() → organizationId
  → useQuery(["notificationPreferences", organizationId])
      → client.notificationPreferences.get({ organizationId })
      staleTime: 60_000
  → null API response → merge with DEFAULT_PREFS (all true) — first-visit state

  Switch.onCheckedChange(key, value)
    → mutation.mutate({ [key]: value })
      → client.notificationPreferences.update({ organizationId, [key]: value })
    → setSaveState("saving") → onSuccess: setSaveState("saved") → reset after 1.5 s
    → onError: toast.error
```

**Race condition protection:** All switches are `disabled={mutation.isPending}` — rapid toggling is blocked while a save is in-flight.

**State management:**
- `saveState: "idle" | "saving" | "saved"` — local, resets after 1.5 s
- No optimistic updates — switches reflect server state on query refetch after mutation
- Partial update per toggle: mutation sends only the changed key (`Partial<NotifPrefs>`)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `notificationPreferences.get` — fetches all 7 boolean prefs; returns `null` on first visit
- `notificationPreferences.update` — partial update with one changed key per call

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle`, `CardDescription` — layout
- `Switch` — toggle control (shadcn/ui)
- `SettingRow` — inline sub-component (label + description + Switch)
- `SkeletonCard` / `SkeletonRow` — loading states

**Uses these hooks:**
- `useUserContext` — `organizationId`
- `useQuery` — TanStack Query, `staleTime: 60_000`
- `useMutation` — TanStack Query, partial save per toggle
- `useState` — save state indicator

**Navigation: incoming:** No sidebar link yet (Tier 5 wiring pending). Direct URL only.

**Navigation: outgoing:** None.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `notification_preferences` (tenant) | READ | all 7 boolean columns |
| `notification_preferences` (tenant) | UPDATE | partial — one key per mutation call |

**Preference keys:**
| Key | Type | Default |
|-----|------|---------|
| `emailEnabled` | boolean | `true` |
| `smsEnabled` | boolean | `true` |
| `pushEnabled` | boolean | `true` |
| `bookingReminders` | boolean | `true` |
| `bookingConfirmations` | boolean | `true` |
| `promotionalEmails` | boolean | `true` |
| `packageExpiry` | boolean | `true` |

---

## 5. Tests

**Test files:** None.

**Not tested:**
- First-visit null response → defaults correctly applied
- Rapid toggle debounce (all-true → disabled → all-false)

---

## 6. Notes

- **Not in sidebar yet** — wiring deferred to Tier 5. Access via direct URL `/dashboard/settings/notifications`.
- Null API response (first-visit) is handled by merging with `DEFAULT_PREFS` (all `true`) client-side — the server never receives a "create" call; the first toggle creates the record via `update` (which upserts if needed).
- No optimistic updates — the switch state reflects the last server-confirmed value. Brief lag between toggle and re-render is expected.
- `staleTime: 60_000` on the preferences query.
