# Type Safety Audit
**Session:** zplan/04-23_12-38_installment-enhancements
**Findings:** 3 (1 critical · 1 high · 1 medium)

## Findings

### [CRITICAL] Phase ordering puts `appointment.service.ts` change before the schema column exists
**Plan claims:** Phase 4 Task 4.3 modifies `appointment.service.ts:264` to use `lockedPkg.allowCreditOverdraft`. Phase 4 is blocked on Phase 3 (schema migration).
**Actual:** If Phase 3 adds the schema column and regenerates Drizzle types first, then Phase 4 Task 4.3 reads the new column correctly. However, if a developer implements Task 4.3 before `bun check-types` has the new column in scope (e.g. forgetting to run codegen after schema change), TypeScript will fail:
```
Property 'allowCreditOverdraft' does not exist on type '...$inferSelect'
```
The plan's stated ordering (Phase 3 before Phase 4) is correct but must be enforced strictly — particularly Task 3.5 (`bun check-types` clean in `packages/db` and `packages/services`) must pass before Task 4.3 begins.
**File:** `packages/services/src/appointment.service.ts:264`
**Fix:** Add a hard gate to Phase 4 preamble: "Do not begin Task 4.3 until `bun check-types` passes cleanly in `packages/db` and `packages/services` with the new column in scope." Consider adding a comment in Task 3.5 that explicitly says "this check gates Phase 4".

---

### [HIGH] `AdminInstallmentOverviewItem` optional fields not populated by service
**Plan claims:** `AdminInstallmentOverviewItem` gains `nextInstallmentAmount?: number | null` and `nextInstallmentId?: string | null`. Task 1.5 describes a batch query to populate them.
**Actual:** Current type definition at `installment.service.ts:858` is:
```typescript
export type AdminInstallmentOverviewItem = typeof packageInstances.$inferSelect & {
  serviceName: string | null;
  clientName: string | null;
};
```
The current `getAdminInstallmentOverview` returns rows directly from a joined select query and spreads them (line ~936). Adding `nextInstallmentAmount` and `nextInstallmentId` to the type without also computing them in the service produces a structural lie: the type says fields exist but the runtime returns `undefined`.
**File:** `packages/services/src/installment.service.ts:858,936`
**Fix:** Task 1.5 must explicitly update both the type definition AND the service return logic. The batch query result must be merged into each row before returning. Verify the return type is `AdminInstallmentOverviewItem[]` (not inferred from query) so TypeScript enforces the new fields are populated.

---

### [MEDIUM] `metadata` in installmentEvents is a text column — JSON.stringify is correct but callers must parse
**Plan claims:** `metadata: JSON.stringify({ previous: pkg.allowCreditOverdraft })`.
**Actual:** `installmentEvents.metadata` is `text("metadata")` (line 16 of installment-events.ts). `JSON.stringify` returns a string, so the insert type-checks. However, callers that read `metadata` expecting an object will get a raw string unless they call `JSON.parse`. This matches the existing pattern (lines 377, 661, 825 of installment.service.ts all use `JSON.stringify`). No type error, but a documentation gap.
**File:** `packages/db/src/schema/tenant/installment-events.ts:16`
**Fix:** No fix needed for type safety. Add a one-line comment in the `setPackageOverdraft` implementation: `// metadata is stored as JSON string; parse when reading`.

---

## Summary

One critical ordering risk: the appointment.service change (Task 4.3) accesses `allowCreditOverdraft` which only exists after Phase 3 runs Drizzle codegen. The phase ordering in the plan is correct, but needs an explicit gate ("Task 3.5 must pass before Task 4.3"). The high finding is that `AdminInstallmentOverviewItem` will lie about having `nextInstallmentAmount`/`nextInstallmentId` unless Task 1.5 explicitly populates them in the service return — the type extension and the service batch query must be developed as a single atomic change, not separately. The metadata/JSON.stringify pattern is semantically safe and consistent with existing code.
