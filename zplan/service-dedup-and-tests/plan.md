# Plan: Service Form/Dialog Dedup + Restore TrainersTab + Test Coverage

**Created:** 2026-05-29
**Branch:** Checkpoint_May_29
**Scope:** `apps/web` only. Two phased efforts in one plan.
**Decisions (confirmed with user):**
1. Restore the missing TrainersTab into the live dialog (treat as regression).
2. Delete the orphaned `/service/view` route + base files (max dead-code removal).
3. Both dedup + tests, phased (dedup first so tests cover the consolidated code).

---

## Verified facts (from investigation)

### Duplication — 6 files, only 2 live
| File (`apps/web/src/components/forms/`) | LOC | Importer | Status |
|---|---|---|---|
| `service-form.tsx` | 981 | `tables/service/view/data-table.tsx` | DEAD (orphan route only) |
| `service-form-a.tsx` | 1013 | `pages/services/services-page.tsx` | **LIVE** |
| `service-detail-dialog.tsx` | 388 | `tables/service/view/data-table.tsx` | DEAD (has TrainersTab) |
| `service-detail-dialog-a.tsx` | 434 | `pages/services/services-page.tsx` | **LIVE** (no TrainersTab) |
| `service-detail-dialog-b.tsx` | 612 | none | DEAD |
| `service-detail-dialog-c.tsx` | 578 | none | DEAD |

- LIVE route: `routes/_authenticated/dashboard/_layout/service/view.tsx` → `pages/services/services-page.tsx` → `-a` pair. Sidebar links here.
- ORPHAN route: `routes/_authenticated/service/view.tsx` → `tables/service/view/data-table.tsx` → base pair. Zero inbound links/redirects.
- Forms: zod schema + types + mutation/submit block are **byte-identical** between `service-form.tsx` and `service-form-a.tsx`; only JSX layout differs. Extraction is genuinely valuable.
- Dialogs: base/`-b`/`-c` contain a full `TrainersTab` (serviceMembers list + assign/remove via react-query). The LIVE `-a` **dropped it entirely** and fetches via `useState`+`useEffect`→`client.services.getById`. → functional regression.

### Test coverage — claim corrected
- Real ratio ~**9%** (45 tests / 490 prod files), not 8%.
- "Zero hook/route tests" is **FALSE**: 5 hook tests + 9 route tests already exist (shallow smoke).
- Infra is mature: `vitest.config.ts` (jsdom, `@/` aliases), `__tests__/setup.ts` (RTL cleanup + ResizeObserver/matchMedia shims), `helpers/mock-client.ts` (Proxy deep-mock of oRPC at `@/utils/orpc`), `helpers/render-with-providers.tsx` (QueryClient wrapper).
- Bottleneck is authoring effort, not setup.

---

## User journeys affected
1. **View/manage services** (live `/dashboard/service/view`): list → open detail dialog → (restored) assign/remove trainers; create/edit service via form. Must remain intact and gain back trainer assignment.
2. **Orphan `/service/view`**: currently unreachable → removed. No user impact (no nav path to it).

---

## PHASE 1 — Dedup + restore (do first)

### Step 0 — Safety checks (no code changes)
- Confirm `serviceMembers` router still exposes `listForService`, member list, assign, remove (the restored tab depends on them). Grep `packages/api` / `apps/server` routers.
- `git log --oneline -- apps/web/src/components/forms/service-detail-dialog-a.tsx` to confirm trainer removal was a layout experiment, not a deliberate product cut.

### Step 1 — Extract shared form logic
- Create `apps/web/src/features/services/service-form-schema.ts`: move `timePresetConfigSchema`, `baseServiceFields`, `serviceFormSchema`, `ServiceFormInput/Output` (currently `service-form-a.tsx:26-68`).
- Create `apps/web/src/features/services/useServiceFormMutation.ts`: the `useApiMutation` create/update block + `wireSchedulingType` mapping + `initialData→defaultValues` mapping.
- Refactor LIVE `service-form-a.tsx` to import both. Net effect: ~1000-line monolith shrinks; logic single-sourced.

### Step 2 — Extract & restore TrainersTab
- Create `apps/web/src/features/services/ServiceTrainersTab.tsx` from the TrainersTab block in base `service-detail-dialog.tsx` (react-query: `orpc.serviceMembers.listForService`, members list, assign/remove mutations + invalidation).
- Wire `<ServiceTrainersTab serviceId=... organizationId=... />` into LIVE `service-detail-dialog-a.tsx`. Place it as a section within the two-column layout (the `-a` dialog removed tabs; add a "Trainers" section/card rather than reintroducing a Tabs shell unless cleaner).
- **Risk/decision:** layout fit of trainers into the two-column dialog — keep visual style consistent with `-a`.

### Step 3 — Delete dead code (after Steps 1–2 land)
- Delete `service-detail-dialog-b.tsx`, `service-detail-dialog-c.tsx` (zero importers).
- Delete orphan route `routes/_authenticated/service/view.tsx`.
- Delete `tables/service/view/data-table.tsx` (sole importer of base pair) — **verify** nothing else imports it first.
- Delete base `service-form.tsx` + `service-detail-dialog.tsx` (now unimported once TrainersTab extracted + data-table gone).
- Let TanStack Router regenerate `routeTree.gen.ts` (dev server / build).
- **Optional polish:** rename `service-form-a.tsx`→`service-form.tsx` and `service-detail-dialog-a.tsx`→`service-detail-dialog.tsx` (now the only versions); update imports in `services-page.tsx`. Skippable to reduce churn.

### Step 4 — Verify Phase 1
- `bun check-types` (root), `bun check` (oxlint).
- Build web.
- Manual (live route `/dashboard/service/view`): list renders; open a service → trainer assign/remove works (assign a member, confirm persists, remove); create a service; edit a service. Confirm orphan `/service/view` is gone (404/redirect).

**Expected removal:** ~1,800–2,400 LOC of dead/duplicated code; trainer assignment restored to live UI.

---

## PHASE 2 — Highest-leverage tests (after Phase 1 verified)

Test the consolidated code + pure logic where bugs hide. All use existing infra (`mock-client.ts`, `render-with-providers.tsx`).

### Tier 1 — pure, cheap, high bug-catch
- `useDebounce` — fake timers (does NOT currently exist despite memory note).
- `use-command-palette` — external store + ⌘K toggle (pure, no I/O).
- `lib/appointment-mapper.ts` — date coercion + status/title mapping.
- `lib/period.ts` — date-range math (off-by-one prone).
- **`features/services/service-form-schema.ts`** (new) — validation cases: required fields, time-preset config, scheduling type.
- **`features/services/useServiceFormMutation.ts`** (new) — create vs update branch, `wireSchedulingType` mapping, invalidation key (via `mockClient`).

### Tier 2 — deepen existing central hooks
- `useApiMutation` — assert `errorMessage: false` suppression, function-form messages, `invalidate` keys (extend existing test).
- `useUserContext` — assert system-admin bypass + no-current-org fallback in `hasPermission/hasAnyPermission/hasRole`.

### Tier 3 — optional breadth (only if time)
- `ServiceTrainersTab` component test (assign/remove happy path via `mockClient`).

### Verify Phase 2
- `cd apps/web && bun test` green. Report new test count.

---

## Risks
- **TrainersTab layout fit** into the two-column `-a` dialog (Step 2) — main design risk.
- **Hidden importers** of base files / data-table — must grep-verify before each delete (Step 3).
- **serviceMembers API** must still exist (Step 0 gate) — if it was removed server-side, restoring the tab is larger than planned; pause and reassess.
- Renaming `-a` files touches importers — keep optional/atomic.

## OUTCOME — Phase 1 (2026-05-29)

**Kept (verified): web type-check ✅, lint ✅ (0/0 on touched files), web vitest 44/45 (1 pre-existing dashboard failure).**
- Deleted 8 dead files (~3,400 LOC): dialog-b/-c, base form + dialog + service-details-tab, orphan route + tables/service/view/{data-table,columns}. routeTree regenerated.
- Extracted `features/services/service-form-schema.ts` + `useServiceFormMutation.ts`; live `service-form-a.tsx` slimmed to use them.
- **Backend bug fixed** (`services/crud.procedures.ts:getById`): null-branch services were unviewable because the write-guard `guardInputBranchForContext` rejects null branchId. Now only enforces branch scoping when `service.branchId` is set. Confirmed fixed in-browser.

**REVERTED — trainer restoration (the Q1 "restore TrainersTab" decision was wrong):**
- User flagged that services shouldn't have trainers assigned. Investigation confirmed: `serviceMembers` assignment is owned by the **Trainers side** (`components/trainers/TrainerServicesSection.tsx` in `TrainerFormDialog`); appointment booking reads `listForService`; the trainer-facing "My Services" page reads `listMine`. The Design-A dialog dropped `TrainersTab` **intentionally** (redundant + let you assign non-trainers).
- Removed `ServiceTrainersTab` + its wiring from `service-detail-dialog-a.tsx`. Deleted the component.
- Cleaned up the one test assignment created during verification (removed via authenticated rpc; service now has 0 assigned members).
- Recorded in memory: `project_service_trainer_assignment_ownership`.

## Out of scope
- The other oversized route god-components (`approvals.tsx`, `sales/view.tsx`, etc.) — separate effort.
- `apps/server` router LOC / test gaps — separate effort.
