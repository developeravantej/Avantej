# Drawer Home / Demo Screen

**Route:** `(drawer)/index`
**File:** `apps/native/app/(drawer)/index.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Demo/home screen within drawer navigation showing API status, user greeting, and auth/API connectivity info.
**Produces:** Welcome card with user name/email, API health check, private data fetch, and sign in/up components (if logged out).
**On success:** User session displayed, API status green, private data shown.
**On failure / error states:** API error (red status), auth errors handled by components.

---

## 2. How It Works

**Execution flow:**
1. Fetch health check via `orpc.healthCheck.queryOptions()`
2. Fetch private data via `orpc.privateData.queryOptions()`
3. Get session from `authClient.useSession()`
4. Render welcome card if user exists
5. Show API status indicator
6. Show private data section
7. Show SignIn/SignUp forms if not authenticated

**Inputs:** None (navigation params)
**State management:**
- TanStack Query: `healthCheck`, `privateData` queries
- Auth session from `authClient`
**Outputs:** Scrollable view with multiple information cards
**Side effects:** `signOut()` + `queryClient.invalidateQueries()` on logout button press

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.healthCheck` — checks API server connectivity
- `orpc.privateData` — fetches authenticated user data
**Uses these components:**
- `Container` (path: `@/components/container`) — wraps layout
- `SignIn` (path: `@/components/sign-in`) — login form
- `SignUp` (path: `@/components/sign-up`) — signup form
**Uses these hooks:** None (direct `authClient` usage)
**Navigation: who navigates here:** Drawer navigator
**Navigation: where it goes:** None (self-contained demo)

---

## 4. Data Shapes

**DB tables touched:** None (read-only queries)
**Key types / Zod schemas:**
- `healthCheck` response: `boolean` (connected or not)
- `privateData` response: object with `message` field

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** Error handling for API failures, SignOut mutation

---

## 6. Notes

- This is a demo/debug screen, not part of main user flow.
- API status display is visual-only (green/red indicator).
- SignOut invalidates all queries—may cause stale data on rapid re-login.
- SignIn/SignUp components are conditional and only shown if `!session?.user`.
