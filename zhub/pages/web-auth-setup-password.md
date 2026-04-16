# Setup Password

**Route:** `/setup-password`
**File:** `apps/web/src/routes/(auth)/setup-password.tsx:1`
**Platform:** web
**Auth required:** public (token-validated)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Allows a newly invited user to set their initial password using a one-time setup token sent via email.

**Produces:** A created password for the account; on success the user is redirected to `/onboarding`.

**On success:** `toast.success("Password set up successfully! Redirecting to onboarding...")` shown; `access_token` stored in `localStorage.authToken`; navigate to `/onboarding`.
**On failure / error states:**
- No token in URL → `toast.error("No setup token provided")` + redirect to `/login`
- Token expired → `toast.error("Password setup link has expired")` + redirect to `/login`
- Token already used → `toast.info("Password already set for this account")` + redirect to `/login`
- HTTP error during validation → `toast.error("Invalid or expired password setup link")` + redirect to `/login`
- While validating: spinner shown ("Validating setup link...")
- Server error on submit → `toast.error(errorMessage)`

---

## 2. How It Works

**Execution flow:**
```
SetupPasswordPage (mounts)
  → useEffect: validateToken()
    → GET {serverUrl}/api/v1/auth-setup/setup-token-info/{token}
      → returns TokenInfo { email, full_name, is_expired, already_has_password }
    → if expired/already_has_password → navigate("/login")
  → form submit → setupPasswordMutation.mutate()
    → POST {serverUrl}/api/v1/auth-setup/setup-password
      → body: { token, password }
      → returns { access_token, user_id, email, full_name }
    → localStorage.setItem("authToken", access_token)
    → navigate("/onboarding")
```

**Inputs:**
- Query param: `token` (string, optional — validated by `validateSearch`)
- Form fields: `password`, `confirmPassword`

**State management:**
- `useState<TokenInfo | null>` — holds validated token data (name, email)
- `useState<boolean>` — `isValidatingToken` controls loading spinner
- `useMutation` (TanStack Query) — `setupPasswordMutation` for the submit call
- `useSearch` reads `token` from URL

**Outputs:** Full-page card showing user's name and email (from token), two password fields, submit button with loading spinner.

**Side effects:** Stores `access_token` in `localStorage` under key `"authToken"`. Does not set a Better-Auth session cookie (relies on token-based auth for onboarding flow).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `GET {serverUrl}/api/v1/auth-setup/setup-token-info/{token}` — validates the setup token (NOTE: this endpoint is not registered in the current server routes; may be unimplemented or served by a different service)
- `POST {serverUrl}/api/v1/auth-setup/setup-password` — sets the password and returns an access token

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle` — `@/components/ui/card`
- `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` — `@/components/ui/form`
- `Input`, `Button` — `@/components/ui/`

**Uses these hooks:**
- `useNavigate`, `useSearch` — TanStack Router
- `useMutation` — TanStack Query
- `useForm` — react-hook-form with zod

**Navigation: who navigates here:**
- Email links (external) containing `?token=<setup_token>`

**Navigation: where it goes:**
- `/login` — on any token validation failure
- `/onboarding` — on successful password setup

---

## 4. Data Shapes

**DB tables touched:**
None directly from the frontend. The server-side `auth-setup` endpoints handle DB operations (not verified — endpoint not found in current server source).

**Key types / Zod schemas:**
- Form schema: `{ password: string (min 8), confirmPassword: string (min 8) }` with `.refine` that passwords match
- `TokenInfo` interface: `{ email, full_name, is_expired, expires_at, already_has_password }`
- `validateSearch`: `z.object({ token: z.string().optional() })`
- Success response: `{ access_token: string, user_id: string, email: string, full_name: string }`

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| `password` | password | required, min 8 chars | POST body `password` |
| `confirmPassword` | password | required, min 8, must match password | client-side only |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Token validation failure paths, already-set password redirect, password mismatch UI.

---

## 6. Notes

- **Critical gap:** The API endpoint `GET /api/v1/auth-setup/setup-token-info/{token}` and `POST /api/v1/auth-setup/setup-password` are called but NOT registered in `apps/server/src/index.ts`. This page will fail at runtime unless these endpoints exist on a different server or path.
- The page stores `access_token` in `localStorage` (not a Better-Auth cookie), which diverges from the rest of the auth system that uses Better-Auth cookies. This token may not be consumed by any existing middleware.
- Uses `useSearch({ strict: false })` with a manual type cast — less safe than the strict form used in other routes.
