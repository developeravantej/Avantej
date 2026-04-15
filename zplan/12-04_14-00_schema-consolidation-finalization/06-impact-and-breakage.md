# Impact & Breakage Analysis

For every file this plan touches or depends on, map callers, deployment coupling, and what breaks if things go wrong.

---

## 1. `apps/server/scripts/migrate-schema-consolidation.ts` — DELETED in Phase 1

**Why removed:** In revision 2, the data migration moved into the SQL migration file itself (`packages/db/src/migrations/0010_schema_consolidation.sql`). A separate TS script is no longer needed and was broken anyway (imported deleted schema modules, dereferenced dropped columns).

**Callers:** None in the codebase. Only referenced in historical docs (`zplan/11-04_22-20_schema-consolidation/`, `docs/SCHEMA_CONSOLIDATION.md`) — those can stay as historical records.

**What the deletion breaks:** Nothing in code. Developers following the original (pre-revision) plan would look for this script and be confused. Phase 1 commit message should explicitly call out the deletion and point at `0010_schema_consolidation.sql` as the replacement.

---

## 2. `apps/server/scripts/seed-business-data.ts` & `seed-app-data.ts`

**Current state:** Doc says both were edited to insert services instead of packages. Not verified since the edit.

**Who depends on it:**
- Manual dev workflow: fresh DB → run seed → have data to develop against
- Not invoked by tests (integration tests use fixtures in `tests/helpers/fixtures.ts`)
- Not invoked by CI

**What breaks:**
- If still broken, developers running `bun run scripts/seed-business-data.ts` after cloning get a runtime error and no seed data.
- Low blast radius. But developer friction is real.

**Deployment coupling:** None.

---

## 3. `apps/server/scripts/test-write-endpoints.ts` & `inspect-and-cleanup-test-data.ts`

**Current state:** Doc says stale references were removed. Not verified.

**Who depends on:** Manual dev use only.

**What breaks:** Same as seeds — runtime errors in manual dev flow, no user impact.

---

## 4. `packages/services/src/sales-order.service.ts` — `cancelSalesOrder`

**Revision 2 changes:**

1. Return shape (from previous refactor): was `{ salesOrder, cancelledSale }`, now flat `SalesOrder`. This is already in the source.
2. **NEW:** `refundAmount` parameter now persists. Previously accepted but silently dropped. Phase 1 Task 1.2.
3. **NEW:** Range validation added. Rejects `refundAmount < 0` or `> existing.totalAmount`.

**Who imports `cancelSalesOrder`:**
- `packages/api/src/routers/sales-orders.ts` — the procedure handler calling the service
- `apps/server/src/tests/unit/services/sales-order.test.ts` — existing tests + 3 new ones from Phase 4 Task 4.1b
- Grep for any other callers:
  ```bash
  grep -rn "cancelSalesOrder" apps/server packages/api packages/services
  ```

**What breaks:**
- Callers that passed `refundAmount` expecting it to be stored somewhere — those were ALREADY broken (silently dropping data) and are now fixed
- Callers that passed `refundAmount > totalAmount` (if any existed) — will now throw; this is a correctness fix
- The frontend cancel-sale dialog — no change needed; it already collects a refund amount and sends it, which now actually gets persisted

**Deployment coupling:** Backend-internal. Router handler change is in the same commit. Frontend already sends the field.

## 4b. `packages/api/src/routers/cancelled-sales.ts`

**Revision 2 change:** Both `list` and `getById` procedures change their `cancelledAmount` return mapping from `row.totalAmount` (always wrong for partial refunds) to `row.cancelledAmount ?? row.totalAmount` (persisted value with fallback).

**Who consumes it:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx` — reads `cancelledAmount` for display

**What breaks:** Nothing, as long as the SQL migration backfills `sales_orders.cancelled_amount` from `cancelled_sales.cancelled_amount` — which it does in Section 3d. The fallback handles any rows that slip through.

**Deployment coupling:** Same commit as the sales-order.service.ts fix and the 0010 migration. Cannot be split.

---

## 5. `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`

**Current state:** Render path broken (Phase 3 fixes this).

**Who depends on it:**
- `apps/web/src/routeTree.gen.ts` — auto-generated; references the route file. Regenerates on next `bun dev:web` start.
- The sidebar navigation (`apps/web/src/components/app-sidebar.tsx`) — has a link to this route.

**What breaks if we don't fix:**
- Any admin who clicks "Package Instances" in the sidebar gets a crash as soon as there's data.
- Empty-state path may work fine (no rows → no crash) — masking the bug until real data arrives.
- The create path works, so admins can still CREATE instances but cannot SEE them.

**Deployment coupling:** Frontend-only fix. No backend changes needed. Can hotfix independently of the rest of the plan.

---

## 6. Schema changes (already in source, applied in Phase 2)

### `packages/db/src/schema/tenant/services.ts`

Columns added: `sessionCount`, `expirable`, `expiryDays`, `expiryDate`. `type` enum now accepts `"both"`.

**Who reads these columns:**

| Consumer | File | Risk |
|---|---|---|
| `services.list` router | `packages/api/src/routers/services.ts` | Low — passes through |
| `services.create` / `.update` | same | Low — both accept the new fields |
| `services.service.ts` (business logic) | `packages/services/src/service.service.ts` | Low |
| `packages/view.tsx` (web) | `apps/web/src/routes/.../packages/view.tsx` | **Filters on `sessionCount > 0` client-side** |
| `packages/instances/view.tsx` (web) | same folder, instances | Uses `client.services.list` for dropdown and name mapping |
| `service-form.tsx` (web) | `apps/web/src/components/forms/` | Exposes the new fields in UI |
| Native app | `apps/native/...` | **OUT OF SCOPE** — but note: native's Buy Package flow still calls `orpc.packages.list` which is deleted. Will break separately. |

**What breaks if Phase 2 migration drops then re-adds these wrongly:** Every caller above falls back to `undefined` / crashes. Phase 2 Task 2.3 specifically checks the generated SQL to confirm the adds are correct.

### `packages/db/src/schema/tenant/sales-orders.ts`

Columns added: `cancellationNumber` (unique), `cancellationDate`, `cancellationReason`, `cancelledBy`.

**Who reads these:**

| Consumer | File | Risk |
|---|---|---|
| `sales-order.service.ts` — `cancelSalesOrder`, `generateCancellationNumber` | writes them | Medium |
| `cancelled-sales.ts` router | reads them as alias | Medium — query WHERE status='cancelled' + maps to legacy shape |
| `cancelled-sales/view.tsx` (web) | consumes the router | Low |

### `packages/db/src/schema/tenant/package-instances.ts`

Column added: `serviceId uuid NOT NULL FK → services.id`. Column removed: `packageId`.

**Who reads these:**

| Consumer | File | Risk |
|---|---|---|
| `package-instance.service.ts` | creates/reads rows | Fixed |
| `packageInstances` router | accepts `serviceId`, returns `serviceId` in rows | Fixed |
| `packages/instances/view.tsx` (web) | **BROKEN reads** | Phase 3 fix |
| Native app purchase flow | `apps/native/.../buy-package/pay.tsx` | **OUT OF SCOPE but broken** |

**NOT NULL risk:** If the data migration (Task 2.2) leaves any row with `service_id IS NULL`, Task 2.4's migration will fail on the `NOT NULL` ADD. Task 2.3 includes a pre-flight check for this.

---

## 7. Dropped tables — who still references them?

| Table | Expected references after branch | Found references today |
|---|---|---|
| `packages` | 0 in source, may have some in `docs/` and `zplan/` | `apps/server/scripts/migrate-schema-consolidation.ts` (broken import — fixed in Phase 1), `packages/db/src/migrate-tenant.ts` (embedded SQL — out of scope) |
| `package_assignments` | 0 | `packages/db/src/migrate-tenant.ts` only |
| `service_rules` | 0 | Docs only |
| `service_commission_config` | 0 | Docs only |
| `cancelled_sales` | 0 | `migrate-schema-consolidation.ts` (fixed in Phase 1), `migrate-tenant.ts` (out of scope) |

**Grep command to verify during execution:**
```bash
grep -rn "from \"@avantej-core/db/schema/tenant/\(packages\|package-assignments\|service-rules\|service-commission-config\|cancelled-sales\)\"" apps packages
```

Must return zero results after Phase 1. Currently returns 1 result (the broken migration script).

---

## 8. Deployment coupling matrix

| Change | Must deploy together with | Can deploy independently of |
|---|---|---|
| Phase 1 (script fix) | Nothing — script is dev-only | Everything |
| Phase 2 (DB migration) | The app code that reads/writes the new schema (already merged) | — |
| Phase 3 (web bug fix) | Phase 2 (needs migrated DB to verify) | Phase 4, Phase 5 |
| Phase 4 (tests) | Phase 2 (integration tests hit live DB) | — |
| Phase 5 (manual UI) | Phases 2 and 3 | — |

**The critical coupling:** Phase 2's SQL migration and the already-merged app code must ship as a single atomic deployment. If the SQL migration lands without the code, the code still queries the old schema and every request fails. If the code lands without the migration, inserts/reads of the new columns fail. **Both already coexist on this branch** — they must be deployed as one commit/release.

---

## 9. What breaks if this plan is abandoned mid-execution?

| Abandon point | State | Recoverability |
|---|---|---|
| Mid-Phase 1 | Script is still broken; dev DB untouched | Full — nothing destructive happened |
| Mid-Phase 2, after script runs, before db:migrate | Data copied to new columns; legacy tables still exist; new columns have data | Full — re-run script is idempotent |
| Mid-Phase 2, after db:migrate | Dev DB on new schema; no legacy tables | Partial — restore from Task 2.1 backup |
| Mid-Phase 3 | DB migrated; instances page crashes on render | Full — revert Phase 2 is hard; fix Phase 3 is easy |
| Mid-Phase 4 | Everything works but some tests are broken | Full — keep fixing tests |
| Mid-Phase 5 | Everything works but an edge case is broken | Full — file a bug, continue |

**Safest abandon points:** End of Phase 1, end of Phase 4.
**Worst abandon point:** Mid-Phase 2 after `db:migrate` but before verification. Always have the Task 2.1 backup ready.
