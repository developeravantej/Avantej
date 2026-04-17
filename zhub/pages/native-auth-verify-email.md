# Verify Email

**Route:** `/(auth)/verify-email`
**File:** `apps/native/app/(auth)/verify-email.tsx:1`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Confirms that a verification email was sent after registration, and lets the user resend it if needed.

**Produces:** A static informational screen showing a mail icon, the email address the link was sent to, two buttons ("Go to Sign In" and "Resend Verification Email"), and a 30-second cooldown after resend.

**On success:** User sees the screen after sign-up. Tapping "Go to Sign In" navigates to login. Tapping "Resend" triggers another verification email.

**On failure / error states:**
- Resend errors are silently swallowed.
- If the `email` param is absent, the email display is skipped and the resend button does nothing.
- While resending: `ActivityIndicator` replaces button text.

---

## 2. How It Works

**Execution flow:**
```
VerifyEmailScreen
  → useLocalSearchParams<{ email: string }>()
  → handleResend():
    → authClient.sendVerificationEmail({ email })
    → catch: silently swallow
    → setResent(true)
    → setTimeout(() => setResent(false), 30000)  // 30-second cooldown
  → "Go to Sign In" → router.replace("/(auth)/login")
```

**Inputs:**
- `email` route param (passed from sign-up screen)

**State management:**
- `isResending: boolean` — loading indicator during resend
- `resent: boolean` — 30-second cooldown after resend (disables button, shows "Email Sent")

**Outputs:**
- Static informational UI
- Resend button with cooldown state

**Side effects:**
- `authClient.sendVerificationEmail` triggers a verification email server-side.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `POST /api/auth/send-verification-email` — Better-Auth native endpoint (via `authClient.sendVerificationEmail`)

**Uses these components:**
- `authClient` — `apps/native/lib/auth-client.ts` — direct (not via `useAuth`)
- `SafeAreaView` — React Native / react-native-safe-area-context

**Navigation: who navigates here:**
- `apps/native/app/(auth)/sign-up.tsx` — on successful account creation (`router.replace`)

**Navigation: where it goes:**
- `/(auth)/login` — "Go to Sign In" button (`router.replace`)

---

## 4. Data Shapes

**DB tables touched:** Better-Auth `verification` table (control-panel DB) — token stored for email link.

**`authClient.sendVerificationEmail` payload:**
```typescript
{ email: string }
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- If `email` param is undefined (direct navigation without params), the resend call silently does nothing — no user feedback.
- The 30-second cooldown is client-side only; the server does not enforce rate limiting at this layer.
- No confirmation that the email was actually received or that the link works.

---

## 6. Notes

- This screen is reached via `router.replace` from sign-up, so back navigation bypasses it (no back button shown).
- `authClient` is imported directly rather than via `useAuth` — the verify-email screen does not need the full auth hook since there is no session to manage.
- The resend cooldown uses `setTimeout` which is not cleaned up on unmount — minor memory leak if user navigates away during the 30-second window.
- Silent error swallowing on resend is intentional to prevent email enumeration (same pattern as forgot-password screen).
