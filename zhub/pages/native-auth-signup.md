# Sign Up Screen

**Route:** `(auth)/sign-up`
**File:** `apps/native/app/(auth)/sign-up.tsx`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Create a new account with name, email, and password.
**Produces:** Multi-field form (firstName, lastName, email, password, confirmPassword); error banner; loading state.
**On success:** Navigates to `(auth)/verify-email` with email param; shows email verification screen.
**On failure / error states:** Shows error banner for validation (password mismatch, <8 chars, existing account); alert dialog for duplicate email.

---

## 2. How It Works

**Execution flow:**
1. User fills form (firstName, lastName, email, password, confirmPassword)
2. Form validates: all fields required, passwords match, password 8+ chars
3. `handleSignUp()` calls `useAuth().signUp()` with full name, email, password, first/last names
4. On success: navigates to verify-email with email param
5. On "already exists" error: shows Alert dialog offering sign in option
6. Other errors: displays error banner

**Inputs:** firstName, lastName, email, password, confirmPassword (strings)
**State management:** Local state for form fields, isLoading, error
**Outputs:** Navigation to verify-email screen; Alert dialog on duplicate account
**Side effects:** Router navigation with params; Alert.alert() for user feedback

---

## 3. What Depends On It

**Calls these API endpoints:** `useAuth().signUp()` → Better-Auth email signup
**Uses these components:** SafeAreaView, KeyboardAvoidingView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert
**Uses these hooks:** `useAuth()` — signup function
**Navigation: who navigates here:** Auth check (redirects here if not signed up)
**Navigation: where it goes:** `/(auth)/verify-email` on success (with email param); `/(auth)/login` if account exists (via Alert)

---

## 4. Data Shapes

**DB tables touched:** users, sessions (Better-Auth)
**Key types / Zod schemas:**
- firstName, lastName: strings, auto-capitalized
- email: string, email-address keyboard
- password: string, 8+ chars minimum
- Sent to signUp as: `{ name: "${firstName} ${lastName}", email, password, firstName, lastName }`

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** Duplicate email error flow, password validation edge cases, concurrent signup attempts

---

## 6. Notes

- Detects "already exists" error by checking `err.message?.includes("already exists")`
- ScrollView with `keyboardShouldPersistTaps="handled"` to allow field interaction while keyboard open
- Button disabled when form incomplete (all 5 fields required)
- Name parsing on backend may differ from input if user enters non-standard format
