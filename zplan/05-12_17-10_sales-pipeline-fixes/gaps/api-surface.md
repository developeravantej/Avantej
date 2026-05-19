# API Surface Audit — sales-pipeline-fixes plan

**Plan:** `C:\Project\Avantej\zplan\05-12_17-10_sales-pipeline-fixes\plan\plan.md`
**Date:** 2026-05-12
**Scope:** verification of every oRPC procedure, route file, and native file referenced by the plan.

---

## 1. New procedures the plan creates — collision check

All 9 names confirmed **NOT yet present** on the relevant routers. No collisions.

| Plan procedure | Router file | Status |
|---|---|---|
| `payouts.previewBatch` | `packages/api/src/routers/payouts.ts` | absent — only `list` exists. SAFE TO ADD. |
| `payouts.runBatch` | same | absent. SAFE TO ADD. |
| `packageInstances.listAssignedToMe` | `packages/api/src/routers/package-instances.ts` | absent. SAFE TO ADD. |
| `packageInstances.cancel` | same | absent on `packageInstances` router. NOTE: `memberships.cancel` exists (different semantics — see §8). |
| `packageInstances.freeze` | same | absent on `packageInstances` router. NOTE: `memberships.freeze` exists (different semantics — see §8). |
| `packageInstances.unfreeze` | same | absent. (Closest existing: `memberships.resume`.) |
| `packageInstances.extend` | same | absent. SAFE TO ADD. |
| `commission.runForCancelledAppointment` | (no `commission` router exists; closest is `commissionSplits` / `categoryCommission`) | absent. **INFO** — see §6. |
| `salesOrders.kpiSummary` | `packages/api/src/routers/sales-orders.ts` | absent. SAFE TO ADD. |

---

## 2. Reused procedures — existence + auth check

| Plan name | Real location | Auth | Status |
|---|---|---|---|
| `salesOrders.cancel` | `routers/sales-orders.ts:213` | `protectedProcedure` + `requirePermission("sales","delete")` | EXISTS. Plan implies `sales_management` perm — actual is `sales`. **HIGH** — see §7. |
| `installmentPlans.list` | `routers/installment-plans.ts:16` | `protectedProcedure`; clients bypass perm check; staff need `service_management:read` | EXISTS with `activeOnly: z.boolean().optional()`. **CRITICAL for native** — see §6. |
| `commission.liabilitySummary` | `routers/commission-splits.ts:554` (under `commissionSplits` namespace, not `commission`) | `protectedProcedure` | EXISTS but **namespace mismatch** — plan refers to it as `commission.liabilitySummary` in §3 / Phase 2.2. **MEDIUM** — see §6. |
| `cancelledSales.list` | `routers/cancelled-sales.ts:9` | `protectedProcedure` + `requirePermission("sales","read")` | EXISTS. |
| `permission.list` | `routers/permissions.ts:19` (router exported as `permissionsRouter`, namespace `permissions`) | `protectedProcedure` | EXISTS but **namespace is `permissions` not `permission`**. Plan §3 / 7.x mention `permission.list`. **LOW** typo. |
| `serviceMembers.listMine` | `routers/service-members.ts:33` | `protectedProcedure` | EXISTS. |
| `runAppointmentCommission` | service function — `packages/services/src/appointment.service.ts:690` | internal | EXISTS as private fn. Plan correctly treats as service-level. |
| `voidCommissionSplitsForSalesOrder` | `packages/services/src/commission-splits.service.ts:811` | internal | EXISTS. |
| `processCommissionReversals` | `packages/services/src/payouts.service.ts:35` | internal | EXISTS. |

---

## 3. Web route file existence

| Path | Status |
|---|---|
| `apps/web/src/routes/_authenticated/dashboard/_layout/payouts/view.tsx` | EXISTS (also has `view.lazy.tsx`). |
| `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx` | EXISTS. |
| `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx` | EXISTS. |
| `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx` | EXISTS. |
| `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx` | EXISTS. |
| `apps/web/src/routes/_authenticated/dashboard/_layout/settings/installment-plans.tsx` | EXISTS. |

All present.

---

## 4. Native file existence

Plan paths use `apps/native/src/screens/buy-package/...`. Actual paths use `apps/native/app/(app)/dashboard/buy-package/...` (Expo Router file-based routing).

| Plan path | Actual path | Status |
|---|---|---|
| `apps/native/src/screens/buy-package/plan.tsx` | `apps/native/app/(app)/dashboard/buy-package/plan.tsx` | EXISTS at different path. **MEDIUM** — plan path is wrong; update plan refs. |
| `apps/native/src/screens/buy-package/pay.tsx` | `apps/native/app/(app)/dashboard/buy-package/pay.tsx` | EXISTS at different path. **MEDIUM** — same. |
| `apps/native/src/screens/buy-package/buy-package.context.tsx` | NOT FOUND anywhere | **HIGH** — file does not exist. No `BuyPackageContext` / `buy-package.context` file in `apps/native`. Plan §3 / Phase 3 changes assume a context file that must either be created or the state is held elsewhere (likely the `_layout.tsx`). Implementer must verify before Phase 3. |

---

## 5. Router registration in baseRouter

`packages/api/src/routers/index.ts` shows the canonical pattern: import router, add a key under `baseRouter` object (lines 69–142).

Plan does NOT introduce any new router files — it extends:
- existing `payoutsRouter` (already registered at index.ts:96)
- existing `packageInstancesRouter` (already registered at line 85)
- existing `salesOrdersRouter` (already registered at line 98)
- existing `installmentPlansRouter` (already registered at line 128)

**No baseRouter changes required.** Status: **OK** — no MEDIUM finding here.

If Phase 1 introduces a standalone `commission` router (per `commission.runForCancelledAppointment`), it would need to be added to baseRouter — but the plan currently treats this as a service-internal call, not a procedure. Recommend NOT exposing it at all (see §6).

---

## 6. `installmentPlans.list` reachable from native?

Current auth at `routers/installment-plans.ts:16-57`:
- `protectedProcedure` (requires Better-Auth session).
- Validates `context.member` exists (i.e. user must be a member of the org).
- If `member.role === "client"` → bypasses `requirePermission` and returns plans.
- Else → requires `service_management:read`.

**For native customers** (who authenticate via Better-Auth + are seeded as `members.role = "client"` in the tenant DB): the procedure WILL work, provided:
1. Native session token reaches the server cookie/header (native uses Bearer / cookie depending on stack — verify in Phase 3.1).
2. Customer has a `members` row in the target tenant DB with `role = "client"`. **HIGH RISK** — purely public buyers (no member row yet) will hit the `!context.member` guard → `FORBIDDEN`. Plan §6.3 calls out auth-check verification but does not flag this concrete failure mode.

**Verdict:** procedure is reachable but **only for users who already have a `members` row in the org**. For first-purchase flows where no member row exists yet, this returns 403 — **CRITICAL** if native buy-package supports new customers.

---

## 7. Permission resource enum coverage

Read `packages/services/src/permission.service.ts:23-68`.

| Plan reference | Real `Resource` enum value | Status |
|---|---|---|
| `payout_management` | NOT in enum. `commission_payout` is the closest existing value. | **HIGH** — plan Phase 2.5 says "Add `payout_management` to Resource enum if not present". Confirmed not present; either add it OR reuse `commission_payout` (already used by `payouts.list:52`). Recommend reuse. |
| `package_management` | EXISTS (line 40). | OK. |
| `sales_management` | NOT in enum — only `sales` exists (line 38). Plan uses `sales_management` 4× (Phase 2.5, 6.4, table in §3). | **HIGH** — every reference to `sales_management` will fail `requirePermission`. Use `sales` everywhere. |
| `service_management` | EXISTS (line 32). | OK. |

---

## 8. Cross-cutting findings

### F-1 — `packageInstances.cancel/freeze/unfreeze` collide conceptually with `memberships.*` (MEDIUM)
The `memberships` router (registered at index.ts:137) already exposes `freeze`, `resume`, `cancel`, `listHolds` — but those operate on **membership holds** (medical/travel pauses), NOT on the package instance row itself. They don't transition `package_instances.status` to `frozen`/`cancelled`/`completed`. Plan's new mutations are conceptually different. Recommend:
- Document the distinction in Phase 5 to avoid implementer confusion.
- Consider whether `freeze` on the package instance should reuse the holds mechanism (it likely should — front-desk freeze should write a hold AND flip status).

### F-2 — `commission.runForCancelledAppointment` should not be a procedure (INFO)
Plan §3 lists this as `auth: internal (called from service)`. There's no `commission` router today. Implementing it as an exported service function (called from `appointment.service.ts` cancel branch) is correct. Plan should be explicit that this is NOT exposed via oRPC.

### F-3 — `commissionSplits.liabilitySummary` namespace (MEDIUM)
Plan §3 / Phase 2.2 calls it `commission.liabilitySummary`. Actual is `commissionSplits.liabilitySummary`. Trivial relabel — but the plan's KPI-strip wiring in Phase 2.2 will fail if implementer copies the literal name.

### F-4 — `packageInstances.statusSchema` lacks `frozen`/`completed` (CRITICAL for Phase 5)
`routers/package-instances.ts:41-47` defines:
```ts
const statusSchema = z.enum(["pending","active","expired","exhausted","cancelled"]);
```
Plan Phase 5 adds `frozen` and `completed` to the DB enum but the Zod schema in the router is the gate for `listAll`/`listForClient` filter input. Without updating it, `?status=frozen` filter URLs from the UI will return `BAD_REQUEST`. Plan does not call this out.

### F-5 — `payouts.list` permission already uses `commission_payout` (INFO)
`routers/payouts.ts:49-54` already gates on `commission_payout:read`. Phase 2.5's "add `payout_management` resource" is unnecessary if the team picks reuse — and reuse is the cleaner choice (avoids permission backfill risk noted in §8 of the plan).

### F-6 — `salesOrders.cancel` input shape (LOW)
Existing signature requires `cancelledBy: string`, `refundAmount: number` (mandatory). Plan Phase 6.4 implies `{ id, reason }` only. UI button must construct the full input or backend signature must be relaxed.

---

## Severity summary

| Severity | Count | Items |
|---|---|---|
| CRITICAL | 3 | §6 (native first-purchase 403 path); F-4 (`statusSchema` missing new values); §7 (`sales_management` not a real Resource — every `requirePermission` call will throw) |
| HIGH | 3 | §4 (`buy-package.context.tsx` does not exist); §7 (`payout_management` missing); §2 (`salesOrders.cancel` perm mismatch — `sales_management` vs `sales`) |
| MEDIUM | 4 | §4 (native paths wrong root — `src/screens` vs `app/(app)/dashboard`); F-1 (memberships vs packageInstances naming); F-3 (`commission.liabilitySummary` namespace); F-6 (cancel input shape) |
| LOW | 1 | §2 (`permission.list` → `permissions.list` typo) |
| INFO | 2 | F-2 (commission as service-internal, not procedure); F-5 (reuse `commission_payout` perm) |

---

## Action checklist for plan revision

1. Replace `sales_management` with `sales` everywhere in §3 table and Phase 2.5 / 5 / 6 wording.
2. Either add `payout_management` to `Resource` enum OR change plan to reuse existing `commission_payout`.
3. Update Phase 5 to also extend the Zod `statusSchema` in `routers/package-instances.ts` (add `frozen`, `completed`).
4. Correct native paths: `apps/native/app/(app)/dashboard/buy-package/{plan,pay}.tsx`.
5. Resolve `buy-package.context.tsx` — confirm whether to create it or move state to `_layout.tsx`.
6. Phase 3.1 — explicitly verify behaviour for native customers WITHOUT a tenant `members` row; loosen `installmentPlans.list` if needed (e.g. drop the `!context.member` guard, or add a `publicProcedure` variant).
7. Rename `commission.liabilitySummary` → `commissionSplits.liabilitySummary` in §3 + Phase 2.2.
8. Rename `permission.list` → `permissions.list`.
9. Document Phase 5 freeze semantics vs existing `memberships.freeze` (holds).
10. Phase 6.4 — align `salesOrders.cancel` input shape with the actual schema.
