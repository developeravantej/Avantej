# API-Surface Audit — web-modularity-refactor

Scope: client-side wrapper contracts (`useApiMutation`, shared `queryClient`, toast convention, user-context shape, mega-file paths, table columns).

## CRITICAL

### C1. `useUserContext().currentOrganization.defaultCurrency` does not exist
Plan §3.2 and §3.4 reference `useUserContext().currentOrganization.defaultCurrency` as the default-currency source for `formatPrice` / `moneyColumn`. Verified at `apps/web/src/hooks/useUserContext.ts`:
- The hook returns `organizations: Array<...>` + `currentOrganizationId: string | null`. There is NO `currentOrganization` singleton.
- No `defaultCurrency` field exists on the org shape (lines 14-38). `grep -r defaultCurrency apps/web/src` returns zero matches.
- Every money-aware caller would need `ctx.organizations.find(o => o.id === ctx.currentOrganizationId)?.defaultCurrency ?? "MYR"` — and `defaultCurrency` must first be added to the `userContext` oRPC procedure's response + the `UserContextResponse` type.

Impact: Task 1.5 / Phase 5 cannot land as written. §6 "Nullable/optional assumptions" partially anticipates this ("verify in organizations.ts"), but the plan wires the hook path before the field exists in the client type. Must add a Phase 0 task: extend `userContext` router + `UserContextResponse` to expose `currentOrganization` (or currency) — which contradicts the "Scope — Out: no oRPC contract changes" line (§1).

### C2. `EnhancedPermissionMatrix.tsx` path in plan is wrong
Plan §1, §3.5, §6C cite `components/access-control/EnhancedPermissionMatrix.tsx`. Actual path: `apps/web/src/components/access-control/permission-matrix/EnhancedPermissionMatrix.tsx` (1218 lines — count matches). §6 "Callers to trace" also references `components/access-control/permissions-tab.tsx`; verify before 6C.

## HIGH

### H1. Scope contradiction for C1
§1 explicitly states "Scope — Out: Backend/services/API changes. Anything that changes oRPC contracts." But fixing C1 requires adding `defaultCurrency` to the `auth.userContext` oRPC response. Resolve by either (a) reclassifying as in-scope with a small server-side subtask, or (b) hard-coding `"MYR"` fallback and deferring currency-awareness.

## MEDIUM

### M1. `toast` from `"sonner"` not the dominant existing convention
`sonner` 2.0.5 is installed. But `grep "from \"sonner\""` across `apps/web/src` returns only 5 files. The 299 `toast.error` call sites use a different import (likely a shadcn `@/components/ui/use-toast`). Plan assumes switching to `sonner` is seamless — it is actually a toast-library swap for 90 files, not a refactor. Verify the prevailing `toast` import before Phase 2, and if non-sonner, either standardize on existing toast or add a migration sub-task.

## LOW

### L1. Mega-file line counts verified
`add-appointment-modal.tsx` 2743, `installments-page.tsx` 1357, `trainers/view.tsx` 1334, `EnhancedPermissionMatrix.tsx` 1218 — all match.

### L2. Shared `queryClient` exists and is importable
Exported from `apps/web/src/utils/orpc.ts` (`export { queryClient, client, orpc }`) and consumed by `main.tsx`. Hook can import `{ queryClient } from "@/utils/orpc"`. OK.

### L3. `@/utils/orpc` is canonical client path
Confirmed — matches memory note. `useApiMutation` wrapper design (typed `TData`/`TVariables`) is compatible.

## INFO

### I1. Table columns inventory
17 `data-table.tsx` and 21 `columns.tsx` files exist under `components/tables/*/view/`. Plan's "15 columns.tsx" in Task 5.1 is an undercount; update to 21 or explicitly list the subset skipped. Note: plan's list includes `cancelled-sales`, `rooms`, etc. — all present. No `trainers/view` table entry exists under `components/tables/`.
