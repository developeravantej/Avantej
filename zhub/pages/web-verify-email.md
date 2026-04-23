# Email Verification Page

**Route:** `/verify-email`
**File:** `apps/web/src/routes/verify-email.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Verify a user's email address using a token from an email link, then redirect to a callback URL (typically login or dashboard).

**Produces:** A centered card showing verification status (loading spinner, success checkmark, or error message).

**On success:** Displays "Email verified. Redirecting…" with green checkmark, then navigates to `callbackURL` after 1.2s delay (defaults to `/login`).

**On failure / error states:** Displays "Verification failed" with red X icon and error message if token is missing, invalid, or expired.

---

## 2. How It Works

**Execution flow:** Page mounts → useEffect reads token from search params → calls `client.auth.verifyEmail(token)` → updates status → navigates after delay

**Inputs:** Query params `token` (required), `callbackURL` (optional, defaults to `/login`)

**State management:** Local state for status and error message; cleanup via cancelled flag to prevent updates after unmount

**Outputs:** API call to verify email; navigation to callback URL on success

**Side effects:** Timer for redirect delay; calls useNavigate on success

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.auth.verifyEmail({ token })` — verifies email with backend

**Uses these components:**
- `Card, CardContent, CardDescription, CardHeader, CardTitle` — `@/components/ui/card` — layout
- `Loader2, CheckCircle, XCircle` — lucide-react icons — status indicators

**Uses these hooks:**
- `useSearch` — TanStack Router — extract query params
- `useNavigate` — TanStack Router — navigate after success

**Navigation: who navigates here:** Email verification links in signup/password reset emails

**Navigation: where it goes:** Callback URL from query params (default `/login`)

---

## 4. Data Shapes

**DB tables touched:** (Backend only: users table to mark email_verified)

**Key types / Zod schemas:**
```typescript
// Validated search params
{ token: string; callbackURL: string }  // callbackURL normalized to relative path only
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** None

**Not tested (risk areas):** Token validation, XSS via callbackURL, race conditions if user navigates away quickly

---

## 6. Notes

- Search param validation enforces relative paths for `callbackURL` to prevent open redirect attacks.
- Cleanup function prevents state updates after unmount.
- No explicit error handling for network failures beyond catch block logging.
- 1.2s redirect delay allows user to see success state before redirect.
