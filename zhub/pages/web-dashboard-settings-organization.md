# Organization Settings

**Route:** `/dashboard/settings/organization`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/organization.tsx`
**Platform:** web
**Auth required:** authenticated (admin only for changes)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Configure organization-wide defaults: grace period for overdue accounts, default commission percentage for staff, and locale (date/currency formatting).
**Produces:** Form with 3 fields, admin-only lock badge, and save button (disabled for non-admins).
**On success:** Toast "Settings saved"; form updates reflect new values.
**On failure / error states:** Form reverts to previous values; error toast shown.

---

## 2. How It Works

**Execution flow:**
1. Page loads; `useUserContext()` reads `organizationId` and checks `hasRole(["admin"])`
2. Three separate `useQuery` calls fetch each setting via `client.organizationSettings.get({ organizationId, key })`
3. `useEffect` waits for all queries to resolve, then pre-fills form with API values (or defaults if null)
4. User edits fields (disabled if not admin)
5. On submit: `handleSave()` fires three parallel `client.organizationSettings.upsert()` calls
6. If any fails: revert form to previous values, show error toast
7. If all succeed: show success toast, form stays with new values

**Inputs:**
- `gracePeriodDays` (1–365): days before account is overdue
- `commissionPct` (0–100): default commission for staff
- `locale` ("en-MY" | "en-US"): affects date/currency formatting

**State management:**
- TanStack Query: three separate keys:
  - `["organizationSettings", organizationId, "grace_period_days"]`
  - `["organizationSettings", organizationId, "commission_percentage"]`
  - `["organizationSettings", organizationId, "locale"]`
- React Hook Form: controlled inputs with Zod validation
- Local: `isLoading` = OR of three query loading states

**Outputs:**
- Form with 3 input/select fields
- Admin badge if user is not admin
- Save button (enabled only if admin + not submitting)
- Help text below each field

**Side effects:**
- No query invalidation on save (relies on form.reset)
- Form reverted to previous values on error

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.organizationSettings.get({ organizationId, key: "grace_period_days" })` — fetch
- `client.organizationSettings.get({ organizationId, key: "commission_percentage" })` — fetch
- `client.organizationSettings.get({ organizationId, key: "locale" })` — fetch
- `client.organizationSettings.upsert({ organizationId, key, value })` — save (×3 parallel)

**Uses these components:**
- Form (react-hook-form + shadcn/ui): `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`
- Input, Select (controlled via form), Button
- Badge — admin-only indicator
- Custom `FieldSkeleton` — loading placeholder

**Uses these hooks:**
- `useUserContext()` — org ID, admin check
- `useQuery()` (×3) — fetch settings
- `useForm()` — form state
- `useEffect()` — pre-fill on query resolution

**Navigation: who navigates here:** Settings sidebar
**Navigation: where it goes:** None (settings page)

---

## 4. Data Shapes

**DB tables touched:** `organizationSettings` (multi-tenant per org)
**Key types / Zod schemas:**
```typescript
const orgSettingsSchema = z.object({
  gracePeriodDays: z.coerce.number().int().min(1).max(365),
  commissionPct: z.coerce.number().min(0).max(100),
  locale: z.enum(["en-MY", "en-US"]),
});

type OrgSettingsValues = z.infer<typeof orgSettingsSchema>;

// API returns per-key:
{
  value: string;  // e.g., "7", "5.5", "en-MY"
}
```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** None
**Not tested (risk areas):**
- Admin role check (RBAC enforcement)
- Error handling and form revert logic
- Parallel upsert race conditions
- Integer vs. float coercion for commission

---

## 6. Notes

**Three separate queries:** Each setting is fetched independently with its own React Query key. This means updates to one field won't refresh the others, but allows partial loading states. If one API call fails, the others may still succeed on submit.

**Admin-only UI:** Non-admins see the form but all inputs are `disabled={!isAdmin}` (lines 221, 251, 277). A badge (line 192) and help text (line 308) inform them they lack permissions.

**Form reset on error:** `handleSave()` uses `form.getValues()` to snapshot current values before submit. If any upsert fails, the form is reverted: `form.reset(previousValues)` (line 152). This prevents partial updates from persisting in the UI.

**Locale options:** Only two options (Malaysia, USA). Additional locales would require updating the Zod enum and SelectContent.

**Number coercion:** Input `type="number"` fields use `z.coerce.number()` to parse string input to number. Grace period is `.int()` (no decimals); commission allows decimals.

**Parallel saves:** All three upserts fire in a single Promise.all() (line 133–149). If one fails, the entire operation fails and form reverts.

**No mutation loading state:** The form doesn't show a loading indicator during submit; instead, the save button's `disabled` prop checks `form.formState.isSubmitting` (line 303).
