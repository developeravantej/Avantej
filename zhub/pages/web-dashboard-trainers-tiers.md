# Trainer Tiers

**Route:** `/dashboard/trainers/tiers`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/tiers.tsx`
**Platform:** web
**Auth required:** `trainer_tier_management:read`
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage seniority tiers for trainers, which feed into commission rate calculation.

**Produces:** A table showing all trainer tiers with name, rank, and active/inactive status. Includes a form to create new tiers and dialogs to confirm deactivation.

**On success:** Tier is created/reactivated, toast notification, list refetches. If missing commission rate categories are detected, warning banner displays.

**On failure / error states:** Error banner with retry button, loading spinner, empty state (no tiers yet).

---

## 2. How It Works

**Execution flow:**
1. On mount: Check `trainer_tier_management:read` permission, fetch organizationId from useUserContext
2. Load tiers list: `client.trainerTiers.list({ organizationId, includeInactive: true })`
3. User creates tier → form validation → `client.trainerTiers.create()` → refetch list
4. User deactivates tier → confirm dialog → `client.trainerTiers.deactivate()` → refetch
5. User reactivates tier → `client.trainerTiers.reactivate()` → check for missing rates

**Inputs:**
- URL param: implicit org from session context
- Form: name (required), rank (number), description (optional)

**State management:**
- TanStack Query: `queryKey = ["trainerTiers", orgId, "list"]`
- Local state: createOpen, deactivateTarget (string|null), missingRateBanner (array|null), createForm

**Outputs:** Renders table rows with tier details; mutations trigger refetch + toast

**Side effects:** Cache invalidation via refetch(); missingRateCategories warning shown after create/reactivate

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.trainerTiers.list()` — fetch all tiers (active & inactive)
- `client.trainerTiers.create()` — add new tier; may return missingRateCategories
- `client.trainerTiers.deactivate()` — mark tier inactive
- `client.trainerTiers.reactivate()` — mark tier active; may return missingRateCategories

**Uses these components:**
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` — shadcn dialogs
- `Button`, `Input`, `Label`, `Textarea`, `Alert`, `AlertDescription`, `Badge` — shadcn form & UI
- lucide icons: `Plus`, `AlertTriangle`, `Layers`

**Uses these hooks:** None (useQuery, useMutation are TanStack Query)

**Navigation: who navigates here:** `/dashboard/trainers/tiers` route (protected by requirePermission)

**Navigation: where it goes:** None (internal page only)

---

## 4. Data Shapes

**DB tables touched:**
- `tenantDb.trainerTiers` — read, create, update(isActive)
- `tenantDb.commissionRateConfigs` (implicit) — check for missing categories

**Key types / Zod schemas:**
- Tier: `{ id: string; name: string; rank: number; description?: string; isActive: boolean }`
- Input: `{ name: string; description?: string; rank: number }`
- Response (create/reactivate): `{ tier: Tier; missingRateCategories?: Array<{ categoryId: string; configId: string }> }`

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/pages/trainer-tiers.test.tsx`

**Scenarios covered:** (check test file for specifics)

**Not tested (risk areas):** 
- Missing rate category handling (banner display logic)
- Deactivate/reactivate edge cases
- Form validation edge cases (whitespace trimming)

---

## 6. Notes

- **RBAC:** Requires `trainer_tier_management:read` permission; create/deactivate/reactivate assumed allowed in same session
- **Silent commission skip:** Trainer commissions silently skip if tier lacks rate config for a category — no current UI warning in trainer profile, only in tier creation
- **No LEGACY comment** — page actively maintained
- **Form state reset:** On dialog close, form resets to EMPTY_FORM to avoid stale data
- **Missing rate categories:** Only surfaced post-mutation; no pre-check before tier creation to warn of incomplete rates

