# Doc Consistency Audit — Pass 2

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** doc-consistency-auditor
**Against:** updated plan/plan.md

## Summary

Pass 1 applied C1 critical annotation (preferredData scope), D3 HIGH annotation (organizationId scope), D6 MEDIUM fix (DayOfWeek type). Pass 2 checks residual consistency issues.

---

## Findings

### CONFIRMED — D5 (C1): `preferredData` annotation present but code stub unchanged

**Rating:** CRITICAL (remains)

The annotation was added:
```
<!-- audit-swarm: CRITICAL doc-consistency+type-safety: `preferredData` is NOT in PackageRow scope ... -->
```

But the actual code snippet in T2.2 still contains `preferredData ?? []` references unchanged:
```tsx
(preferredData ?? []).map((t) => ({
```
```tsx
{editingPreferred ? ( ... ) : (preferredData ?? []).length === 0 ? (
```
```tsx
{(preferredData ?? [])
```

The annotation tells the implementor what to do, but the code stub would compile-fail as-is. **The annotation approach is correct for "human judgment required" items**, but for a CRITICAL compile-error, the code should show the corrected pattern (with lifted query) rather than the broken pattern.

**Recommendation for Pass 2:** Replace the `preferredData` references with a clearly named placeholder that signals the lift pattern:
```tsx
// Lift preferred times query into PackageRow:
// const { data: preferredTimesData = [] } = useQuery({
//   queryKey: ["preferredTimes", organizationId, pkg.id],
//   queryFn: () => client.preferredTimes.list({ organizationId, packageInstanceId: pkg.id }),
//   enabled: isExpanded,
// });
// Then replace `preferredData` with `preferredTimesData` throughout.
```

---

### NEW MEDIUM — D2-1: Verification steps for Phase 1 don't test the category-buffer data persistence via DB

**Rating:** LOW

Phase 1 verification:
- "Clear a value → null → row deleted from DB; UI shows '—'"

This implicitly tests DB persistence, but only at the UI level. A more complete verification would be:
- "Open browser DevTools → Network → confirm DELETE call returns 200"
OR
- "Use `bun db:studio` to confirm `member_category_buffer_overrides` table shows/loses the row"

This is a doc nicety — not blocking.

---

### NEW HIGH — D2-2: `onSuccess` in `upsertPreferredMutation` still shows a comment stub — no query key specified

**Rating:** HIGH

```typescript
onSuccess: () => {
  toast.success("Preferred times updated");
  setEditingPreferred(false);
  // Invalidate/refetch preferred times query (use existing queryKey pattern in this file)
},
```

After the C1 fix (lifting the query into PackageRow), the queryKey will be:
```typescript
["preferredTimes", organizationId, pkg.id]
```
But neither the queryKey nor the `queryClient.invalidateQueries` call is written out. The implementor must invent the key.

**Auto-fixable:** Replace the comment with the actual pattern once the lifted query key is established.

---

### NEW LOW — D2-3: `TrainerServicesSection` still has `useQueryClient` call not shown in T1.6

**Rating:** LOW

The updated T1.6 now uses `queryClient.invalidateQueries(...)` but `TrainerServicesSection` already uses `queryClient` (confirmed reading the file: `const queryClient = useQueryClient()`). So the plan snippet will work without adding the import. ✓

---

### NEW LOW — D2-4: T3.1 `queryClient.invalidateQueries` added but `useQueryClient` not shown as import

**Rating:** LOW

The T3.1 update now uses `queryClient.invalidateQueries(...)`. The `my-services/view.tsx` file may or may not already have `const queryClient = useQueryClient()`. The plan snippet does not show this import. 

**Implementor must verify.** The HIGH annotation from Pass 1 about reading the file covers this.

---

### CONFIRMED RESOLVED — D6: DayOfWeek type fix

Pass 1 fixed `dayOfWeek: string` → `DayOfWeek` union type. ✓

However, **new issue A2-1 introduced**: `updateItem(i, "dayOfWeek", v)` now has type mismatch (string vs DayOfWeek). See api-surface Pass 2 finding A2-1.

---

### INFO — D2-5: Open Questions table still references Section numbers correctly

**Rating:** INFO ✓

Open Questions #1-5 reference correct section numbering. No drift.

---

## Status Table

| Finding | Rating | New/Carried |
|---|---|---|
| D5/C1: preferredData annotation present but code still broken | CRITICAL (carried) | Code stub should show corrected pattern |
| D2-1: Verification missing DB check | LOW | NEW |
| D2-2: onSuccess comment stub — no queryKey | HIGH | NEW |
| D2-3: useQueryClient already in TrainerServicesSection | INFO | ✓ |
| D2-4: queryClient not shown in T3.1 | LOW | NEW |
| D6: DayOfWeek resolved | RESOLVED | But introduced A2-1 |
| D2-5: Open Questions numbering | INFO | ✓ |
