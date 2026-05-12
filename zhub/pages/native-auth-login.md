# Login Screen

**Route:** `(auth)/login`
**File:** `apps/native/app/(auth)/login.tsx`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Sign in with email and password.
**Produces:** Login form with email, password, forgot password link, and sign in button; error display if credentials invalid.
**On success:** Navigates to `/(app)/dashboard` after successful authentication.
**On failure / error states:** Shows red error banner; button disabled while loading or form incomplete.

---

## 2. How It Works

**Execution flow:**
1. User enters email and password into TextInput fields
2. `handleLogin()` validates both fields are filled
3. Calls `useAuth().login(email, password)` hook
4. On success: clears error, calls `router.replace("/(app)/dashboard")`
5. On error: displays `err.message` in red banner

**Inputs:** email (string), password (string)
**State management:** Local state for email, password, isLoading, error
**Outputs:** Navigation to dashboard on success; error message on failure
**Side effects:** Router navigation (replace), query refetch via useAuth

---

## 3. What Depends On It

**Calls these API endpoints:** `useAuth().login()` → Better-Auth email sign-in
**Uses these components:** SafeAreaView, KeyboardAvoidingView, TextInput, TouchableOpacity, ActivityIndicator
**Uses these hooks:** `useAuth()` — authentication state and login function
**Navigation: who navigates here:** Auth check (redirects to login if not authenticated)
**Navigation: where it goes:** `/(app)/dashboard` on success; `/(auth)/forgot-password` via "Forgot Password?"; `/(auth)/sign-up` via "Sign Up"

---

## 4. Data Shapes

**DB tables touched:** users, sessions (Better-Auth)
**Key types / Zod schemas:** Email validation (email-address keyboard type), password required (8+ chars enforced on signup, not login)

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** Network error handling, rate limiting on failed attempts, session persistence after redirect

---

## 6. Notes

- Error display does not distinguish between invalid email vs invalid password (security best practice to prevent user enumeration)
- Uses `router.replace()` not `router.push()` so back button doesn't return to login
- Keyboard avoiding behavior differs by OS (padding on iOS, height on Android)
- Button opacity reduced when disabled (visual feedback for form validation)
