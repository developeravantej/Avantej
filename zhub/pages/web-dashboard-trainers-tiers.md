# Trainer Tiers

**Route:** `/dashboard/trainers/tiers` → **redirects to** `/dashboard/trainers/view?tab=tiers`
**Route file:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/tiers.tsx` (redirect stub)
**Tab component:** `apps/web/src/components/pages/trainers/trainer-tiers-page.tsx` — `TrainerTiersPage`
**Platform:** web
**Auth required:** authenticated (perm checks live inside the tab; see Notes)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Manage seniority tiers for trainers (rank ordering, name, description, active flag). Tiers feed into commission rate calculation (`categoryCommissionConfigs` → per-tier rates).

**Produces:** List of all tiers (active + inactive) in a plain HTML table — Name, Rank, Status badge, Action (Deactivate/Reactivate). "New Tier" dialog (name + rank + optional description). Confirmation dialog before deactivation. Warning banner with missing-rate-categories after create/reactivate.

**On success:** Tier created / deactivated / reactivated; toast notification; list refetches. Missing-rate-categories banner appears if applicable.

**On failure / error states:** Error `Alert` with retry button; loading text; empty state ("No tiers yet. Create your first tier.").

---

## 2. How It Works

**Execution flow (`TrainerTiersPage`):**
1. Read `useUserContext()` → `orgId`. Guard: render "Select an organization" if missing.
2. `useQuery(["trainerTiers", orgId, "list"])` → `client.trainerTiers.list({ organizationId, includeInactive: true })`.
3. Render Alert+retry on error, loading text on isLoading, empty state on empty, table otherwise.
4. User clicks "New Tier" → dialog → submit → `useApiMutation(client.trainerTiers.create)` → on success: close + reset form + `refetch()`. If `result.missingRateCategories` is non-empty, surface the warning banner.
5. User clicks "Deactivate" → confirmation dialog → `useApiMutation(client.trainerTiers.deactivate)` → success: clear target + refetch.
6. User clicks "Reactivate" (inactive row) → direct `useApiMutation(client.trainerTiers.reactivate)` → success: refetch + warning banner if missing rates.

**Inputs:** Implicit org from `useUserContext`. Form: `name` (required), `rank` (number), `description` (optional).

**State management:**
- TanStack Query: `["trainerTiers", orgId, "list"]`.
- Local `useState`: `createOpen`, `deactivateTarget` (id|null), `missingRateBanner` (array|null), `createForm` (`EMPTY_FORM = { name:"", rank:0, description:"" }`).
- Mutations: three `useApiMutation` calls (create / deactivate / reactivate) with success messages and per-error toasts.

**Outputs:** Table rows + dialog forms; mutations refetch + toast.

**Side effects:** None besides cache `refetch()` + toast.

---

## 3. What Depends On It

**Calls these API endpoints (typed `client`):**
- `client.trainerTiers.list({ organizationId, includeInactive: true })` — full list.
- `client.trainerTiers.create({ organizationId, name, rank, description? })` — may return `{ tier, missingRateCategories }`.
- `client.trainerTiers.deactivate({ organizationId, id })`.
- `client.trainerTiers.reactivate({ organizationId, id })` — may return `{ tier, missingRateCategories }`.

**Uses these components:**
- shadcn `Dialog`, `Button`, `Input`, `Label`, `Textarea`, `Alert`/`AlertDescription`, `Badge`.
- lucide icons: `Plus`, `AlertTriangle`.

**Uses these hooks:**
- `useUserContext` — org id.
- `useApiMutation` (`@/hooks/useApiMutation`) — wraps `useMutation` with success/error toast handling.
- `useQuery`.

**Companion form (commission rates per category):** `apps/web/src/components/forms/category-commission-form.tsx` — opened from the Service Categories table (`@/components/tables/service-category/view/data-table.tsx`), NOT from this Tiers page. It reads `client.trainerTiers.list` to render rate inputs per active tier, and writes via `client.categoryCommission.upsert`. Tiers + commission config are deeply coupled — keep them consistent.

**Navigation: incoming:**
- The old `/dashboard/trainers/tiers` URL now redirects to `/dashboard/trainers/view?tab=tiers`.
- Tab is rendered inside the Trainers route shell.

**Navigation: outgoing:** None.

---

## 4. Data Shapes

**DB tables touched:**
- `tenantDb.trainerTiers` — read / create / update(isActive) / update(name/rank/description).
- `tenantDb.categoryCommissionConfigs` (indirect — backend checks for missing per-tier rate rows; surfaced through `missingRateCategories`).

**Key types / Zod schemas:**
```typescript
type Tier = { id: string; name: string; rank: number; description?: string; isActive: boolean };
type CreateInput = { name: string; description?: string; rank: number };
type MissingRateCategory = { categoryId: string; configId: string };
// create / reactivate response: { tier: Tier; missingRateCategories?: MissingRateCategory[] }
```

---

## 5. Tests

**Test file:** `apps/web/src/__tests__/pages/trainer-tiers.test.tsx`

**Companion test:** `apps/web/src/__tests__/components/category-commission-form.test.tsx` (for the rate-config form that consumes this list).

**Not tested (risk areas):**
- Missing-rate-category banner display logic.
- Deactivate / reactivate edge cases (race vs in-flight rate creation).
- Form whitespace trimming.

---

## 6. Notes

- **Route is now a redirect (May 2026):** `/dashboard/trainers/tiers` throws a TanStack `redirect()` to `/dashboard/trainers/view?tab=tiers`. The actual UI lives in the Trainers parent route as a tab. Keep deep links to the old URL working — the redirect handles them.
- **Permission gate is implicit:** the tab component doesn't itself check `trainer_tier_management:read`; access is controlled by the parent Trainers route + tab visibility. (Earlier doc note about `requirePermission` is stale — `route-guards.requirePermission` is a stub.)
- **Silent commission skip:** trainers on a tier with no rate row for a given category have commission silently skipped at calc time. Only surfaced post-mutation (banner) on tier create/reactivate. No pre-check.
- **Companion form (`CategoryCommissionForm`)** owns the per-tier rate input. Slot weightages must total 10000 basis points (100%). Supports conditional rates (by attendee count) when "Rate depends on attendee count" toggle is on. Amounts are converted RM ⇄ cents via `centsToRm` / `rmToCents` from `@/lib/money`.
- **Form state reset:** Dialog close → form reset to `EMPTY_FORM` to avoid stale data.
- Uses plain HTML `<table>`, not the project DataTable — matches the lightweight admin UI.
