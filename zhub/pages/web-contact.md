# Contact Page

**Route:** `/contact`
**File:** `apps/web/src/routes/contact.tsx`
**Platform:** web
**Auth required:** public
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Contact form and company contact information (email, phone, address). Allows users to send messages directly via email client (mailto: links).

**Produces:** Two-column layout: left column has contact info (General Inquiries, Technical Support, Headquarters address) + social media buttons (Facebook, Twitter, Instagram, LinkedIn, YouTube). Right column has form (name, email, subject, message).

**On success:** Form submits via `mailto:` URL, opens default email client with pre-filled subject/body.
**On failure / error states:** Form validation errors show below fields (email format, message length). Toast shows success message.

---

## 2. How It Works

**Execution flow:**
1. Component mounts, initializes form with react-hook-form + Zod schema
2. User fills form (name, email, subject, message) — min length validations applied
3. On submit: builds `mailto:` URL with encoded subject + body
4. window.location.href = mailtoUrl opens email client
5. Toast shows "Opening your email client..."

**Inputs:** 
- Form inputs: `name` (min 2), `email` (valid email), `subject` (min 2), `message` (min 10)

**State management:** 
- react-hook-form + Zod schema for form validation
- Local form state managed by hook

**Outputs:** 
- Renders contact form + contact info sections
- Side effect: opens mailto: URL in browser
- Mutation: none (client-side only)

**Side effects:** 
- Opens email client via window.location.href
- Toast notification

---

## 3. What Depends On It

**Calls these API endpoints:** None
**Uses these components:** 
- `Button`, `Input`, `Textarea`, `Form*` (FormField, FormControl, FormItem, FormLabel, FormMessage) — shadcn/ui
- lucide-react icons (MessageSquare, Zap, Building2)
- HTML form elements

**Uses these hooks:** 
- `useForm()` + `zodResolver()` — react-hook-form + Zod
- No React Router hooks (form submission is client-side)

**Navigation: who navigates here:** 
- Contact links from marketing pages (if linked)
- Direct URL `/contact`

**Navigation: where it goes:** None (stays on page, opens email client in system)

---

## 4. Data Shapes

**DB tables touched:** None
**Key types / Zod schemas:** 
- contactSchema (Zod):
  ```
  {
    name: string (min 2),
    email: string (valid email),
    subject: string (min 2),
    message: string (min 10)
  }
  ```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):** 
- mailto: URL encoding edge cases (special characters in message)
- Email client not installed on system (window.location.href fails silently)
- Social media button clicks (disabled with "Coming soon" toast)
- Form submission if user has no default email client configured
- Very long message text may exceed URL length limits

---

## 6. Notes

- Social media buttons are disabled/non-functional — show "Coming soon" toast
- Uses mailto: for submission rather than backend endpoint — no email is actually sent to support, it's user's responsibility to send
- Contact addresses and phone numbers are hardcoded (demo/placeholder: "123 Business Plaza, San Francisco CA 94107")
- Form doesn't actually send data anywhere — relies on user's email client to compose message
- Button text says "Send Message" but actually opens email client

