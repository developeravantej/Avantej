# Scalability Audit — Pass 2

**Auditor:** scalability-auditor
**Date:** 2026-05-07 (Pass 2)

## Pass 1 Verified Findings

- SC1 (Combobox suggestion) — LOW, still pending
- SC2-SC4 — all VERIFIED CLEAR

## New Findings (Pass 2)

### P2-SC1 — LOW: `allTrainers` query in `TrainersTab` uses no `orpc.members.list.queryOptions`

The plan's `TrainersTab` uses:
```typescript
queryKey: orpc.members.list.key({ input: { organizationId, role: "trainer", status: "active" } }),
queryFn: () => client.members.list({ organizationId, role: "trainer", status: "active" }),
```

But `useAppointmentFormData` uses the same data with:
```typescript
queryKey: ["members", organizationId, "trainer"],
queryFn: () => client.members.list({ organizationId, role: "trainer", status: "active" }),
```

These two queries use **different cache keys** for the same data. The `TrainersTab` uses the oRPC key helper format; `useAppointmentFormData` uses a manual string array. They will NOT share the cache — the `TrainersTab` will fetch trainer data independently even if the appointment form already has it cached.

**Impact:** Minor — one extra network request when the service detail dialog is opened from the appointment flow. Not a N+1, just duplicate fetching.

**Recommendation:** Use `orpc.members.list.queryOptions` pattern consistently. But this is a pre-existing inconsistency in `useAppointmentFormData` — the plan introduces the oRPC key form, which is actually more correct. The recommendation is to fix `useAppointmentFormData` to also use the oRPC key (separate task).

### P2-SC2 — VERIFIED: `staleTime: 5 * 60 * 1000` on trainer list in TrainersTab

This prevents refetching within 5 minutes. For a service detail dialog that's typically opened briefly, this is appropriate. **VERIFIED.**

### P2-SC3 — LOW: Cache invalidation scope after assign/remove

The mutation `onSuccess` uses:
```typescript
qc.invalidateQueries({ queryKey: orpc.serviceMembers.listForService.key() })
```

This is a broad invalidation (no input filter) — it invalidates ALL `listForService` cache entries for all services. In the appointment form, this triggers a refetch of the currently-selected service's assignments. This is intentionally correct but slightly over-broad. For apps with many concurrent appointment forms (unlikely in a typical fitness franchise admin), this could cause unnecessary refetches. **Acceptable at this scale.**

## Summary

| ID | Severity | Finding |
|---|---|---|
| P2-SC1 | LOW | TrainersTab trainer cache key differs from useAppointmentFormData — no cache sharing |
| P2-SC2 | VERIFIED | staleTime appropriate |
| P2-SC3 | LOW | Broad invalidation intentionally correct |
