# Native Dashboard Profile

**Route:** `/(app)/dashboard/profile`
**File:** `apps/native/app/(app)/dashboard/profile.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Lets the customer view and update their personal information, manage notification preferences, change their password, and sign out.
**Produces:** A scrollable profile screen divided into four sections: User Summary, Personal Information (editable), Notification Preferences (toggles), and Account (change password, help, terms, sign out).
**On success:** Profile and notification prefs load silently. Saving edits shows `Alert("Success", "Profile updated")`. Password change shows `Alert("Success", "Password changed successfully")`.
**On failure / error states:** Save failure shows `Alert("Error", "Failed to update profile")`. Password change failure shows `Alert("Error", "Failed to change password...")`. API errors on initial load render silently (no error UI shown).

---

## 2. How It Works

**Execution flow:**
```
ProfileScreen
  → useAuth()                    # gets user (name, email, createdAt), logout()
  → useOrganization()            # gets organizationId
  → orpc.customerProfiles.get.queryOptions({ organizationId })
      → customerProfilesRouter.get
        → getCustomerProfile(tenantDb, userId)
          → customer_profiles table
  → orpc.notificationPreferences.get.queryOptions({ organizationId })
      → notificationPreferencesRouter.get
        → getNotificationPreferences(tenantDb, userId)
          → notification_preferences table

  → handleSaveChanges()
      → client.customerProfiles.upsert({ organizationId, phone })
          → customerProfilesRouter.upsert → upsertCustomerProfile(tenantDb, userId, {...})
      → (if name changed) authClient.updateUser({ name })  # Better-Auth
      → queryClient.invalidateQueries({ queryKey: ["customerProfiles"] })

  → handleToggleNotifPref(key, value)
      → client.notificationPreferences.update({ organizationId, [key]: value })
          → notificationPreferencesRouter.update → upsertNotificationPreferences(tenantDb, userId, {...})
      → queryClient.invalidateQueries({ queryKey: ["notificationPreferences"] })

  → ChangePasswordModal.handleSubmit()
      → authClient.changePassword({ currentPassword, newPassword })
```

**Inputs:**
- Personal info form: `fullName` (text), `email` (read-only, always disabled), `phone` (phone-pad)
- Notification toggles: `emailEnabled` (boolean), `pushEnabled` (boolean)
- Change password modal: `currentPassword`, `newPassword`, `confirmPassword`

**State management:**
- `useQuery` — customerProfiles, notificationPreferences
- `useQueryClient` — cache invalidation after mutations
- Local `useState`: `isEditing`, `isSaving`, `showPasswordModal`
- Local `useState` for `formData` (fullName, email, phone); phone is synced from profile when loaded and not yet editing

**Outputs:**
- User summary card: avatar placeholder, name, "Member since {month year}"
- Personal info section: toggled by edit icon; Save Changes button appears only when `isEditing`
- Notification preferences: two Switch toggles (email, push); changes apply immediately
- Account section: Change Password (modal), Help & Support (mailto:), Terms & Privacy (browser), Sign Out (confirm dialog)
- `ChangePasswordModal`: slide-up pageSheet modal with three password fields

**Side effects:**
- `client.customerProfiles.upsert` — writes/updates `customer_profiles` row in tenant DB
- `authClient.updateUser` — updates `name` in control-panel auth DB (Better-Auth)
- `client.notificationPreferences.update` — writes/updates `notification_preferences` row
- `authClient.changePassword` — updates password hash in Better-Auth
- `logout()` — ends session and redirects to auth screen
- `Linking.openURL("mailto:support@avantej.com")` — opens device mail app
- `Linking.openURL("https://avantej.com/terms")` — opens browser

---

## 3. What Depends On It

**Calls these API endpoints:**
- `customerProfiles.get` — fetches user's customer profile (phone, etc.)
- `customerProfiles.upsert` — saves phone and other profile fields
- `notificationPreferences.get` — fetches email/push/sms toggle state
- `notificationPreferences.update` — immediately persists toggle changes
- `authClient.updateUser` — Better-Auth client call to update display name
- `authClient.changePassword` — Better-Auth client call to change password

**Uses these components:**
- `TabContainer`, `useTabBarHeight` — `apps/native/components/container`
- `ChangePasswordModal` — inline component defined in same file (line 405)

**Uses these hooks:**
- `useAuth` — `apps/native/hooks/useAuth` — `user`, `logout`
- `useOrganization` — `apps/native/hooks/useOrganization` — `organizationId`
- `useQuery`, `useQueryClient` — TanStack Query

**Navigation: who navigates here:** Tab bar (profile tab). Expo Router renders this as the `profile` tab screen.
**Navigation: where it goes:** No in-app navigation (external mailto/browser links only). Sign out triggers `logout()` which redirects the app to the auth flow.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `customer_profiles` (tenant) | READ + WRITE | `userId`, `phone`, `dateOfBirth`, `gender`, `address`, etc. |
| `notification_preferences` (tenant) | READ + WRITE | `userId`, `emailEnabled`, `pushEnabled`, `smsEnabled` |
| `auth.user` (control-panel) | WRITE (name update) | `name` (via Better-Auth `updateUser`) |
| `auth.account` (control-panel) | WRITE (password) | `password` (via Better-Auth `changePassword`) |

**Key types / Zod schemas:**
- `customerProfiles.upsert` input: `{ organizationId, phone?, dateOfBirth?, gender?, address?, emergencyContactName?, emergencyContactPhone?, medicalNotes?, fitnessGoals?, creditPoints?, notes? }`
- `notificationPreferences.update` input: `{ organizationId, emailEnabled?, smsEnabled?, pushEnabled?, bookingReminders?, bookingConfirmations?, promotionalEmails? }`

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| `fullName` | TextInput | None (free text) | `authClient.updateUser({ name })` |
| `email` | TextInput | Always disabled | Display only |
| `phone` | TextInput (phone-pad) | None | `customerProfiles.upsert({ phone })` |
| `emailEnabled` | Switch | — | `notificationPreferences.update({ emailEnabled })` |
| `pushEnabled` | Switch | — | `notificationPreferences.update({ pushEnabled })` |
| `currentPassword` | TextInput (secure) | Required | `authClient.changePassword` |
| `newPassword` | TextInput (secure) | min 8 chars | `authClient.changePassword` |
| `confirmPassword` | TextInput (secure) | Must match newPassword | Client-side check only |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
- Phone sync race: `if (profilePhone && !formData.phone && !isEditing)` runs directly in render body (not useEffect) — will trigger re-renders and is fragile
- `authClient.updateUser` failure is silently swallowed (bare `catch {}`)
- Notification toggle failure shows Alert but does not revert the Switch UI state

---

## 6. Notes

- Email field is always read-only (disabled in both edit and view modes) — email changes are not supported.
- The phone sync from loaded profile data runs directly in the component body (not inside a `useEffect`), which is non-idiomatic and causes an extra render on first profile load.
- `smsEnabled` toggle is NOT shown in the UI even though it exists in the notification preferences schema; only email and push are shown.
- `ChangePasswordModal` is a locally defined function component at the bottom of the file, not imported from elsewhere.
- Profile avatar is a placeholder icon (`Ionicons name="person"`) — user photo upload is not implemented.
- `authClient` is imported from `@/lib/auth-client` (native Better-Auth client), separate from the oRPC `client` from `@/utils/orpc`.
- Both `client.customerProfiles.upsert` and `client.notificationPreferences.update` use the direct `client` call pattern (not `useMutation`), so loading states are managed with local `isSaving` state.
