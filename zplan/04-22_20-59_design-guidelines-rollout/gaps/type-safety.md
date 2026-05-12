# Type Safety Audit
**Session:** 04-22_20-59_design-guidelines-rollout
**Findings:** 7 (0 critical · 3 high · 3 medium · 1 low · 0 info)

---

## Findings

### [HIGH] `StatusCalloutProps` is not backward-compatible with `ErrorStateProps`

**Plan claims:** "Expanded from existing error-state.tsx — Preserves `ErrorState` public API via re-export + @deprecated JSDoc"

**Actual:** `ErrorStateProps` has exactly two props: `message: string` and `onRetry?: () => void`. The proposed `StatusCalloutProps` uses `children?: React.ReactNode` instead of `message: string`, and adds `variant`, `title`, `icon`, `onDismiss`, and `className`. The `message` prop is completely absent from the new interface. A re-export alias `ErrorState = StatusCallout` would break all callers that pass `message="..."` because `StatusCalloutProps` has no such prop. The plan must either (a) keep `message` as a deprecated prop on `StatusCalloutProps`, or (b) keep `error-state.tsx` unchanged and only add a new `status-callout.tsx` alongside it.

**File:** `apps/web/src/components/ui/error-state.tsx:4-7`

**Fix:** Add `message?: string` (deprecated) to `StatusCalloutProps`, rendered as children fallback; or maintain `ErrorState` as a separate thin wrapper that maps `message` → `children`.

---

### [HIGH] `confirmed` sales status missing from `CanonicalStatus`

**Plan claims:** CanonicalStatus covers all existing status values in use.

**Actual:** `apps/web/src/components/tables/sales/view/columns.tsx` lines 183–186 maps four sale-order statuses: `completed`, `confirmed`, `draft`, and `cancelled`. The value `"confirmed"` does not appear in the proposed `CanonicalStatus` union. Any `StatusBadge` rendered for a `confirmed` sales order will receive a value not in the union, causing a TypeScript error at every call site.

**File:** `apps/web/src/components/tables/sales/view/columns.tsx:185`

**Fix:** Add `"confirmed"` to `CanonicalStatus`.

---

### [HIGH] Product statuses `inactive` and `discontinued` missing from `CanonicalStatus`

**Plan claims:** CanonicalStatus covers all existing status values in use.

**Actual:** `apps/web/src/components/tables/products/view/columns.tsx` lines 27–51 handles three product statuses: `active`, `inactive`, and `discontinued`. `"inactive"` and `"discontinued"` are not present in the proposed `CanonicalStatus` union.

**File:** `apps/web/src/components/tables/products/view/columns.tsx:33,39`

**Fix:** Add `"inactive"` and `"discontinued"` to `CanonicalStatus`.

---

### [MEDIUM] Commission `void` status missing from `CanonicalStatus`

**Plan claims:** CanonicalStatus covers all existing status values in use across domains.

**Actual:** Both `apps/web/src/components/pages/commissions/all-tab.tsx:36` and `mine-tab.tsx:59` define `CommissionStatus = "pending" | "approved" | "paid" | "void"`. The value `"void"` does not appear in the proposed `CanonicalStatus` union. Commissions are a first-class domain with their own tab page — this is a runtime gap, not a corner case.

**File:** `apps/web/src/components/pages/commissions/all-tab.tsx:36`

**Fix:** Add `"void"` to `CanonicalStatus`.

---

### [MEDIUM] Payment `mode` values are not statuses — `StatusBadge` conflation risk

**Plan claims:** StatusBadge canonical map covers payment domain.

**Actual:** `apps/web/src/components/tables/payment/view/columns.tsx` lines 167–172 badges the payment *mode* (`cash`, `card`, `online`, `transfer`), not a status. These are not lifecycle statuses and should not be forced into `CanonicalStatus`. If the implementation team interprets "covers payment domain" as "add mode values to CanonicalStatus", it will pollute the type with non-status tokens. The plan should explicitly exclude payment `mode` from the `StatusBadge` migration scope.

**File:** `apps/web/src/components/tables/payment/view/columns.tsx:167-172`

**Fix:** Clarify in the plan that payment `mode` badges remain as local inline Badge renders and are explicitly out of scope for `StatusBadge`/`CanonicalStatus`.

---

### [MEDIUM] Three inline `BranchCombobox` copies have divergent prop signatures — rename will not break typing, but the plan must acknowledge the copies

**Plan claims:** "`components/branch/branch-selector.tsx` — MOVE + RENAME of `components/ui/branch-combobox.tsx`"

**Actual:** The shared component at `components/ui/branch-combobox.tsx` is **not imported by any caller** (confirmed by grep). The three callers — `pages/stock/transfers-tab.tsx:443`, `pages/stock/requests-tab.tsx:430`, and `routes/.../rooms/view.tsx:451` — each define their **own local** `BranchCombobox` function with differing props:

- `transfers-tab` / `requests-tab`: props are `{ value, onChange, placeholder, required? }` (no `organizationId` — they close over a local `branches` array)
- `rooms/view.tsx`: props are `{ value, onChange, branches, placeholder }` (receives branches as a prop)
- Shared component: props are `{ organizationId, value, onChange, placeholder?, disabled? }` (fetches branches internally)

Renaming the shared file to `BranchSelector` will not cause any TypeScript breakage, but the plan's stated goal of consolidating to a single component will require reconciling these three divergent signatures. The plan provides no migration path for the inline copies, leaving dead code in place.

**File:** `apps/web/src/components/ui/branch-combobox.tsx:23-29`

**Fix:** The plan should explicitly list all three inline copies, pick one canonical signature for `BranchSelector`, and require the inline copies to be deleted and replaced in the same PR.

---

### [LOW] `LucideIcon` type is available but must be a named import — no conflict

**Plan claims:** `EmptyStateProps.icon?: LucideIcon` imported from `lucide-react`.

**Actual:** `LucideIcon` is exported as a named type from `lucide-react@0.473.0` (installed in the project). Usage is `import type { LucideIcon } from "lucide-react"`. This is correct and unambiguous. No conflict.

**File:** `node_modules/lucide-react/dist/lucide-react.d.ts:1`

**Fix:** No action required — confirm the import style is `import type { LucideIcon } from "lucide-react"` in the new component.

---

## Summary

The most critical risk is the `StatusCalloutProps` / `ErrorState` backward-compatibility gap: the plan claims a re-export will preserve the existing API, but the existing `message: string` prop has no equivalent in the new interface, making a transparent alias impossible without a shim. Three `CanonicalStatus` union members are missing from the plan (`"confirmed"` from sales orders, `"inactive"` and `"discontinued"` from products, and `"void"` from commissions), meaning `StatusBadge` would produce TypeScript errors on first use in those tables. The `BranchCombobox` rename is safe for the shared file but the plan overlooks three inline copies with incompatible signatures that will remain as dead code unless the plan explicitly addresses them.
