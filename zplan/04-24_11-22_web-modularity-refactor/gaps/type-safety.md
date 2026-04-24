# Type-Safety Audit — Web Modularity Refactor

## Findings

### 1. `useApiMutation` generic signature regresses inference — **HIGH**

Plan §3.1: `useApiMutation<TData, TVariables>(opts: UseMutationOptions<TData, Error, TVariables> & {...})`.

- TanStack Query's `UseMutationOptions` takes **4 type params**: `<TData, TError, TVariables, TContext>`. The plan pins `TError = Error` and omits `TContext`, which is acceptable but silently erases the optimistic-update context type some call sites may eventually want. Low-impact, mention only.
- **Real regression risk:** current call sites (see `hooks/useUserAssignment.ts`, `useRoles.ts`, `useProductForm.ts`) use the pattern:
  ```ts
  useMutation({ mutationFn: (input: X) => client.members.updateRole({ organizationId, ...input }) })
  ```
  TVariables is inferred from `mutationFn`'s parameter. In the proposed wrapper, `TVariables` sits in the same generic slot, so it WILL infer — but only if `mutationFn` is present on `opts`. Wrapper signature must keep `mutationFn` on the options object (not lift it to a required separate arg), otherwise every call site has to write `useApiMutation<ReturnType, InputType>(...)` explicitly. Plan doesn't say either way — flag: Phase 1 must exercise inference in tests with an oRPC-shaped `mutationFn`, not a stub.
- **oRPC shape mismatch:** many sites wrap oRPC in a custom `mutationFn` closure (as above). A minority use `orpc.X.Y.mutationOptions()` spread. The wrapper handles the former cleanly; for the latter, spreading `...orpc.X.mutationOptions()` into `Opts` still type-checks, but the `TVariables`/`TData` come from oRPC's generated types — confirm in Phase 1 tests that both idioms compose. Add a test fixture for each.

### 2. `zMoneyInput` contract — **MEDIUM**

Plan §3.3 code shows `.transform((s, ctx) => { /* parseMoneyInput + issue */ })` which is correct zod idiom. BUT §3.2 defines `parseMoneyInput` as **"Throws on invalid"**. If the transform body calls `parseMoneyInput` naively, the throw escapes zod and yields an unhandled exception instead of a nice form error. Fix: either `parseMoneyInput` returns a discriminated result (`{ ok, value } | { ok: false, reason }`) or the transform wraps it in `try/catch` and calls `ctx.addIssue`. Plan must pick one explicitly in Task 1.1/1.3.

### 3. `zPercentageBp` missing string-input variant — **MEDIUM**

`z.number().int().min(0).max(10_000)` is correct for stored basis points, but forms collect `"8.00"` from `<Input type="number">` (which RHF passes as string unless `valueAsNumber` is set). Plan needs a companion `zPercentageInput = z.string().transform(...)` that converts `"8.00"` → `800`, symmetric to `zMoneyInput`. Otherwise 22 forms will each re-roll the parse. Add to §3.3.

### 4. `@tanstack/react-table` — **LOW / OK**

Installed at `^8.21.3` in `apps/web/package.json`. Existing tables (`tables/user/view/data-table.tsx` etc.) use the same version. `ColumnDef<T>` import path is correct.

### 5. `formatPrice` default-currency change — **LOW**

Current `lib/currency.ts` (20 lines, single export `formatPrice(price, currency)` — no default, currency is required). Proposed `formatPrice(cents, currency = "MYR")` adds a default. Risk is minimal: grep shows all ~39 callers pass `"MYR"` explicitly or pass the org currency. No callers pass `undefined`. Acceptable. Parameter **name change** `price → cents` is cosmetic but the signature type is identical — shim remains sound.

### 6. `lib/currency.ts` shim completeness — **OK**

Confirmed: `lib/currency.ts` exports ONLY `formatPrice`. `lib/amount.ts` exports ONLY `rmToCents`, `centsToRm`. Shim plan in Task 1.2 is complete.

### 7. Existing `as any` debt in mega-files — **HIGH**

Splits will inherit and spread type-unsafety rather than isolate it:

| File | `as any` count |
|---|---|
| `add-appointment-modal.tsx` | **8** — all on oRPC query results (`clientMembers as any[]`, `servicesData as any[]`, `classSlotOptions as any[]`) and member payloads. |
| `trainers/view.tsx` | **1** (`trainerTiers as any[]`). |
| `installments-page.tsx` | 0 found. |
| `EnhancedPermissionMatrix.tsx` | 0 found. |

The appointment-modal casts hide real oRPC type mismatches. Phase 6A currently plans to "extract data-fetching to `useAppointmentFormData.ts`" — if the casts move verbatim into the hook, the hook's return type becomes `any[]` and every downstream field component inherits it. **Recommendation:** add an explicit Phase 6A task before 6A.3: *"Fix oRPC return-type casts in `useAppointmentFormData.ts` — type each query result against the oRPC-generated schema; no `as any` in the extracted hook."* Without this the split technically lands but the type surface degrades.

Also note the broader codebase has `(client as any).checkIns.*`, `(client as any).refunds.*` — those routers appear missing from the oRPC client types. Out of scope here but worth flagging to the api-surface auditor.

## Severity summary
- **HIGH:** #1 (inference regression risk), #7 (as-any debt leaking into extracted hooks)
- **MEDIUM:** #2 (transform throw semantics), #3 (missing percentage input variant)
- **LOW:** #5 (default currency)
- **OK:** #4, #6
