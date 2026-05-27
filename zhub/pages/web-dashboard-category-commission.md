# Category Commission Config (Sheet Dialog)

**Route:** Not a standalone route
**File:** `apps/web/src/components/forms/category-commission-form.tsx`
**Platform:** web
**Auth required:** authenticated + `category_commission_management:read` + `category_commission_management:create`
**Last updated:** 2026-05-27

---

## 1. What It Does

**Purpose (user perspective):** Define per-service-category commission structure: payment type (fixed RM or variable %), coach slot distribution (basis-point weightages), and tier/condition-based rates.

**Produces:** A Sheet (right sidebar modal) with payment type radio, coach slots builder, conditional toggle, conditions card builder, and rates table. Status badge: "Configured" vs "No config yet".

**On success:** `upsert` mutation fires → config saved → sheet closes → parent table refetch. Toast: "Commission config saved".

**On failure / error states:** Toast error. Form validations: slot sum ≠ 10000, missing rates/conditions, condition overlaps all trigger error toasts.

---

## 2. How It Works

**Execution flow:**
```
Click "Commission Config" button on category row
  → Open sheet: useQuery(["categoryCommission", orgId, categoryId])
    → client.categoryCommission.getByCategory(...)
      → getCategoryCommissionConfig(tenantDb, categoryId)
  → Load tiers: useQuery(["trainerTiers", orgId, "active"])
  → useEffect: populate form from existing config
  → User modifies: updateSlot, updateRate, addCondition, updateCondition
  → Submit: validateSlots, validateConditions, upsertMutation
    → client.categoryCommission.upsert(...)
      → Transaction: delete old config, insert new config + slots + rates/conditions
      → Return fresh config via getCategoryCommissionConfig
```

**Inputs:** Props: `open`, `onOpenChange`, `categoryId`, `categoryName`, `organizationId`

**State management:**
- React: `paymentType`, `isConditional`, `maxCoaches`, `slots`, `rates`, `conditions`
- Query: `["categoryCommission", orgId, categoryId]`, `["trainerTiers", orgId, "active"]`

**Outputs:** Upsert call with full new config; no direct return.

**Side effects:**
- Full-replace of category_commission_configs + child rows
- Toast + sheet close on success
- Parent DataTable refetch implicit via onOpenChange

---

## 3. What Depends On It

**Calls these API endpoints:**
- `categoryCommission.getByCategory` — fetch existing config
- `categoryCommission.upsert` — save (full-replace transaction)
- `trainerTiers.list` — fetch active tiers for rate inputs

**Uses these components:**
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`
- `Label`, `Input`, `Button`, `Switch`, `Select`, `RadioGroup`, `Badge`, `Separator`
- `Plus`, `Trash2` (lucide icons)

**Navigation: who navigates here:** Button in Service Category DataTable (`/dashboard/service/view?tab=categories`).

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns |
|-------|-----------|------------|
| `category_commission_configs` | INSERT (after DELETE) | `categoryId`, `paymentType`, `isConditional`, `maxCoaches` |
| `commission_coach_slots` | INSERT | `configId`, `slotIndex`, `label`, `weightageBasisPoints` |
| `commission_tier_rates` | INSERT | `configId`, `trainerTierId`, `amount` |
| `commission_conditions` | INSERT | `configId`, `conditionIndex`, `operator`, `threshold`, `thresholdMax`, `label` |
| `commission_condition_rates` | INSERT | `conditionId`, `trainerTierId`, `amount` |

**Types:**
- `SlotEntry`: `{ slotIndex, label, weightageBasisPoints }`
- `RateEntry`: `{ trainerTierId, amount }` (amount in dollars UI, cents API)
- `ConditionEntry`: `{ conditionIndex, operator, threshold, thresholdMax?, label?, rates }`

**Validation:**
- Slot weightages sum must equal 10000 (100%)
- Condition operators: `lt`, `lte`, `gt`, `gte`, `eq`, `between`
- Conditions must not overlap (checked via `intervalsOverlap()` + `toHalfOpen()`)

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Slot/condition add/remove with index renumbering
- Overlap detection for all 6 operators
- Upsert atomicity (slots, rates, conditions)
- Load-from-API populate (conditional vs non-conditional)
- Basis-point / percentage UI sync

---

## 6. Notes

- **Not a standalone route** — opened as Sheet modal from Service Category DataTable.
- **Full-replace upsert** — deletes old config entirely; partial updates not supported.
- **Slot weightage:** Basis points (0-10000 = 0-100%); sum must equal exactly 10000.
- **Condition overlap:** Half-open intervals [lo, hi); all pairs checked for intersection.
- **Amount conversion:** UI shows dollars; API uses cents. `amount / 100` on fetch, `Math.round(amount * 100)` on submit.
- **Missing rates:** If no active tiers exist, rates section shows "No active trainer tiers found."
- **Status badge:** "Configured" (emerald) or "No config yet" (outline).
- **Slot colors:** Progress bar cycles 5 colors: blue, emerald, amber, violet, rose.
- **Max coaches:** 1-10 range; limits simultaneous coach assignments per appointment.
- **POS note:** For POS sales, first condition (lowest index) applied automatically.

### 2026-05-27 audit-prove commission delta

- **F-01** `upsertCategoryCommissionConfig` — service now SELECTs the prior `isActive` before the DELETE+INSERT and preserves it across the upsert. Fixes silent re-activation when editing a deactivated config.
- **F-02** `getCategoryCommissionConfig` — accepts optional `includeInactive` (default `true` for back-compat); the admin form continues to see inactive configs by default.
- **F-14** `categoryCommission.upsert` permission widened to `category_commission_management:create` OR `:update` (hasPermission fallback) so editing an existing config no longer requires `create`.
- **NEW cycle policy** Per-(branch | tenant) commission cap cycle policy via `commission_cycle_configs` (migration 0077). `applyCommissionCaps` now resolves cycle bounds via `resolveCycleBoundsForDate(db, branchId, earnedAt)` from the new `commission-cycle.service.ts` instead of hardcoded UTC calendar-month. Supported cycle types: `calendar_month | monthly_anchored | semi_monthly | weekly`. Admin UI for editing the policy is deferred — defaults still produce calendar-month behaviour.
- Source: `packages/services/src/category-commission.service.ts`, `packages/services/src/commission-cycle.service.ts`, `packages/services/src/commission-splits.service.ts`, `packages/api/src/routers/category-commission.ts`, `packages/db/src/schema/tenant/commission-cycle-configs.ts`, `packages/db/src/migrations/tenant/0077_commission_cycle_configs.sql`.
