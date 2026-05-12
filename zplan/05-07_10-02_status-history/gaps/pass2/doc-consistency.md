# Doc Consistency Audit — Pass 2

**Auditor:** doc-consistency-auditor
**Date:** 2026-05-07
**Based on:** Updated plan.md after Pass 1 fixes

---

## Summary

All Pass 1 doc consistency fixes confirmed applied. Q1 and Q2 now correctly marked RESOLVED. Two new MEDIUM findings: (1) the `nextCursor` fix introduced a structural inconsistency — it is now in the row type but also described separately, and (2) the plan's Phase 3 item 1 references `existing.status` as the `fromStatus` but the variable in the actual code is `pkg.status` (different variable name). One LOW: the `SalesStatusBadge` reference in Phase 1 is correct but the component is defined inline in `$id.tsx` — the plan should note it cannot be imported from a shared location.

---

## Findings

### CONFIRMED RESOLVED — Q1 (payment router decision)

Plan now reads: "**RESOLVED:** No `paymentsRouter` exists. Decision: Option B. Add `paymentStatusHistory` procedure to `invoicesRouter`." ✓

### CONFIRMED RESOLVED — Q2 (payments.service.ts existence)

Plan now reads: "**RESOLVED:** `packages/services/src/payments.service.ts` does NOT exist. Decision: Create it." ✓

### MEDIUM — Phase 3 item 1 references `existing.status` but actual variable is `pkg`

**Location:** Plan section 5, Phase 3, item 1

Plan code snippet:
```typescript
await appendPackageInstanceStatusHistory(tenantDb, packageInstanceId, {
  fromStatus: existing.status,
  ...
```

But in `installment.service.ts` lines 413-416, the loaded variable is named `pkg`:
```typescript
const [pkg] = await tenantDb
  .select({ id: packageInstances.id, status: packageInstances.status, expiresAt: packageInstances.expiresAt })
  ...
```

So the correct code is `pkg.status`, not `existing.status`. `existing` is not defined in `evaluateAndExpireIfOverdue`.

**Fix:** Change `fromStatus: existing.status` to `fromStatus: pkg.status` in the code snippet.

### MEDIUM — `nextCursor` placement fixed but comment in output type is potentially confusing

**Location:** Plan section 3.4, output shape block

After the fix, the output shape is now:
```typescript
{
  rows: Array<{ id, fromStatus, toStatus, changedByName, changedAt, reason, notes }>,
  nextCursor: string | null,
}
```

This is correct. The comment "// response-level, NOT inside each row" is helpful. No further action needed, but verify that the `StatusTimelineProps` interface in Phase 2 uses `entries` (not `rows`) — the component prop name and the API response key are different, and the UI must map `response.rows` to `entries`. Plan does not show this mapping — recommend adding a note.

### LOW — `SalesStatusBadge` is defined inline in `$id.tsx`, not a shared component

**Location:** Plan Phase 1, item 4

Plan states: "use existing `SalesStatusBadge`". This component is defined at line 42 of `$id.tsx`:
```typescript
function SalesStatusBadge({ status }: { status?: string | null }) {
```

It is NOT exported from a shared file. The `StatusHistoryCard` component will be in the same file (`$id.tsx`), so it can use `SalesStatusBadge` directly. However, the `StatusTimeline` component being extracted in Phase 2 to `apps/web/src/components/ui/status-timeline.tsx` receives a `statusBadgeRenderer` prop for exactly this reason (different badge renderers per entity). The plan correctly uses the prop-injection pattern — no fix needed, just documentation.

### LOW — Phase 2 item 3 says export both new functions from `index.ts` but doesn't specify the export pattern

`appointment.service.ts` is currently exported via named `export { ... }` pattern (line 23 of index). The new `getAppointmentStatusHistory` must be added to this named export block. Similarly for `package-instance.service.ts` (line 217 of index). The plan says "export both new functions" — the implementer must add them to the existing named export blocks, not add new `export *` lines.

### INFO — Phase 1 instruction to render below "invoices card" is precise

Plan Phase 1, item 4: "Render at the bottom of the page, below the invoices card." The `$id.tsx` page has a clear structure with an invoices card. This instruction is actionable and correct.

---

## Verdict

One MEDIUM fix needed (existing.status → pkg.status in code snippet). All Q1/Q2 resolutions confirmed. No blocking issues.
