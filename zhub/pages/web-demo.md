# Demo

**Route:** `/demo`
**File:** `apps/web/src/routes/demo.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets prospective customers request a product demo by submitting their contact details, which opens a pre-filled email to Avantej support.

**Produces:** Opens the system email client via `mailto:` URL with a pre-filled demo request message.

**On success:** `toast.success("Opening your email client...")` shown; `window.location.href` navigates to a `mailto:` URL.
**On failure / error states:** Zod validation errors shown inline for invalid/missing required fields. No server error states (no API call made).

---

## 2. How It Works

**Execution flow:**
```
DemoPage
  → useForm (react-hook-form + zod)    # local form state only
  → form.onSubmit(data)
    → constructs body text lines (name, email, optional company, optional message)
    → constructs mailto: URL
      → mailto:support@avantej.com?subject=Demo+Request&body=...
    → window.location.href = mailtoUrl  # opens email client
    → toast.success(...)
```

**Inputs:**
- Form fields: `name` (required), `email` (required), `company` (optional), `message` (optional)

**State management:** `react-hook-form` local state only. No TanStack Query, no global state.

**Outputs:** Hero section + centered `Card` containing the form.

**Side effects:** `window.location.href` redirect to `mailto:` URL.

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `Card`, `CardContent`, `CardDescription`, `CardHeader`, `CardTitle` — `@/components/ui/card`
- `Form`, `FormControl`, `FormField`, `FormItem`, `FormLabel`, `FormMessage` — `@/components/ui/form`
- `Input` — `@/components/ui/input`
- `Textarea` — `@/components/ui/textarea`
- `Button` — `@/components/ui/button`

**Uses these hooks:**
- `useForm` — react-hook-form with zodResolver

**Navigation: who navigates here:**
- No internal navigation found pointing to `/demo`. Accessible via direct URL or landing page CTAs.

**Navigation: where it goes:** None (opens external `mailto:` link, no in-app navigation).

---

## 4. Data Shapes

No DB tables touched. No API calls.

**Key types / Zod schemas:**
```
demoSchema = {
  name: string (min 2),
  email: string (email),
  company: string (optional),
  message: string (optional)
}
```

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| `name` | text | required, min 2 chars | mailto body `From: {name}` |
| `email` | email | required, valid email | mailto body `({email})` |
| `company` | text | optional | mailto body `Company: {company}` (omitted if empty) |
| `message` | textarea | optional | mailto body (defaults to "I would like to request a demo of Avantej.") |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** N/A (no server interaction).

---

## 6. Notes

- Form submission does NOT send data to any server — constructs a `mailto:` URL. If the user has no email client configured, the form silently fails to deliver the request.
- Default message when `data.message` is empty: `"I would like to request a demo of Avantej."` — ensures the email body is never blank.
- `null` lines (e.g., missing company) are filtered out before joining to avoid blank lines in the email body.
- This is a placeholder marketing page; a real demo booking system (e.g., Calendly integration) is not implemented.
