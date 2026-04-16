# Contact

**Route:** `/contact`
**File:** `apps/web/src/routes/contact.tsx:1`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Provides contact information and a contact form that opens the user's email client to send a message to Avantej support.

**Produces:** Opens the system email client via `mailto:` URL with pre-filled subject and body.

**On success:** `toast.success("Opening your email client...")` shown; `window.location.href` navigates to a `mailto:` URL.
**On failure / error states:** Zod validation errors shown inline for empty/invalid fields. No server error states (no API call made).

---

## 2. How It Works

**Execution flow:**
```
ContactPage
  → useForm (react-hook-form + zod)    # local form state only
  → form.onSubmit(data)
    → constructs mailto: URL
      → mailto:support@avantej.com?subject=...&body=...
    → window.location.href = mailtoUrl  # opens email client
    → toast.success(...)
```

**Inputs:**
- Form fields: `name`, `email`, `subject`, `message`

**State management:** `react-hook-form` local state only. No TanStack Query, no global state.

**Outputs:** Two-column layout:
- Left: contact details (General Inquiries, Technical Support, Headquarters address, social media buttons)
- Right: contact form card

**Side effects:** `window.location.href` redirect to `mailto:` URL (browser behavior, may not work in all environments).

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `Form`, `FormControl`, `FormField`, `FormItem`, `FormLabel`, `FormMessage` — `@/components/ui/form`
- `Input` — `@/components/ui/input`
- `Textarea` — `@/components/ui/textarea`
- `Button` — `@/components/ui/button`
- Icons: `MessageSquare`, `Zap`, `Building2`

**Uses these hooks:**
- `useForm` — react-hook-form with zodResolver

**Navigation: who navigates here:**
- No internal navigation found pointing to `/contact`. Accessible via direct URL or footer links.

**Navigation: where it goes:** None (opens external `mailto:` link, no in-app navigation).

---

## 4. Data Shapes

No DB tables touched. No API calls.

**Key types / Zod schemas:**
```
contactSchema = {
  name: string (min 2),
  email: string (email),
  subject: string (min 2),
  message: string (min 10)
}
```

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| `name` | text | required, min 2 chars | mailto body `From: {name}` |
| `email` | email | required, valid email | mailto body `({email})` |
| `subject` | text | required, min 2 chars | mailto `?subject=...` |
| `message` | textarea | required, min 10 chars | mailto body |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** N/A (no server interaction; `mailto:` behavior is browser-dependent).

---

## 6. Notes

- Form submission does NOT send data to any server — it constructs a `mailto:` URL and redirects. If the user has no email client configured, the form silently fails.
- Social media icon buttons (Facebook, Twitter, Instagram, YouTube) are placeholders that show `toast.info("Social links coming soon")` on click; all have `aria-disabled="true"`.
- Contact info is hardcoded: `info@avantej.com`, `support@avantej.com`, US phone numbers, San Francisco address. This is placeholder marketing copy.
