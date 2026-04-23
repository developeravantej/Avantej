# App Root / Auth Router

**Route:** `index`
**File:** `apps/native/app/index.tsx`
**Platform:** native
**Auth required:** public (redirects based on auth status)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Entry point that checks authentication and routes to appropriate screen.
**Produces:** Loading spinner → Authenticated users see `/dashboard`, unauthenticated users see `/login`.
**On success:** Smooth redirect after `useAuth()` determines session state.
**On failure / error states:** Loading state with centered `ActivityIndicator`.

---

## 2. How It Works

**Execution flow:**
1. App renders → queries auth session via `useAuth()`
2. While `isPending` → show loading spinner
3. If `isAuthenticated` → `Redirect` to `/(app)/dashboard`
4. Else → `Redirect` to `/(auth)/login`

**Inputs:** None (hooks only)
**State management:** Auth session from `useAuth()` hook
**Outputs:** Conditional Redirect (no visible UI rendered, only loading state)
**Side effects:** Navigation redirects based on session presence

---

## 3. What Depends On It

**Calls these API endpoints:** None (auth check only via session context)
**Uses these components:** None
**Uses these hooks:** `useAuth()` from `@/hooks/useAuth`
**Navigation: who navigates here:** Expo Router (initial route)
**Navigation: where it goes:** `/(app)/dashboard` (authenticated) or `/(auth)/login` (unauthenticated)

---

## 4. Data Shapes

**DB tables touched:** None
**Key types / Zod schemas:** None (relies on session from auth-client)

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** Redirect logic, loading state timing

---

## 6. Notes

- This is the root router entry; all other navigation flows from here.
- Depends entirely on `useAuth()` correctly reading session from `authClient`.
- No data fetching—just route guards.
