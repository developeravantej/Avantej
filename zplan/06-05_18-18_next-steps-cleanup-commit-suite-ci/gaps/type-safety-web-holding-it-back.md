# Type-Safety Audit — `web-holding-it-back-plan.md`

> Auditor: TypeScript type-safety pass · 2026-06-06 · Branch `test/unit-suite-green-and-ci-fix`
> Target: `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/plan/web-holding-it-back-plan.md`
> (separate file — `gaps/type-safety.md` already audits the *server* plan; do not conflate)

## Counts

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 0 |
| MEDIUM | 2 |
| LOW | 3 |
| INFO | 2 |

**Bottom line:** Phase 1 is *mostly* safe — 4 of 5 casts (`sales:476`, `sales:621`, `google-calendar:134`, `google-calendar:404`) can drop cleanly because the fields are present on the typed query data. **The one exception is the headline `review-tab.tsx:425` cast: removing it as the plan describes (T1.2 "keep the field-remap fallbacks") WILL fail `bun check-types`**, because the fallback chain references properties that do not exist on the inferred service row. Phase 3 has two MEDIUM extractions in `installment-plans.tsx` where the dialogs are inline closures with zero props today.

---

## Findings

### [CRITICAL] T1.2 — `review-tab.tsx:425` cast removal breaks `bun check-types` if fallbacks are kept

**Plan claim (T1.2, line 38):** "Replace `r: any` with the inferred element of `listPendingReview().rows` … **Keep the field-remap fallbacks.**"

**Actual:** The two halves of that instruction are contradictory. The service return type is fixed and exact —
`packages/services/src/commission-splits.service.ts:2839` `PendingReviewRow`:
```
{ id, staffId, staffName: string, amountCents: number, note: string|null,
  appointmentId, salesOrderId, createdAt, createdByUserId: string|null,
  createdByName: string, earnedAt, roleType: string|null, trackId: string|null }
```
This is what `commissionSplits.listPendingReview` returns (the procedure at `review.procedures.ts:47` only casts its **params** to `any`; the **return** type is inferred and carries the exact shape above — confirmed present in built dist `packages/api/dist/base-router-Dw75trR6.d.ts:11076` as `createdByName: string|null`, `amountCents: number`).

The component map at `review-tab.tsx:425-435` reads BOTH service names AND non-existent legacy fallbacks:
```ts
calculatedAmount: r.amountCents ?? r.calculatedAmount ?? 0,   // r.calculatedAmount ✗ not on type
notes:            r.note ?? r.notes ?? null,                  // r.notes            ✗ not on type
createdBy:        r.createdByName ?? r.createdBy ?? null,     // r.createdBy        ✗ not on type
```
With `r: any` these compile. Type `r` as the inferred row and the three `?? r.calculatedAmount / r.notes / r.createdBy` branches become **"Property does not exist on type 'PendingReviewRow'"** errors → `bun check-types` fails.

**File:line:** `apps/web/src/components/pages/commissions/review-tab.tsx:425` (consumer); `packages/services/src/commission-splits.service.ts:2839,2953` (truth).

**Fix:** Drop the dead fallbacks when you drop the cast — they are unreachable anyway (service never emits `calculatedAmount`/`notes`/`createdBy`):
```ts
const allRows: PendingReviewRow[] = rawRows.map((r) => ({
  id: r.id, staffId: r.staffId, staffName: r.staffName ?? null,
  calculatedAmount: r.amountCents,
  notes: r.note,
  createdBy: r.createdByName,
  createdAt: r.createdAt, roleType: r.roleType, trackId: r.trackId,
}));
```
Component-local `PendingReviewRow` (`review-tab.tsx:34`) has `staffName: string|null`; service emits `string` — assignment is fine. **Do not follow T1.2 literally; update the plan text** ("keep the fallbacks" is wrong).

---

### [MEDIUM] T3.1 — `installment-plans.tsx` create/edit + deactivate dialogs are inline closures with NO props today

**Plan claim (T3.1, lines 52-56 / "Rules" line 61):** Extract `PlanFormDialog.tsx` + `DeactivatePlanDialog.tsx` with "identical props in/out, identical query keys, no JSX output change."

**Actual:** Unlike `PlanCard` (already a clean props-driven function, line 95), the two dialogs are **inline JSX inside `InstallmentPlansPage`** (create/edit `<form onSubmit={handleSubmit}>` ~664-880; deactivate dialog ~890-945). They have **zero props** — they read parent `useState` setters/state directly:
- Create/edit form closes over: `sheetOpen`, `setSheetOpen`, `editingId`, `form`, `setForm`, `closeSheet`, `handleSubmit` (which itself closes over the create/update mutation + `form`), plus sample-amount state.
- Deactivate dialog closes over: `deactivateDialogOpen`, `setDeactivateDialogOpen`, `deactivateTarget`, `setDeactivateTarget`, `deactivateWarning`, `setDeactivateWarning`, and the deactivate mutation.

So "identical props in/out" is misleading — **there are no props yet**. Extraction needs either (a) threading ~6-7 props + the submit/confirm handler into each new component with new `*Props` interfaces, or (b) lifting form/deactivate state down into the dialog (a behavior/ownership change the plan forbids). `FormState` (line 56) and `InstallmentPlanRow` (line 42) must be exported for the prop types.

**File:line:** `apps/web/src/routes/.../settings/installment-plans.tsx:664` (create/edit), `:890` (deactivate); state at `:315-329`.

**Fix:** Budget for `PlanFormDialogProps` / `DeactivatePlanDialogProps`. Pass `open/onOpenChange/form/onFormChange/editingId/onSubmit/isMutating` to the form dialog; `open/onOpenChange/target/warning/onConfirm/isMutating` to the deactivate dialog. Type-check after each.

---

### [MEDIUM] `PlanCard` extraction needs local helpers + row type lifted (lighter than the dialogs)

**Plan claim (T3.1):** Extract `PlanCard.tsx` (~95-301).

**Actual:** `PlanCard` is already props-clean (line 95: `plan, sampleAmount, isMutating, onEdit, onSetDefault, onDeactivate`). But it depends on three file-local symbols that must move/export with it: type `InstallmentPlanRow` (line 42) and helpers `samplePerInstallment` (line 87) + `fmtPremium` (line 81), plus `cn`. If `PlanFormDialog`/`InstallmentPlansPage` also use `InstallmentPlanRow`/`samplePerInstallment`, put them in a shared module rather than re-declaring (avoid drift). Lower effort than the dialogs but still small type/import-threading, not pure cut-paste.

**File:line:** `installment-plans.tsx:42, 81, 87, 95`.

**Fix:** `installment-plans/types.ts` (export `InstallmentPlanRow`, `FormState`) + `installment-plans/sample-math.ts` (export `samplePerInstallment`, `fmtPremium`); import into `PlanCard`, the dialogs, and the route.

---

### [LOW] `sales/$id.tsx:476` (`createdByName`) — cast removal is SAFE, field is on the type

**Plan claim (T1.2):** Remove `order as { createdByName?: … }` once `createdByName` is on the order type.

**Actual:** `order` is `orpc.salesOrders.getById` data (`$id.tsx:316,320`). The built type already includes `createdByName: string|null` (and `createdBy: string`) — `packages/api/dist/base-router-Dw75trR6.d.ts:11076` (salesOrders block). `order?.createdByName ?? order?.createdBy ?? "—"` compiles. No stub rebuild needed.

**File:line:** `apps/web/src/routes/.../sales/$id.tsx:476`.
**Fix:** Remove cast; keep the `?? order.createdBy ?? "—"` runtime fallback (both fields exist).

---

### [LOW] `sales/$id.tsx:621` (`branchId`) — cast removal is SAFE, field is on the type

**Plan claim (T1.2):** Remove `order as { branchId?: … }`.

**Actual:** `getById` output carries `branchId: string` (same dist block). `order?.branchId ?? undefined` compiles; `?? undefined` guards optional-chain `undefined` for the downstream `branchId?: string` prop.

**File:line:** `apps/web/src/routes/.../sales/$id.tsx:621`.
**Fix:** Drop cast; keep `?? undefined`.

---

### [LOW] `google-calendar.tsx:134` (`orgStatus`) — cast removal SAFE, fully typed return

**Plan claim (T1.2):** Remove `orgStatusRaw as any`.

**Actual:** `googleCalendar` is an in-package router (`packages/api/src/routers/google-calendar.ts`, NOT a server-only stub). `orgStatus` returns a concrete object literal (`google-calendar.ts:141-147`): `{ connectedCount: number, totalTrainerCount: number, eventsSyncedToday: null, conflictsDetected: null, lastOrgSyncAt: string|null }`. Every field the component reads (`connectedCount`, `totalTrainerCount`, `eventsSyncedToday`, `conflictsDetected`, `lastOrgSyncAt`) exists; all reads use `?? null` so literal-`null` typing of two fields is harmless.

**File:line:** `apps/web/src/routes/.../settings/google-calendar.tsx:134`.
**Fix:** `const orgStatus = orgStatusRaw;` (or use `orgStatusRaw` directly).

---

### [INFO] `google-calendar.tsx:404/405` — cast removable, but `calendars: any[]` (line 405) is the real `any` leak

**Plan claim (T1.2):** Remove `calendarDataRaw as any`.

**Actual:** `listConnectedCalendars` returns `{ calendars: Awaited<ReturnType<typeof listGoogleCalendars>>, cachedAt: string }` (`google-calendar.ts:301`); `listGoogleCalendars` items are `{ id, summary, primary, … }` (`packages/services/dist/google-calendar.service*.d.ts`). Removing `as any` at :404 compiles. **But the plan does not touch line 405** `const calendars: any[] = calendarData?.calendars ?? [];` — that explicit `any[]` keeps `cal` (line 509 `.map((cal) => …)` reading `cal.id/.summary/.primary`) untyped. Removing only the :404 cast is cosmetic.

**File:line:** `google-calendar.tsx:404` (cast), `:405` (residual `any[]`).
**Fix:** Remove cast at :404 AND drop the `: any[]` annotation at :405 (`const calendars = calendarData?.calendars ?? [];`).

---

### [INFO] T3.2 — `mapReceiptResponse` is a clean pure-fn extraction (no generics, no closures)

**Plan claim (T3.2):** Extract `mapReceiptResponse` → `map-receipt.ts` (pure fn).

**Actual:** Confirmed pure. Signature `mapReceiptResponse(raw: unknown): ReceiptData` (`$id.tsx:740`). Depends only on the local `ReceiptApiResponse` type (`$id.tsx:716` — move with it) and imported `ReceiptData` (`@/components/pos/receipt-view`). No in-scope generics, no component state, no closures. Internal `raw as ReceiptApiResponse` (line 741) is intentional unknown-narrowing and stays. `SalesStatusBadge` (`:62`), `StatusHistoryCard` (`:71`), `CancelSaleDialog` (`:165`, already has `CancelSaleDialogProps` at `:155`) are likewise already top-level props-driven functions — mechanical extraction; just move import deps (`STATUS_MAP`/`CanonicalStatus` for badge; `CANCELLATION_REASON_CATEGORIES`/`CancellationReasonCategory` for dialog).

**File:line:** `apps/web/src/routes/.../sales/$id.tsx:62,71,155,165,716,740`.
**Fix:** None required; move `ReceiptApiResponse` into `map-receipt.ts`; move `STATUS_MAP` + `CANCELLATION_REASON_CATEGORIES` + derived types alongside the badge/dialog.

---

## Unsafe-pattern inventory (touched files)

| File | Pattern | Line | Financial/auth? |
|---|---|---|---|
| review-tab.tsx | `(r: any)` | 425 | Yes — `calculatedAmount`/`amountCents` (commission $). Removal blocked by CRITICAL; once fixed this is the only `any` gone. |
| review-tab.tsx | `organizationId!` | 393, 465 | Non-null on org id — pre-existing, guarded by `enabled: !!organizationId`. Not in plan scope; leave. |
| google-calendar.tsx | `as any` | 134, 404 | No — counts/calendar metadata. Both removable. |
| google-calendar.tsx | `any[]` | 405 | No. Residual after :404 (INFO). |
| sales/$id.tsx | `as { … }` | 476, 621 | 476 = display name; 621 = `branchId` (RBAC-relevant, only forwarded to refund dialog). Both removable (LOW). |
| sales/$id.tsx | `as ReceiptApiResponse` | 741 | No — intentional `unknown` narrowing in a pure fn; keep. |
| sales/$id.tsx | `as CancellationReasonCategory` | 188-189, 239 | No — enum narrowing from select value; keep. |
| installment-plans.tsx | — | — | No `as any` / `@ts-ignore` / `!` found. Risk is structural (extraction), not casts. |

No `@ts-ignore` / `@ts-expect-error` in any of the four files. No `!` non-null on amount/price fields. Financial-field casting is concentrated entirely in `review-tab.tsx:425` (commission amounts).

---

## Summary

- **Phase 1 is ~80% safe.** Four of five casts (`sales:476`, `sales:621`, `google-calendar:134`, `google-calendar:404`) drop cleanly — fields exist on typed query data; no `server-router-types.ts` stub edits or `packages/api` rebuild needed (these routers are in-package or already correct in dist). The plan's "fix the stale stub then rebuild" branch (T1.1b) is **not exercised** for any of the five.
- **One CRITICAL.** `review-tab.tsx:425`: following T1.2 verbatim ("keep the field-remap fallbacks") fails `bun check-types` — `r.calculatedAmount / r.notes / r.createdBy` are not on the inferred `PendingReviewRow`. Fix = delete the dead fallbacks and map service fields directly. **Update the plan text before executing.**
- **Phase 3 risk lives in `installment-plans.tsx`, not `sales/$id.tsx`.** Sales extractions (`SalesStatusBadge`, `StatusHistoryCard`, `CancelSaleDialog`, `mapReceiptResponse`) are already top-level props-driven/pure → mechanical. The installment dialogs are inline closures with **zero props today**, so "identical props in/out" is wrong — each needs a new `*Props` interface and 6-7 threaded setters/handlers (2× MEDIUM). Export `InstallmentPlanRow` / `FormState` / sample-math helpers into shared modules to avoid drift.
- **Residual `any` to also fix:** `google-calendar.tsx:405` `calendars: any[]` is outside the plan's cast list but is the actual element-type leak; drop the annotation too.
