# Payment Settings

**Route:** `/dashboard/settings/payment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/settings/payment/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets admins configure the installment grace period — the number of days a client has after a missed installment before their package is locked.
**Produces:** A single settings card with a numeric input for grace period days (0–90).
**On success:** Toast "Settings saved." and cache invalidated.
**On failure / error states:** Spinner while loading; "Select an organization" prompt if no `organizationId`; toast error on save failure; client-side validation rejects values outside 0–90.

---

## 2. How It Works

**Execution flow:**
```
PaymentSettingsPage
  → useUserContext() → organizationId
  → useQuery(["organizationSettings", "grace_period_days", organizationId])
      → client.organizationSettings.get({ organizationId, key: "grace_period_days" })
  → useEffect: populate gracePeriodDays local state from query result
  → handleSave()
      → client.organizationSettings.upsert({ organizationId, key: "grace_period_days", value })
      → queryClient.invalidateQueries(["organizationSettings", "grace_period_days", organizationId])
```

**Inputs:** Single number input for `gracePeriodDays` (controlled local state, default "7").
**State management:** `useState("7")` for the input; TanStack Query for server state; `useEffect` syncs query result into local state.
**Outputs:** Renders settings card; triggers upsert mutation on "Save".
**Side effects:** Cache invalidation on success.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `organizationSettings.get` — fetch current grace period setting
- `organizationSettings.upsert` — save updated value

**Uses these components:**
- `Button`, `Input`, `Label`, `Separator` — `@/components/ui/*` — form primitives
- `Wallet` icon — from `lucide-react`

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`
- `useQuery`, `useMutation`, `useQueryClient` — server state management
- `useState`, `useEffect` — local form state

**Navigation: who navigates here:**
- App sidebar → Settings section → "Payment Settings" link (`/dashboard/settings/payment/view`)

**Navigation: where it goes:** Stays on this page.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `organization_settings` | SELECT | `key = "grace_period_days"`, `value`, `organizationId` |
| `organization_settings` | UPSERT | `key`, `value`, `organizationId` |

**Key types:** Setting value stored as a string (`"7"`) in the DB, parsed to integer in the UI.

---

## 5. Tests

**Test files:** None found.

**Not tested:** Render, save, validation (0–90 range), error states, empty/default value behavior.

---

## 6. Notes

- The grace period is stored as a string in `organization_settings.value`; the page parses it to an integer.
- Defaults to "7" if the key is absent or unparseable.
- Validation rejects values outside 0–90 with a toast error before the mutation fires.
- The `useEffect` only runs when `settingData !== undefined` (distinguishes "not yet loaded" from "loaded with null").
