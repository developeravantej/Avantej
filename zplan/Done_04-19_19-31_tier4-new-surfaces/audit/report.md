# Audit: 04-19_19-31_tier4-new-surfaces

**Audited:** 2026-04-20 (second pass — full re-audit)
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 4 found; 3 already annotated (prior pass), 1 new (fixed this pass) |
| Missing impact | previously addressed (app-layout.tsx note already in §6) |
| Unresolved questions | 2 genuine BLOCKED items (Q4, appointments.list clientId) — annotated |
| Execution state | not started |

---

## Structural Completeness (8/8)

All 8 required sections are present with substantive content:

1. Overview — problem table, 9 work areas, 4 key constraints ✓
2. Result — Before/After for Admin / Staff / All users ✓
3. Technical Architecture — 9 subsections (3A–3I), component trees, data shapes ✓
4. User Journeys — 8 journeys (4A–4H), each with explicit "Where it lives" ✓
5. Phased Implementation — 7 phases (4A–4G), each delivering ≥1 journey ✓
6. Impact & Breakage Analysis — sidebar, routeTree, router signatures table ✓
7. Cross-Cutting Concerns — TQ keys, errors, permissions, dates, mobile, biome ✓
8. Open Questions / Risks — 9 items (Q1–Q9), most resolved ✓

---

## Broken References

### Previously annotated (prior audit pass — not re-flagged)

- `apps/web/src/components/ui/command.tsx` — expected-absent (pre-install prereq). Annotated with TODO + Q9 RESOLVED. Phase 4G calls `bunx shadcn add command` as a required step.
- `cmdk` package — expected-absent (pre-install prereq). Same annotation.
- `appointments.list({ clientId })` — no `clientId` param in actual router. All call sites in §3G and Phase 4F have BLOCKED TODO markers from prior pass.

### New finding (this pass — fixed)

**`packageInstances.listForClient({ organizationId, clientId })`** — the actual `listForClient` procedure does NOT accept a `clientId` parameter. Its schema is `{ organizationId, status?, source?, limit? }`. The plan used this procedure in 3 places expecting to filter by client. The correct procedure is `packageInstances.listAll`, which accepts `{ organizationId, clientId?, status?, source?, limit? }`.

Occurrences fixed (all 3):
- §3G component tree: `client.packageInstances.listForClient(...)` → `listAll(...)`
- §3G API calls list: same
- Phase 4F task 4F.6: same

### Non-issues (expected-absent new files)

All files the plan says it will CREATE are absent — correct:
`settings/organization.tsx`, `settings/notifications.tsx`, `customers/$id.tsx`,
`class-slots/waitlist-panel.tsx`, `dashboard/recent-activity-widget.tsx`,
`dashboard/onboarding-checklist.tsx`, `installments/coach-installments-tab.tsx`,
`global-search/command-palette.tsx`

---

## date-fns Inconsistency (fixed this pass)

Phase 4D header correctly states "audit verified: date-fns not installed in apps/web", but:
- Task 4D.1 still said "use `formatDistanceToNow` from `date-fns` (check if installed...)" — misleading
- §7 Cross-Cutting Concerns still said "check if `date-fns` is in `apps/web/package.json`"

Both fixed to state definitively: `date-fns` is NOT installed; use `Intl.RelativeTimeFormat`.

---

## Unresolved Questions / Open Risks

These remain genuinely open — annotated in §8 and phase headers:

- **Phase 4E [BLOCKED]** — `package_instances` has no `staffId` column. Decision between (a) backend prereq or (b) different filter not yet made. TODO injected in Phase 4E and Q4 by prior pass.
- **Phase 4F [partial BLOCKED]** — `appointments.list` has no `clientId` param. Appointments tab cannot be built; remaining tabs can proceed. In execution table.
- **Q7** — org `createdAt` not in userContext shape. Decision: omit 30-day guard. Resolved in plan.

---

## Execution State

- No `execute/log.md` → plan not started
- No `chrome-test/` → no browser verification planned
- No `research/` → no formal research brief
- No `prompts/` → no agent handoff prompts

---

## Symbol / Procedure Verification Summary

| Procedure | Status |
|-----------|--------|
| `organizationSettings.get / upsert` | ✓ exists |
| `notificationPreferences.get / update` | ✓ exists |
| `waitlist.list / add / remove / promote` | ✓ exists |
| `userActivityLog.list` (organizationId, limit) | ✓ exists |
| `serviceMembers.listMine` | ✓ exists |
| `packageInstances.listAll` (clientId param) | ✓ exists — was wrongly called listForClient |
| `packageInstances.listForClient` (no clientId) | ✓ exists — does NOT take clientId |
| `installments.adminOverview / listByPackageInstance` | ✓ exists |
| `customerDirectory.list` (search param) | ✓ exists |
| `customerDirectory.getById` | ✓ exists |
| `preferredTimes.list / upsert` | ✓ exists |
| `appointments.list` (no clientId param) | ✓ confirmed — clientId ABSENT |
| `salesOrders.list` (no search param) | ✓ confirmed — search ABSENT |
| `hierarchy.listNodes` | ✓ exists |
| `hasRole(["trainer"])` | ✓ in useUserContext |
| `useDebounce` | ✓ at `@/hooks/useDebounce` |
| `CustomerDetailSheet` | ✓ at `components/customers/customer-detail-sheet.tsx` |
| `invoices.list` (referenced in 4F.7 as fallback) | ✓ router exists |
