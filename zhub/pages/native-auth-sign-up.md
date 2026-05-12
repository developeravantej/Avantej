# Sign Up

**Route:** `/(auth)/sign-up`
**File:** `apps/native/app/(auth)/sign-up.tsx:1`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Create a new account with first name, last name, email, and password.

**Produces:** A scrollable registration form card with 5 fields, a "Create Account" button, and a link back to sign in.

**On success:** Account is created and the user is navigated to `/(auth)/verify-email` with the registered email address passed as a param.

**On failure / error states:**
- Inline error banner for password mismatch, password too short (< 8 chars), or server-side error.
- If email already exists: an `Alert.alert` dialog with a "Sign In" option that navigates to login.
- Button disabled (opacity 0.6) while loading or any field is empty.

---

## 2. How It Works

**Execution flow:**
```
SignUpScreen
  → useAuth() → { signUp }
  → handleSignUp():
    → client-side validation: all fields non-empty, passwords match, password >= 8 chars
    → authClient.signUp.email({ name, email, password, firstName, lastName })
    → on "already exists" error: Alert.alert → router.replace("/(auth)/login")
    → on other error: setError(err.message)
    → on success: router.replace({ pathname: "/(auth)/verify-email", params: { email } })
```

**Inputs:**
- `firstName`, `lastName`, `email`, `password`, `confirmPassword` — all local string state

**State management:**
- `firstName`, `lastName`, `email`, `password`, `confirmPassword`, `isLoading`, `error` — local useState

**Outputs:**
- Navigation to `/(auth)/verify-email` on success
- Alert dialog on duplicate email
- Inline error on validation failure

**Side effects:**
- Creates a Better-Auth user record and sends verification email (server-side on sign-up).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `POST /api/auth/sign-up/email` — Better-Auth native endpoint (via `authClient.signUp.email`)

**Uses these components:**
- `useAuth` — `apps/native/hooks/useAuth.ts`
- `authClient` — `apps/native/lib/auth-client.ts`
- `SafeAreaView`, `KeyboardAvoidingView`, `ScrollView` — React Native built-ins

**Navigation: who navigates here:**
- `apps/native/app/(auth)/login.tsx` — "Sign Up" link at the bottom

**Navigation: where it goes:**
- `/(auth)/verify-email` — on successful account creation; passes `{ email }`
- `/(auth)/login` — duplicate email Alert → "Sign In" action (`router.replace`)

---

## 4. Data Shapes

**DB tables touched:** Better-Auth `users`, `accounts` tables (control-panel DB).

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| firstName | `string` | non-empty | `authClient.signUp.email.firstName` |
| lastName | `string` | non-empty | `authClient.signUp.email.lastName` |
| email | `string` | non-empty | `authClient.signUp.email.email` |
| password | `string` | non-empty, >= 8 chars | `authClient.signUp.email.password` |
| confirmPassword | `string` | matches password | (local check only) |

**`authClient.signUp.email` payload:**
```typescript
{
  name: `${firstName} ${lastName}`,
  email: string,
  password: string,
  firstName: string,
  lastName: string,
}
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- No email format validation — any non-empty string is accepted client-side.
- `useAuth.signUp` throws `"An account with this email already exists"` when `result.data` is falsy, but the component checks `err.message?.includes("already exists")` — relies on exact string match.
- Scroll position not reset on error; user may need to scroll up to see the error banner.

---

## 6. Notes

- `name` is built as `"${firstName} ${lastName}"` and also passed separately as `firstName`/`lastName` — Better-Auth stores both.
- Uses `router.replace` to navigate to verify-email so back navigation does not return to the form.
- The `ScrollView` wraps the whole form to handle tall content on small screens when the keyboard is open — needed because 5 fields exceed typical screen height.
- `keyboardShouldPersistTaps="handled"` ensures tapping outside dismisses keyboard on Android.
