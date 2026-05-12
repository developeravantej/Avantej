## Agent: 1A (Migration) — Phase 1
**Completed:** 2026-04-21T16:55

### What I Did
- packages/db/src/schema/tenant/check-ins.ts: added clientDisplayName text column between `notes` and `checkedInBy`
- packages/db/src/migrate-tenant.ts: added MIGRATION_0028_CHECKIN_DISPLAY_NAME constant before TENANT_MIGRATIONS array, and appended `0028_checkin_display_name` entry as last element

### Decisions Made
- Column placed between `notes` and `checkedInBy` for logical grouping
- Used `IF NOT EXISTS` in ALTER TABLE for idempotency

### Issues Encountered
- None

---
## Agent: 1C (POS Service) — Phase 1
**Completed:** 2026-04-21T17:00

### What I Did
- `packages/services/src/pos.service.ts`: removed `ilike` and `or` from drizzle-orm imports (no longer used after walk-in removal)
- `packages/services/src/pos.service.ts`: removed `walkInCustomers` schema import (confirmed unused after all three tasks)
- `packages/services/src/pos.service.ts` (Task 1.5): added walk-in + package guard before the transaction opens — throws `BAD_REQUEST` if `customerType === "walk_in"` and any item has `type === "package"`
- `packages/services/src/pos.service.ts` (Task 1.4b): removed the `else if (input.customerId !== "anonymous")` block inside the transaction that queried `walkInCustomers` for a legacy saved walk-in lookup
- `packages/services/src/pos.service.ts` (Task 1.4): removed the entire `// ---- Walk-in customers ----` block from `searchPosCustomers` (the `if (results.length < 10)` block that queried the `walkInCustomers` table with ILIKE)

### Decisions Made
- `walkInCustomers` import removed: after all three tasks, the only remaining reference was `walkInCustomerId` in the `packageInstances` insert — that is a plain string column value (`input.customerId`), not a table reference; the `walkInCustomers` table object itself was unused
- `ilike` and `or` removed: both were exclusively used in the deleted walk-in search block
- `walkInCustomerId` column write (line 539) kept unchanged — still correct as a string value set from `input.customerId`

### Issues Encountered
- None

---
## Agent: 1B (Check-ins Service) — Phase 1
**Completed:** 2026-04-21T17:05

### What I Did
- `packages/services/src/check-ins.service.ts` (Task 1.2): Updated `CheckInInput.clientId` to optional (`clientId?: string`), added `clientDisplayName?: string` field
- `packages/services/src/check-ins.service.ts` (Task 1.2): Removed the `else` block that validated walk-in existence in `walkInCustomers` table
- `packages/services/src/check-ins.service.ts` (Task 1.2): Added `resolvedClientId` synthesis — `crypto.randomUUID()` for walk-ins, `input.clientId ?? ""` for members
- `packages/services/src/check-ins.service.ts` (Task 1.2): Replaced all `input.clientId` references in anti-duplicate query, insert `.values()`, and audit `changes` with `resolvedClientId`
- `packages/services/src/check-ins.service.ts` (Task 1.2): Added `clientDisplayName` to insert `.values()` — trimmed string for walk-ins, null for members
- `packages/services/src/check-ins.service.ts` (Task 1.3): Added `clientDisplayName?: string | null` parameter to `resolveClientDisplayName`; walk-in path now prefers stored name, falls back to legacy DB lookup, final fallback changed from `"Unknown client"` to `"Walk-in"`
- `packages/services/src/check-ins.service.ts` (Task 1.3): Added `displayNameOverrides?: Map<string, string>` parameter to `batchResolveDisplayNames`; seeded map from overrides before DB queries; walk-in DB query skips IDs already resolved; end fallback changed to `"Walk-in"` for walk-ins
- `packages/services/src/check-ins.service.ts` (Task 1.3): Updated `listCheckIns` to build `overrides` map from `rawRows.clientDisplayName` before calling `batchResolveDisplayNames`

### Decisions Made
- Anti-duplicate check for walk-ins is now effectively a no-op since each UUID is unique — this is intentional per spec
- `walkInCustomers` import retained: still referenced in legacy fallback path in `batchResolveDisplayNames`
- `crypto.randomUUID()` used without import — globally available in Node 18+/Bun

### Issues Encountered
- `clientDisplayName` on the `checkIns` insert `.values()` will produce a type error until the parallel migration agent's schema change lands (column added by Agent 1A)

---
## Agent: 3A (Customers UI) — Phase 3
**Completed:** 2026-04-21T17:10

### What I Did
- apps/web/src/routes/_authenticated/dashboard/_layout/customers/view.tsx: removed Walk-in tab, removed `WalkInCustomersPage` import, removed `useUserContext` import and `hasPermission` usage, removed `ConsolidatedTabs` and `validateSearch`/navigation logic
- apps/web/src/routes/_authenticated/dashboard/_layout/customers/walk-in/view.tsx: changed redirect tab from `"walk-in"` to `"registered"`
- apps/web/src/components/pages/customers/walk-in-page.tsx: DELETED

### Decisions Made
- Removed `ConsolidatedTabs` entirely rather than keeping it with a single tab — with only one content area and no tab switching needed, a bare `<RegisteredCustomersPage />` render is cleaner and avoids unnecessary `validateSearch` + navigation state
- Removed `validateSearch` from the route since there is no longer a `tab` search param to validate

### Issues Encountered
- None

---
## Agent: 2A (Drop-in + Router) — Phase 2
**Completed:** 2026-04-21T17:15

### What I Did
- `packages/api/src/routers/check-ins.ts` (Task 2.3): Changed `clientId` from `z.string().min(1)` to `z.string().uuid().optional()`, added `clientDisplayName: z.string().trim().max(120).optional()`, added `.superRefine()` to enforce `clientId` required when `clientType === "member"`. Added `clientDisplayName: input.clientDisplayName` to the `recordCheckIn` service call.
- `apps/web/src/components/attendance/drop-in-form.tsx` (Task 2.1): Rewrote walk-in branch — when `clientType === "walk_in"`, hides clientId input and shows displayName input with updated helper text. Updated `canSubmit` to `clientType === "walk_in" || clientId.trim().length > 0`. Rewrote mutation payload to send separate member/walk-in shapes. Removed "Create New Walk-in" shortcut section. Removed unused `Link`, `UserPlus` imports.

### Decisions Made
- Used `.superRefine()` on the Zod schema rather than an inline handler guard — keeps validation co-located with the schema definition, produces a proper field-level error on `clientId`.
- Kept the `displayName` state name in the form (unchanged) — it maps naturally to the new `clientDisplayName` API field.

### Issues Encountered
- None

---
## Agent: 3B (Router/Service) — Phase 3
**Completed:** 2026-04-21T17:15

### What I Did
- packages/api/src/routers/walk-in-customers.ts: gutted to stubs — `list` returns empty `{ items: [], total: 0 }`, all other procedures throw `BAD_REQUEST` via `deprecated()` helper
- packages/services/src/walk-in-customers.service.ts: DELETED
- packages/services/src/index.ts: removed `export * from "./walk-in-customers.service"` and its comment block
- apps/web/src/components/app-sidebar.tsx: confirmed clean — no `/dashboard/customers/walk-in` links or "Walk-in" nav items found

### Decisions Made
- Matched import pattern from original file: `import { protectedProcedure } from "../index"` (not `"../procedures"`)
- Task 3.5 (pos.service.ts verify): grep confirmed only two comment references remain (`// member.userId OR walk_in_customers.id`), no table imports or queries — nothing to action

### Issues Encountered
- None

---
## Agent: 3C (Mock Client) — Phase 3
**Completed:** 2026-04-21T17:15

### What I Did
- apps/web/src/__tests__/helpers/mock-client.ts: updated `walkInCustomers.list` mock to return `{ items: [], total: 0 }` (matching the stubbed router's response shape)
- apps/web/src/__tests__/helpers/mock-client.ts: added `getById` mock (was missing) — set to `mockRejectedValue(new Error("BAD_REQUEST"))`
- apps/web/src/__tests__/helpers/mock-client.ts: changed `create`, `update`, `deactivate` from `mockResolvedValue({})` to `mockRejectedValue(new Error("BAD_REQUEST"))` to match production router stubs
- `checkIns` / `recordCheckIn` is not present in this file — no changes needed there

### Decisions Made
- Used `mockRejectedValue` for the stub procedures so any test that accidentally calls them will fail visibly rather than silently succeeding with an empty object
- Added `getById` even though it wasn't in the original mock — the production router now has this stub, and tests may call it

### Issues Encountered
- None

---
## Agent: 1D (Tests) — Phase 1
**Completed:** 2026-04-21T17:30

### What I Did
- `apps/server/src/tests/unit/services/check-ins.test.ts`: CREATED — 7 unit tests covering the anonymous walk-in anonymization path in `recordCheckIn`
- `apps/server/src/tests/unit/services/pos.service.test.ts`: CREATED — 6 unit tests covering the walk-in package guard in `recordPosSale` and the walk-in exclusion in `searchPosCustomers`

### Decisions Made
- Unit tests chosen over integration for both files: the service logic under test (UUID synthesis, package guard, walk-in search exclusion) is all in pre-transaction validation or pure in-memory branching — no real DB needed
- Inline mock DB objects built per-test (not `createMockTenantDb()`) because check-ins.service.ts uses `query.checkIns.findFirst` which is absent from the shared factory, and the transaction mock requires a controlled inner `tx` object
- `writeAudit` inside the transaction also calls `insert().values().returning()`, so assertions check `calls[0][0]` (first call = checkIns insert) rather than asserting exactly one call
- `searchPosCustomers` control panel mock uses a select-chain mock (select→from→where→Promise) to match drizzle's query builder pattern used in the service
- Pre-existing failures (19 tests across cancelSalesOrder, evaluateAndLockIfOverdue, etc.) confirmed pre-existing — not caused by these new test files

### Issues Encountered
- Initial assertion `expect(mockValues).toHaveBeenCalledTimes(1)` failed because `writeAudit` inside the tx also calls `insert().values()` — fixed by checking `calls.length >= 1` and inspecting `calls[0][0]`

---

---

## Run Summary: 2026-04-21 17:55
**Trigger:** /execute the plan

### Phase outcomes
- Phase 1A (Migration): pass — client_display_name column added; migration 0028 embedded
- Phase 1B (Check-ins Service): pass — anonymous walk-in UUID synthesis; displayName persistence; display-name resolution updated
- Phase 1C (POS Service): pass — walk-in search branch removed; legacy createSalesOrder lookup removed; walk-in+package guard added
- Phase 1D (Tests): pass — 13 new unit tests, all green
- Phase 2A (Drop-in + Router): pass — form simplified; Zod schema relaxed
- Phase 3A (Customers UI): pass — Walk-in tab removed; redirect fixed; walk-in-page.tsx deleted
- Phase 3B (Router/Service): pass — router gutted to stubs; service deleted; barrel export removed
- Phase 3C (Mock Client): pass — mocks updated to match stubs

### Final build status
- type check: pass (pre-existing errors only — none in our files)
- lint: pass (0 errors in our files)
- new tests: 13/13 pass
- pre-existing failures: 40 (unrelated)

### Cross-agent decisions
- Agent 3A removed ConsolidatedTabs (renders RegisteredCustomersPage directly) — clean
- walkInCustomers schema import removed from pos.service.ts — confirmed unused
- bun:test module resolution warnings in new test files are pre-existing repo-wide
