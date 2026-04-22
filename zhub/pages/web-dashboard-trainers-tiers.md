# Trainer Tiers

**Route:** `/dashboard/trainers/tiers`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/tiers.tsx`
**Platform:** web
**Auth required:** authenticated + `trainer_tier_management:read`
**Last updated:** 2026-04-22

---

## 1. What It Does

**Purpose (user perspective):** Manage trainer seniority tiers used for tiered commission rate configuration. Each tier represents a level (e.g., "Junior Trainer", "Senior Trainer") with a rank order and optional description.

**Produces:** A table listing all tiers (active + inactive) with name, rank, status badge, and action buttons. "New Tier" dialog for creation. Deactivate/Reactivate confirmation dialogs. Missing-rate warning banner when new/reactivated tiers lack commission rates in some service categories.

**On success:** Tier created/deactivated/reactivated → table refetches → toast notification. If tier creation/reactivation reveals categories without rates, a destructive-variant alert banner displays affected category IDs.

**On failure / error states:** Toast error with message. Loading spinner during initial fetch. Empty state "No tiers yet" message. Form validation: name required (not empty/whitespace).

---

## 2. How It Works

**Execution flow:**
```
TrainerTiersPage loads
  → useUserContext() → currentOrganizationId
  → useQuery(["trainerTiers", orgId, "list"], ...)
    → client.trainerTiers.list({ organizationId, includeInactive: true })
      → trainerTiersRouter.list
        → requirePermission(tenantDb, member, "trainer_tier_management", "read")
        → listTrainerTiers(tenantDb, { includeInactive: true })

Create Tier:
  → form submit → createMutation.mutate({ name, rank, description })
    → client.trainerTiers.create(...)
      → trainerTiersRouter.create (permission: trainer_tier_management:create)
        → createTrainerTier(tenantDb, { name, description, rank })
          → Validate unique name (case-insensitive)
          → INSERT into trainer_tiers
          → Call getConfigsMissingRateForTier
          → Return { tier, missingRateCategories }

Deactivate:
  → User clicks Deactivate → confirm dialog
    → client.trainerTiers.deactivate(...)
      → trainerTiersRouter.deactivate (permission: trainer_tier_management:delete)
        → deactivateTrainerTier(tenantDb, tierId)
          → UPDATE trainer_tiers SET isActive=false

Reactivate:
  → User clicks Reactivate
    → client.trainerTiers.reactivate(...)
      → trainerTiersRouter.reactivate (permission: trainer_tier_management:update)
        → reactivateTrainerTier(tenantDb, tierId)
          → UPDATE trainer_tiers SET isActive=true
          → Call getConfigsMissingRateForTier
          → Return { tier, missingRateCategories }
```

**Inputs:** None (page params). Query params passed through useUserContext.

**State management:**
- TanStack Query: `["trainerTiers", orgId, "list"]` (30s default stale)
- Local state: `createOpen`, `deactivateTarget`, `missingRateBanner`, `createForm`
- Form state: `{ name: string, rank: number, description: string }`

**Outputs:** List rendered as table. Mutations trigger list refetch on success. Mutations return tier object + missingRateCategories array.

**Side effects:**
- CREATE trainer_tier via API
- UPDATE trainer_tier (deactivate/reactivate) via API
- Toast notifications (success/error)
- Dialog open/close state resets form

---

## 3. What Depends On It

**Calls these API endpoints:**
- `trainerTiers.list` — fetch all tiers (including inactive)
- `trainerTiers.create` — create new tier; returns { tier, missingRateCategories }
- `trainerTiers.deactivate` — soft-delete tier (isActive := false)
- `trainerTiers.reactivate` — reactivate tier (isActive := true); returns { tier, missingRateCategories }

**Uses these components:**
- `Dialog` (from `@/components/ui/dialog`) — Create and Deactivate modals
- `Button`, `Badge`, `Input`, `Label`, `Textarea`, `Alert`, `AlertDescription` (shadcn)
- `Plus`, `AlertTriangle`, `Layers` (lucide-react icons)

**Uses these hooks:**
- `useUserContext` — retrieves `currentOrganizationId`
- `useQuery`, `useMutation` (TanStack Query)
- `useState` (React)

**Navigation: who navigates here:** Sidebar under Staff > Trainers > "Tiers" link (requires `trainer_tier_management:read`).

**Navigation: where it goes:** None (page is a leaf node).

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `trainer_tiers` | SELECT, INSERT, UPDATE | `id`, `name`, `rank`, `description`, `isActive` |
| `category_commission_configs` | SELECT | `id`, `categoryId`, `isConditional`, `isActive` |
| `commission_tier_rates` | SELECT | `configId`, `trainerTierId` |
| `commission_conditions` | SELECT | `configId`, `id` |
| `commission_condition_rates` | SELECT | `conditionId`, `trainerTierId` |
| `members` | UPDATE (via assignToMember) | `id`, `trainerTierId`, `role` |

**Key types / Zod schemas:**
```typescript
// Input
{ organizationId: uuid, name: string, rank?: number, description?: string }

// Output
{
  tier: {
    id: uuid,
    name: string,
    rank: number,
    description?: string,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date
  },
  missingRateCategories: Array<{ categoryId: string, configId: string }>
}
```

---

## 5. Tests

**Test files:** None found for trainer-tiers route or service.

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Form validation (name required, trimming)
- Unique name constraint behavior (case-insensitivity)
- Missing-rate banner display logic
- Deactivate/reactivate permission enforcement
- Race conditions (concurrent creates)
- Tier used by members (assigns via assignToMember)

---

## 6. Notes

- **No hard-delete:** Deactivate sets `isActive=false`. There is no delete button — only Deactivate/Reactivate.
- **Missing-rate warning:** When a tier is created or reactivated, if any active category commission config lacks a rate for it, a destructive-alert banner warns the admin. Trainers with the tier will have silent commission skips until rates are added.
- **Missing-rate check logic:** `getConfigsMissingRateForTier` checks both conditional and non-conditional configs. For non-conditional: tier must have a `commission_tier_rates` row. For conditional: tier must have at least ONE `commission_condition_rates` row on at least one condition under the config.
- **assignToMember validation:** The `assignTierToMember` endpoint (used elsewhere) validates `member.role === "trainer"` before assigning. Non-trainers cannot be assigned a tier.
- **Sidebar link:** Added to `app-sidebar.tsx` under Staff > Trainers group, guarded by `trainer_tier_management:read` permission.
- **Rank ordering:** Tiers are listed in ascending rank order.
