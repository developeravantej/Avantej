# Profile Screen

**Route:** `(app)/dashboard/profile`
**File:** `apps/native/app/(app)/dashboard/profile.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View and edit personal profile, manage notification preferences, and access account settings (password, help, terms, sign out).
**Produces:** Scrollable profile with user summary, editable personal info (full name, email read-only, phone), notification toggle switches, account actions (change password modal, help, terms, sign out).
**On success:** Edit mode saves changes to backend via `client.customerProfiles.upsert` and `authClient.updateUser`; toggles persist notification preferences.
**On failure / error states:** Alert dialogs for save/update errors; modal for change password; validation for password (8+ chars, must match).

---

## 2. How It Works

**Execution flow:**
1. Fetches `user` via `useAuth()` hook (name, email, createdAt)
2. Queries `orpc.customerProfiles.get` (organizationId) — fetches phone and other profile fields
3. Queries `orpc.notificationPreferences.get` (organizationId) — fetches emailEnabled, pushEnabled, smsEnabled
4. Initializes formData state with user.name, user.email, profile.phone
5. Syncs profile.phone into form on first render (if loaded and form empty)
6. Edit mode toggle shows/hides TextInput editability and save button
7. `handleSaveChanges()` calls:
   - `client.customerProfiles.upsert({ organizationId, phone })`
   - `authClient.updateUser({ name })` if name changed
   - Invalidates ["customerProfiles"] query
8. `handleToggleNotifPref()` calls `client.notificationPreferences.update({ organizationId, [key]: value })`
9. `handleLogout()` shows Alert confirming sign out, then calls `useAuth().logout()`
10. `ChangePasswordModal` opens on button press, collects old and new passwords, calls `authClient.changePassword()`

**Inputs:** organizationId (from context)
**State management:** Local form state (fullName, email, phone), isEditing, isSaving, showPasswordModal; TanStack Query for profile and notifPrefs
**Outputs:** Renders editable profile card, notification toggles, account actions; navigates to sign in on logout; shows modals and alerts
**Side effects:** Query invalidation on save; authClient calls (updateUser, changePassword); logout clears session; linking to external URLs (support email, terms, privacy)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.customerProfiles.get` — fetch user's phone and profile data
- `client.customerProfiles.upsert` — save phone number (oRPC, not wrapped in useQuery)
- `client.notificationPreferences.update` — save notification preference toggles
- `authClient.updateUser` — update auth user name via Better-Auth
- `authClient.changePassword` — change password via Better-Auth

**Uses these components:** TabContainer, ScrollView, Switch, TextInput, TouchableOpacity, Modal, Alert, Linking, View, Text, Ionicons
**Uses these hooks:** `useAuth()` (user, logout), `useOrganization()` (orgId), `useQuery()` (profile, notifPrefs), `useQueryClient()` (invalidate), `useState()`
**Navigation: who navigates here:** Dashboard tab/profile button
**Navigation: where it goes:** External URLs via Linking.openURL:
- `mailto:support@avantej.com` — Help & Support
- `https://avantej.com/terms` — Terms & Privacy
- Sign in (via logout) — `/(auth)/login` (router context not used; logout triggers session clear)

---

## 4. Data Shapes

**DB tables touched:**
- users (select name, email, createdAt; update name via Better-Auth)
- customerProfiles (select phone; upsert phone)
- notificationPreferences (select emailEnabled, pushEnabled, smsEnabled; update each toggle)

**Key types / Zod schemas:**
- formData: { fullName, email, phone } (strings)
- profile: { phone?, ...other fields }
- notifPrefs: { emailEnabled, pushEnabled, smsEnabled } (booleans)
- ChangePasswordModal props: { visible, onClose }
- changePassword input: { currentPassword, newPassword }
- updateUser input: { name }
- upsert customerProfiles input: { organizationId, phone }

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):**
- Profile phone field sync logic (conditional setter on render — potential infinite loop if not careful)
- Error handling for name update failure (silently caught, no user feedback)
- Password change validation edge cases
- Notification preference toggle error states
- Member since date formatting with missing createdAt
- External link deeplink handling on different platforms

---

## 6. Notes

- formData state sync (lines 54-57) is a side effect in render, should ideally use useEffect
- Email field read-only (opacity 0.5 visual hint)
- Save button only shows in edit mode; toggles edit mode on close
- Logout calls useAuth().logout() which clears queryClient and session
- Better-Auth updateUser may not support name updates (catch block suggests this)
- ChangePasswordModal is a nested function component, shared state with parent via prop callbacks
- Phone field only editable in edit mode (unlike email which is always disabled)
- Notification preferences toggle immediately (optimistic updates); errors shown in Alert
- External links use Linking.openURL for email and web URLs
