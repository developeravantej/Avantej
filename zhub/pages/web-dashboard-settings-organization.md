# Organization Settings

**Route:** `/dashboard/settings/organization`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/organization.tsx:1`
**Platform:** web
**Auth required:** authenticated (admin-only save; non-admins can view but not edit)
**Last updated:** 2026-04-21

---

## 1. What It Does

**Purpose (user perspective):** Configure organization-wide operational defaults — grace period for overdue accounts, default commission percentage for staff sales, and locale for date/number formatting.

**Produces:** A single Card with three form fields (Grace Period Days, Default Commission %, Locale) and a Save button. Non-admins see an "Admin only" Badge; all fields are disabled and the Save button is hidden.

**On success:** `toast.success("Settings saved")` — all three `organizationSettings` keys are upserted atomically via `Promise.all`.

**On failure:** `toast.error("Failed to save settings")` and form resets to pre-submit values via `form.reset(previousValues)`.

**On no org:** Centered "Select an organization…" message. No skeleton rendered.

---

## 2. How It Works

**Execution flow:**
```
OrganizationSettingsPage
  → useUserContext() → organizationId, hasRole(["admin"])
  → useQuery × 3 (parallel):
      client.organizationSettings.get({ key: "grace_period_days" })
      client.organizationSettings.get({ key: "commission_percentage" })
      client.organizationSettings.get({ key: "locale" })
  → useEffect: when all 3 resolved → form.reset({ gracePeriodDays, commissionPct, locale })

  handleSave (react-hook-form submit)
    → previousValues = form.getValues()
    → Promise.all([upsert × 3])
    → success: toast.success
    → failure: form.reset(previousValues); toast.error
```

**Inputs (form schema via zod):**
| Field | Type | Validation | Default |
|-------|------|------------|---------|
| Grace Period Days | number (coerce) | int, 1–365 | 7 |
| Default Commission % | number (coerce) | min 0, max 100 | 0 |
| Locale | enum | `"en-MY"` \| `"en-US"` | `"en-MY"` |

**State management:**
- react-hook-form + zod (`orgSettingsSchema`) for field state + validation
- `useEffect` pre-fills from query results; runs once when all 3 queries resolve
- `previousValues` captured at submit time for rollback

**Rollback pattern:** `form.reset(previousValues)` on `Promise.all` failure — restores exact pre-submit form state.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `organizationSettings.get` × 3 — fetches `grace_period_days`, `commission_percentage`, `locale` keys
- `organizationSettings.upsert` × 3 — saves all three keys on submit

**Uses these components:**
- `Form`, `FormField`, `FormItem`, `FormControl`, `FormLabel`, `FormDescription`, `FormMessage` — shadcn/ui react-hook-form integration
- `Card`, `CardContent`, `CardHeader`, `CardTitle` — layout
- `Input`, `Select`, `Button`, `Badge` — field controls

**Uses these hooks:**
- `useUserContext` — `organizationId`, `hasRole`
- `useQuery` × 3 — TanStack Query, `staleTime: 60_000`
- `useForm` — react-hook-form with zod resolver

**Navigation: incoming:** No sidebar link yet (Tier 5 sidebar wiring is pending). Direct URL only for now.

**Navigation: outgoing:** None — stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `organization_settings` (tenant) | READ (3×) | `key`, `value` |
| `organization_settings` (tenant) | UPSERT (3×) | `organizationId`, `key`, `value` |

**Setting keys:**
| Key | Type stored | Display range |
|-----|-------------|---------------|
| `grace_period_days` | string (integer) | 1–365 |
| `commission_percentage` | string (float) | 0–100 |
| `locale` | string (enum) | `en-MY`, `en-US` |

Values are stored as strings; form parses via `z.coerce.number()` / `String()` on save.

---

## 5. Tests

**Test files:** None.

**Not tested:**
- Rollback behavior when one of the three upserts fails mid-Promise.all
- useEffect pre-fill with stale/mismatched query results

---

## 6. Notes

- **Not in sidebar yet** — wiring deferred to Tier 5 (`zplan/04-19_19-35_tier5-sidebar-consolidation`). Access via direct URL `/dashboard/settings/organization`.
- `staleTime: 60_000` on all three queries to avoid refetches on tab focus.
- Non-admins can see current values in disabled fields but cannot save — same UX pattern as read-only admin pages.
- `Promise.all` means all three upserts fire simultaneously; if one fails, all three may have partially saved before the catch runs. The rollback only resets the form, not the server state — a partial save leaves the server in a mixed state.
