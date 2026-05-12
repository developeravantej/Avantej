# Scalability Audit — Pass 2

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** scalability-auditor
**Against:** updated plan/plan.md

## Summary

Pass 1 did not change any service/query logic — it only added annotations and fixed TypeScript types. Scalability findings from Pass 1 are unchanged. No new performance issues introduced.

---

## Findings

### CONFIRMED — SC1: upsertPreferredTimes non-atomic (pre-existing, deferred)

No change. Plan still documents this in Open Questions #2 and Write Atomicity section. The recommendation to wrap in a transaction is present in Section 7. Implementors can choose to fix it now or defer. Status: Open (correctly deferred).

### INFO — SC2-1: No new N+1 patterns introduced by Pass 1 edits

Pass 1 changes were to TypeScript types, test bullet points, and query invalidation patterns. No new queries or loops were introduced.

### INFO — SC2-2: `queryClient.invalidateQueries` change (T1.6, T3.1) is actually better for scalability

Using `invalidateQueries` rather than `refetch` means ALL subscribers to those query keys will be refreshed, not just the specific hook instance. This is the correct pattern and has no negative performance impact for small datasets.

### INFO — SC2-3: DayOfWeek type fix does not affect query behavior

The `DayOfWeek` type change is purely a TypeScript-layer fix. No runtime query changes.

## Status

No new scalability findings. All Pass 1 scalability findings stand. ✓
