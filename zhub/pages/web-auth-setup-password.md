# Set Up Password Page

**Route:** `/setup-password`
**File:** `apps/web/src/routes/(auth)/setup-password.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Set password for newly invited users via a one-time token. Validates token, shows user's email/name, and allows them to create a password before proceeding to onboarding.

**Produces:** Token validation spinner, then password setup card with form (2 password fields, account info display), submit button. Error redirects to login.

**On success:** Password set, access token stored in localStorage, user redirected to `/onboarding` to create organization.
**On failure / error states:** Expired token → toast + redirect to login. Already has password → toast + redirect to login. Invalid token → error message + redirect. Loading state shows spinner during validation.

---

## 2. How It Works

**Execution flow:**
1. Component mounts, reads `token` from URL search params
2. useEffect validates token by fetching `/api/v1/auth-setup/setup-token-info/{token}`
3. Response contains `TokenInfo` with email, full_name, is_expired, already_has_password flags
4. If expired or already has password → toast + redirect to login
5. User fills password + confirm password, form validates with Zod
6. On submit: POST to `/api/v1/auth-setup/setup-password` with token + password
7. Response includes access_token, user_id, email, full_name
8. access_token stored in localStorage, user redirected to `/onboarding`

**Inputs:** 
- URL search param: `token` (string, required)
- Form inputs: `password`, `confirmPassword` (min 8 chars, must match)

**State management:** 
- Local state: `tokenInfo` (TokenInfo object), `isValidatingToken` (boolean)
- react-hook-form + Zod for form validation
- TanStack React Query `useMutation` for submit handler

**Outputs:** 
- Renders loading spinner or password form
- Mutation: POST to `/api/v1/auth-setup/setup-password`
- Side effect: localStorage.setItem('authToken', token)
- Navigation: to `/onboarding` or `/login`

**Side effects:** 
- Token validation on mount
- Token info fetched and displayed (email, name)
- Access token stored in client localStorage (auth state)

---

## 3. What Depends On It

**Calls these API endpoints:** 
- `GET /api/v1/auth-setup/setup-token-info/{token}` — validates token, returns user info
- `POST /api/v1/auth-setup/setup-password` — sets password, returns auth token

**Uses these components:** 
- `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle` — shadcn/ui
- `Input` — shadcn/ui text input
- `Form`, `FormControl`, `FormField`, `FormItem`, `FormLabel`, `FormMessage` — shadcn/ui form components
- `Loader2` icon — lucide-react

**Uses these hooks:** 
- `useNavigate()` — TanStack Router
- `useSearch()` — TanStack Router
- `useState`, `useEffect` — React
- `useMutation` — TanStack React Query
- `useForm()` + `zodResolver` — react-hook-form + Zod

**Navigation: who navigates here:** 
- `/subscribe` page — after guest checkout with password setup required
- Email link from invite system (auth server generates URL with token)

**Navigation: where it goes:** 
- `/onboarding` — on successful password setup
- `/login` — if token invalid/expired/already used

---

## 4. Data Shapes

**DB tables touched:** 
- `users` (controlPanelDb, shared) — read during token validation, update on password set
- Auth/token system (backend-specific) — validate and consume one-time token

**Key types / Zod schemas:** 
- TokenInfo (interface):
  ```
  {
    email: string,
    full_name: string,
    is_expired: boolean,
    expires_at: string,
    already_has_password: boolean
  }
  ```
- Form input schema:
  ```
  {
    password: string (min 8),
    confirmPassword: string (min 8)
  }
  ```
  with refinement: password === confirmPassword
- API response:
  ```
  {
    access_token: string,
    user_id: string,
    email: string,
    full_name: string
  }
  ```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- Token expiration boundary (e.g., token expires between validation check and submit)
- Concurrent requests (double-submit before first completes)
- localStorage.setItem failure (quota exceeded, private browsing, etc.)
- Race condition if user navigates away during token validation
- Error response parsing (error.response?.data?.detail handling may fail if structure differs)

---

## 6. Notes

- API calls use raw fetch() instead of oRPC client — inconsistent with rest of codebase
- Token validation happens only on mount — if token expires during form interaction, submit will fail
- Error messages in catch block check for specific strings ("already set", "expired") — fragile if error messages change server-side
- localStorage used for auth token rather than cookie/session — needs careful handling in auth flow
- Component has unusual early-return pattern: loading state returns spinner, then checks tokenInfo before rendering form
- Redirect happens inside fetch callback rather than useEffect — can cause "setState on unmounted component" warnings

