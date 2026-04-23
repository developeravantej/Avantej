# Forgot Password Screen

**Route:** `(auth)/forgot-password`
**File:** `apps/native/app/(auth)/forgot-password.tsx`
**Platform:** native
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Request a password reset email by entering their account email address.
**Produces:** Two states — (1) form with email input and send button, (2) success confirmation showing email received message.
**On success:** Shows "Check Your Email" message with info that reset link was sent; can navigate back to login.
**On failure / error states:** Silently succeeds even if email not found (prevents email enumeration); button disabled during request.

---

## 2. How It Works

**Execution flow:**
1. User enters email and presses "Send Reset Link"
2. `handleSubmit()` calls `useAuth().forgotPassword(email)`
3. Regardless of success/error, shows success screen (security: don't reveal if email exists)
4. Sets `sent=true` to display confirmation UI
5. 30-second cooldown before "Resend" becomes available again

**Inputs:** email (string)
**State management:** Local state for email, isLoading, sent (boolean)
**Outputs:** Two-state screen (form → success); no error display to user
**Side effects:** Router navigation (back to login); setTimeout for cooldown

---

## 3. What Depends On It

**Calls these API endpoints:** `useAuth().forgotPassword(email)` → Better-Auth password reset request
**Uses these components:** SafeAreaView, KeyboardAvoidingView, TextInput, TouchableOpacity, ActivityIndicator, Ionicons
**Uses these hooks:** `useAuth()` — forgotPassword function
**Navigation: who navigates here:** User taps "Forgot Password?" on login screen
**Navigation: where it goes:** `/(auth)/login` via "Back to Sign In" button on success

---

## 4. Data Shapes

**DB tables touched:** password_reset_tokens (Better-Auth), users
**Key types / Zod schemas:** email string, email-address keyboard type

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** Email delivery verification, token expiry handling, rate limiting on reset requests, actual email template content

---

## 6. Notes

- Intentionally catches all errors silently (line 28-29: `catch { }`) to prevent email enumeration attacks
- 30-second cooldown prevents rapid resend spam; UI shows "Email Sent" text while disabled
- Back button uses `router.back()` to return to login (respects navigation stack)
- No validation of email format before submit (relies on type="email-address" keyboard)
- Success state uses Ionicons check-circle and lock-closed icons for visual clarity
