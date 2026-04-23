# Demo Request Page

**Route:** `/demo`
**File:** `apps/web/src/routes/demo.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Allow prospective customers to request a demo of Avantej by filling out a contact form.

**Produces:** A hero section describing Avantej, a form card with fields for name, email, company, and message, and a submit button.

**On success:** Opens the user's default email client with a pre-composed mailto URL to `support@avantej.com` with the form data in the subject and body. Toast notification shows "Opening your email client...".

**On failure / error states:** Form validation errors display below respective fields (required email format, minimum name length). No async errors since form directly opens mailto URL.

---

## 2. How It Works

**Execution flow:** User fills form → handleSubmit validates with Zod schema → constructs mailto URL from form data → navigates browser to mailto → success toast shown

**Inputs:** Form fields (name, email, company, message)

**State management:** React Hook Form with Zod validation; local form state only

**Outputs:** Redirects to mailto URL; no API calls or database updates

**Side effects:** Opens system email client via `window.location.href`

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Card, CardContent, CardHeader, CardTitle` — `@/components/ui/card` — layout
- `Form, FormControl, FormField, FormItem, FormLabel, FormMessage` — `@/components/ui/form` — form rendering
- `Button` — `@/components/ui/button` — submit button
- `Input` — `@/components/ui/input` — text input fields
- `Textarea` — `@/components/ui/textarea` — message field

**Uses these hooks:** `useForm` (react-hook-form)

**Navigation: who navigates here:** Public landing page, marketing site links

**Navigation: where it goes:** Nowhere (mailto redirect only)

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:**
```typescript
demoSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().optional(),
})
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** None

**Not tested (risk areas):** Form validation, mailto URL encoding, edge cases in name/email sanitization

---

## 6. Notes

- No persistence or backend integration — form submission is purely client-side mailto.
- Company and message fields are optional.
- Default message if none provided: "I would like to request a demo of Avantej."
- Uses `encodeURIComponent` for URL-safe encoding of form fields.
