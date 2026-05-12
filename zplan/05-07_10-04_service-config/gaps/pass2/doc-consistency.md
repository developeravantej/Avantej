# Doc Consistency Audit — Pass 2

**Auditor:** doc-consistency-auditor
**Date:** 2026-05-07 (Pass 2)

## Pass 1 Fixes Verified

- DC2 (Phase 1 already implemented) — FIXED: Task 1.1 now marked as DONE with explanation
- DC1 (unnecessary `members` import) — FIXED: import note now correctly says only `memberProfiles` needed
- DC3 (wrong hook in META.md) — noted but META.md not edited (low priority)
- DC4 (Phase 3 depends on Phase 2) — FIXED: explicit note added to Task 3.2

## New Findings (Pass 2)

### P2-DC1 — MEDIUM: Section 3 overview comment still references `members.userId`

The inline pseudocode in Section 3 (Technical Architecture):
```typescript
// SELECT serviceMembers.*, members.userId, memberProfiles.displayName
// WHERE serviceMembers.serviceId = input.serviceId
// return { memberId, displayName, isPrimary }[]
```

This comment shows `members.userId` being selected, but the actual `listForService` implementation does NOT join `members` at all. The `memberId` in the return comes from `serviceMembers.memberId` directly.

An implementor reading Section 3 first, before Task 2.1, might mistakenly add a `members` join. **Should be fixed.**

### P2-DC2 — LOW: Task 2.2 `TrainersTab` uses `refetch` but never calls it

The `TrainersTab` spec declares:
```typescript
const { data: assigned = [], refetch } = useQuery({
```

But `refetch` is destructured and never used — the mutations use `qc.invalidateQueries` instead, which is the correct approach. The unused `refetch` is dead code. **Cosmetic — remove from destructure.**

### P2-DC3 — LOW: File Change Summary table missing `useQueryClient` import for `service-detail-dialog.tsx`

The "File Change Summary" table at the end of the plan lists `service-detail-dialog.tsx` as "Extend: Add Tabs; add TrainersTab component with assign/remove UX". This is accurate but doesn't call out that multiple new imports are needed (tanstack-query hooks, Select, Tabs, orpc). Implementors following only the table summary will miss the import additions. **LOW — the task body covers it, but the table should note "requires multiple new imports."**

### P2-DC4 — VERIFIED: Phase dependency order

Phase 1 → Task 1.3 (cache invalidation, standalone)
Phase 2 → Task 2.1 (new procedure), Task 2.2 (UI), Task 2.3 (type check)
Phase 3 → depends on Phase 2 Task 2.1

The `listForService` procedure is needed by both Phase 2 UI and Phase 3 appointment form. If implemented in order, no issues. **VERIFIED.**

## Summary

| ID | Severity | Finding |
|---|---|---|
| P2-DC1 | MEDIUM | Section 3 pseudocode shows stale `members.userId` join |
| P2-DC2 | LOW | Unused `refetch` in TrainersTab destructure |
| P2-DC3 | LOW | File Change Summary missing import note for service-detail-dialog |
| P2-DC4 | VERIFIED | Phase dependencies correct |
