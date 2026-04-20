# Audit: 04-19_19-31_tier4-new-surfaces

**Audited:** 2026-04-20
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard
| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 0 hard breaks (all missing files are new creates) |
| Missing impact | 2 backend prerequisites not flagged as blockers |
| Unresolved questions | 0 unresolved markers in plan (Q4 + Q8 anticipated correctly) |
| Execution state | NOT STARTED |

## Findings

### Structural gaps
None — plan has all 8 sections with substantive content. Journeys explicit "Where it lives" present. Phases deliver complete journeys.

### Broken references (plan → codebase)

1. **CRITICAL — `package_instances.staffId` does not exist.**
   - File: `packages/db/src/schema/tenant/package-instances.ts`
   - Plan §Phase 4E uses 3-step client-side join (`instance.staffId === member.id`) — column does not exist.
   - Plan Q4 anticipates this with a fallback: add `staffId` filter to `installments.adminOverview` as backend task.
   - That backend change must happen first, or Phase 4E silently breaks.

2. **MEDIUM — `appointments.list` has no `clientId`/`userId` filter param.**
   - File: `packages/api/src/routers/appointments.ts`
   - Input accepts: `organizationId`, `branchId`, `serviceId`, `trainerId`, `status`, `startFrom`, `startTo`, `limit`. No `clientId`.
   - Plan §Phase 4F calls `appointments.list({ clientId: id, ... })` for Customer 360 Appointments tab — param will be silently ignored.
   - Needs backend filter addition before Phase 4F can execute.

3. **MEDIUM — `customerDirectory.getById` field name mismatch.**
   - File: `packages/api/src/routers/customer-directory.ts` line 81
   - Router takes `memberId`, not `id`. Plan says `{ organizationId, id: params.id }`.
   - Auto-fix: change to `{ organizationId, memberId: params.id }`.

4. **MEDIUM — `salesOrders.list` has no `search` param.**
   - File: `packages/api/src/routers/sales-orders.ts`
   - No `search` field in input schema. Plan's Q8 fallback (client-side filter over cached list) is the correct path — confirm Q8 is the chosen approach.

### Missing impact
- Phase 4E and Phase 4F both depend on backend changes not enumerated in the plan's Impact section. These should be flagged as blockers.

### Unresolved questions
None remaining as `TBD`/`TODO`/`???` in plan. Q4 and Q8 both have anticipated fallbacks.

### Execution & verification gaps
- No `execute/log.md` → plan hasn't been executed
- No `chrome-test/` → no browser verification plan
- No `research/brief.md`
- No `prompts/` populated

### Pre-implementation steps
- `cmdk` not installed in `apps/web` (`node_modules/cmdk` absent, not in `apps/web/package.json`). Run `bun add cmdk` before Phase 4G.
- `date-fns` not installed — implement `Intl.RelativeTimeFormat` fallback directly in Phase 4D.

### Verified correct
- All 12 API routers referenced in the plan exist with expected procedures.
- Trainer role string `"trainer"` correct (`hasRole(["trainer", "staff"])` in `app-sidebar.tsx` line 659).
- `useDebounce` hook exists at `apps/web/src/hooks/useDebounce.ts`.

## Priority Actions
1. Add backend changes (Phase 0) before Phases 4E/4F: `staffId` filter on `installments.adminOverview` and `clientId` filter on `appointments.list`.
2. Auto-fix `customerDirectory.getById` param name (`id` → `memberId`).
3. Add `bun add cmdk` step to Phase 4G prerequisites.
4. Use `Intl.RelativeTimeFormat` instead of `date-fns` in Phase 4D.

## Status rationale
- needs-attention: 2 critical backend dependencies that plan doesn't enumerate as blockers, plus 1 field-name mismatch that will fail at runtime.
