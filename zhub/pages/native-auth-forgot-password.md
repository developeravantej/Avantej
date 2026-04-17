# Forgot Password

**Route:** `/(auth)/forgot-password`
**File:** `apps/native/app/(auth)/forgot-password.tsx:1`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Request a password reset email by entering an email address.

**Produces:** A centered form with an email field and a "Send Reset Link" button. After submission, switches to a success confirmation view regardless of whether the email exists.

**On success:** Always shows the "Check Your Email" confirmation screen (email enumeration prevention). User is then directed back to sign in.

**On failure / error states:**
- API errors are silently caught — the `sent` state is set to `true` regardless of outcome.
- Button is disabled while loading or email field is empty.

---

## 2. How It Works

**Execution flow:**
```
ForgotPasswordScreen
  → useAuth() → { forgotPassword }
  → handleSubmit():
    → authClient.forgetPassword({ email, redirectTo: "/(auth)/login" })
    → catch: silently swallow (enumeration prevention)
    → finally: setIsLoading(false); setSent(true)
  → if sent: render success view
    → "Back to Sign In" → router.replace("/(auth)/login")
```

**Inputs:**
- `email: string` — email-type keyboard, no autocapitalize

**State management:**
- `email: string`, `isLoading: boolean`, `sent: boolean` — local useState

**Outputs:**
- Two UI states: form view and success confirmation view (controlled by `sent`)

**Side effects:**
- Triggers Better-Auth `forgetPassword` which sends a password reset email server-side.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `POST /api/auth/forget-password` — Better-Auth native endpoint (via `authClient.forgetPassword`)

**Uses these components:**
- `useAuth` — `apps/native/hooks/useAuth.ts` — wraps `authClient.forgetPassword`
- `authClient` — `apps/native/lib/auth-client.ts`
- `SafeAreaView`, `KeyboardAvoidingView` — React Native built-ins

**Navigation: who navigates here:**
- `apps/native/app/(auth)/login.tsx` — "Forgot Password?" link

**Navigation: where it goes:**
- `/(auth)/login` — "Back to Sign In" button on success view (`router.replace`)
- `router.back()` — back arrow on the form view

---

## 4. Data Shapes

**DB tables touched:** Better-Auth `verification` table (control-panel DB) — token stored for reset link.

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| email | `string` | non-empty (client only) | `authClient.forgetPassword.email` |

**`authClient.forgetPassword` payload:**
```typescript
{
  email: string,
  redirectTo: "/(auth)/login",  // deep-link for reset email CTA
}
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- `redirectTo: "/(auth)/login"` is an Expo Router path, not an HTTP URL. Whether Better-Auth handles this correctly as a deep-link redirect depends on the app's URL scheme configuration.
- No email format validation.
- Silent error swallowing means genuine server errors (e.g. 500) are invisible to the user.

---

## 6. Notes

- The deliberate silence on errors is documented in a code comment: "Always show success to prevent email enumeration."
- After the `sent` state is set, the form is replaced with the success view — there is no way to go back to the form without navigating away and returning.
- `forgotPassword` in `useAuth` also re-throws if `result.error` is set, but `handleSubmit` catches all errors — so the throw in `useAuth` is effectively no-op in this screen.
