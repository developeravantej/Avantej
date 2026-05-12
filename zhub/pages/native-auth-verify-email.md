# Verify Email Screen

**Route:** `(auth)/verify-email`
**File:** `apps/native/app/(auth)/verify-email.tsx`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Display confirmation that a verification email was sent; allow resending if not received.
**Produces:** Screen showing email address, verification instructions, "Go to Sign In" button, and "Resend Verification Email" button.
**On success:** User clicks email link, then taps "Go to Sign In" to return to login screen.
**On failure / error states:** Resend button disabled for 30s after sending; loading spinner during resend request.

---

## 2. How It Works

**Execution flow:**
1. Receives `email` param from sign-up screen route
2. Displays email and instructions to click verification link
3. User can tap "Go to Sign In" to go back to login (doesn't require verification to log in)
4. User can resend verification email:
   - `handleResend()` calls `authClient.sendVerificationEmail({ email })`
   - Sets `resent=true` to disable button for 30s
   - setTimeout clears resent flag after 30s
   - Errors silently caught (line 25-26)

**Inputs:** email (from route params via useLocalSearchParams)
**State management:** Local state for isResending, resent (cooldown flag)
**Outputs:** Navigation to login on button press; visual feedback for resend state
**Side effects:** Router navigation; setTimeout for cooldown timer

---

## 3. What Depends On It

**Calls these API endpoints:** `authClient.sendVerificationEmail({ email })` → Better-Auth email verification request
**Uses these components:** SafeAreaView, TouchableOpacity, ActivityIndicator, Ionicons, View, Text
**Uses these hooks:** `useLocalSearchParams()` — to read email param from route
**Navigation: who navigates here:** Sign-up screen after successful account creation (with email param)
**Navigation: where it goes:** `/(auth)/login` via "Go to Sign In" button

---

## 4. Data Shapes

**DB tables touched:** email_verification_tokens (Better-Auth), users
**Key types / Zod schemas:** email string (from route params, type-safe via useLocalSearchParams<{ email: string }>)

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** Email delivery, token expiry, link click detection, resend rate limiting, missing email param handling

---

## 6. Notes

- Email param is optional in types but required for UX; missing email shows no message (UI breaks gracefully)
- Resend errors silently caught to prevent email enumeration (same pattern as forgot-password)
- Button text changes to "Email Sent" for 30s after successful resend (visual confirmation)
- User can navigate to sign in without verifying email (verification likely happens on first login or background)
- Uses mail-outline Ionicon to visually reinforce email-based flow
