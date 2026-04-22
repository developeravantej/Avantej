# Audit: 04-21_16-55_remove-walk-in-customers

**Audited:** 2026-04-21 17:40 (re-audit after audit-apply)
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard
| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present |
| Broken references | 0 |
| Missing impact | 0 (prior finding addressed — Task 1.4b and pos.ts added by prior audit-apply) |
| Unresolved questions | 1 soft (Q1 — display-name persistence requires explicit user sign-off before Task 1.1) |
| Execution state | not started |

---

## Findings

### Structural gaps

None. All 8 required sections are present with substantive content:
1. Overview — problem statement, goals, success criteria, scope ✓
2. Result — before/after for staff and admin roles ✓
3. Technical Architecture — current + target data flows, schema change, API contracts ✓
4. User Journeys — A through D with explicit "Where it lives" ✓
5. Phased Implementation — 4 phases, each delivering ≥1 journey ✓
6. Impact & Breakage Analysis — callers, schema coupling, deployment coupling ✓
7. Cross-Cutting Concerns — error handling, testing, migration, rollback, perf, security, observability ✓
8. Open Questions / Risks — Q1–Q5 documented ✓

### Broken references

None. All 23 file paths verified to exist. All symbols confirmed in codebase:
- `recordCheckIn`, `resolveClientDisplayName`, `batchResolveDisplayNames`, `listCheckIns` — `packages/services/src/check-ins.service.ts`
- `searchPosCustomers`, `createSalesOrder`, `recordPosSale` — `packages/services/src/pos.service.ts`
- `walkInCustomersRouter`, all 5 service functions — their respective files
- `WalkInCustomersPage`, `RegisteredCustomersPage`, `makeTabRedirect`, `ConsolidatedTabs`, `createMockTenantDb` — all confirmed
- `pkg_owner_xor`, `walk_in_customer_management`, `walkInCustomerId` FK columns — all confirmed

### Missing impact

None remaining. The prior `audit-apply` run (2026-04-21 17:30) added Task 1.4b (remove legacy `createSalesOrder` walk-in lookup) and added `packages/api/src/routers/pos.ts` to Phase 1 files-touched.

Minor non-blocking gap: `apps/server/src/tests/unit/services/walk-in-customers.test.ts` and `apps/server/src/tests/integration/walk-in-customers.integration.test.ts` are not explicitly listed in Task 3.8's files-touched. Both will fail to compile once the service file is deleted, so the implementer will encounter them naturally. Worth adding to Task 3.8 for completeness.

### Unresolved questions

**Q1 — Display name persistence (soft gate):** Plan states "Resolved: YES" but explicitly requires "Confirm with user before Phase 1 lands." Task 1.1 generates an irreversible tenant-DB migration — this confirmation must happen before the implementer starts Phase 1. No other TBD/TODO/??? markers found.

### Execution state

- No `execute/log.md` — not yet executed (expected for a pre-implementation plan)
- No `chrome-test/` — not needed at this stage
- `audit/applied.md` present — prior audit findings were applied on 2026-04-21 17:30

---

## Priority Actions

1. **User decision required before Phase 1:** Confirm Q1 — persist display name to `check_ins.client_display_name` (YES per current plan). This gates Task 1.1 (the tenant-DB migration).
2. **Optional (Task 3.8):** Explicitly list `apps/server/src/tests/unit/services/walk-in-customers.test.ts` and `apps/server/src/tests/integration/walk-in-customers.integration.test.ts` in the files-touched for Phase 3.
3. **Execute the plan** once action 1 is confirmed.

---

## Status rationale

**needs-attention:** All 8 structural sections present, 0 broken refs, 0 missing impact. Only remaining item is Q1 — a deliberate decision gate explicitly requiring user confirmation before the irreversible tenant-DB migration starts. Plan is implementation-ready pending that one sign-off.
