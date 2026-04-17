# Login

**Route:** `/(auth)/login`
**File:** `apps/native/app/(auth)/login.tsx:1`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Sign in to an existing account with email and password.

**Produces:** A centered login form card with email/password fields, a "Forgot Password?" link, and a "Sign In" button. Logo at the top.

**On success:** Session is created, TanStack Query cache is refetched, and the user is navigated to `/(app)/dashboard` via `router.replace`.

**On failure / error states:**
- Inline error banner (red) shown below the form header for auth failures.
- Button is disabled (opacity 0.6) while loading or when either field is empty.

---

## 2. How It Works

**Execution flow:**
```
LoginScreen
  → useAuth() → { login }
  → handleLogin():
    → authClient.signIn.email({ email, password })
    → on error: throw → setError(err.message)
    → on success: refetch session → queryClient.refetchQueries()
    → router.replace("/(app)/dashboard")
```

**Inputs:**
- `email: string` — email-type keyboard, no autocapitalize
- `password: string` — secureTextEntry

**State management:**
- `email`, `password`, `isLoading`, `error` — all local useState

**Outputs:**
- Navigation to `/(app)/dashboard` on success
- Inline error display on failure

**Side effects:**
- Better-Auth session cookie set by `authClient.signIn.email`
- Full TanStack Query cache refetch after login

---

## 3. What Depends On It

**Calls these API endpoints:**
- `POST /api/auth/sign-in/email` — Better-Auth native endpoint (via `authClient.signIn.email`)

**Uses these components:**
- `useAuth` — `apps/native/hooks/useAuth.ts` — wraps authClient calls
- `authClient` — `apps/native/lib/auth-client.ts` — Better-Auth client
- `SafeAreaView`, `KeyboardAvoidingView` — React Native built-ins

**Navigation: who navigates here:**
- App root / `(auth)` layout — shown by default when unauthenticated
- `apps/native/app/(auth)/sign-up.tsx` — "Sign In" link at the bottom
- `apps/native/app/(auth)/forgot-password.tsx` — "Back to Sign In" button (after reset sent)
- `apps/native/app/(auth)/verify-email.tsx` — "Go to Sign In" button

**Navigation: where it goes:**
- `/(app)/dashboard` — successful login (`router.replace`)
- `/(auth)/forgot-password` — "Forgot Password?" link

---

## 4. Data Shapes

**DB tables touched:** Better-Auth `sessions`, `accounts` tables (via control-panel DB).

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| email | `string` | non-empty (client only) | `authClient.signIn.email.email` |
| password | `string` | non-empty (client only) | `authClient.signIn.email.password` |

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- No client-side email format validation (only non-empty check).
- Error message is taken directly from `err.message` — could expose internal server messages to users.
- `queryClient.refetchQueries()` refetches all queries; may cause unnecessary network requests on login.

---

## 6. Notes

- Uses `router.replace` (not `push`) so back navigation from dashboard does not return to login.
- The `KeyboardAvoidingView` behavior is `"padding"` on iOS and `"height"` on Android — standard pattern.
- `useAuth` wraps the Better-Auth client; the actual session cookie is managed by Better-Auth's native client, not via HTTP cookies (uses secure storage on native).
