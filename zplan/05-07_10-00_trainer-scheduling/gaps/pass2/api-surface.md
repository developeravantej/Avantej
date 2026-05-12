# API Surface Audit — Pass 2

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** api-surface-auditor
**Against:** updated plan/plan.md

## Summary

Pass 1 addressed: OR-permission catch annotation (A5), `refetch` → `invalidateQueries` in T1.6, style note on DB query in router (A2). Pass 2 checks for residual issues and any new ones introduced.

---

## Findings

### NEW HIGH — A2-1: `updateItem` type parameter `field: "dayOfWeek" | "time"` but `value: string` — now that `dayOfWeek` is `DayOfWeek` enum, the assignment is unsafe

**Rating:** MEDIUM

After Pass 1 fixed `dayOfWeek` to `DayOfWeek` union type, the `updateItem` helper in `PreferredTimesEditor` is:

```typescript
function updateItem(index: number, field: "dayOfWeek" | "time", value: string) {
  const next = items.map((item, i) => (i === index ? { ...item, [field]: value } : item));
  onChange(next);
}
```

When `field === "dayOfWeek"`, `value` is `string` but `PreferredTimeItem.dayOfWeek` is `DayOfWeek`. TypeScript will report a type error: `string` is not assignable to `DayOfWeek`.

The `onValueChange` from `Select` returns `string`, so `v` in `onValueChange={(v) => updateItem(i, "dayOfWeek", v)}` is `string`.

**Fix required:** Cast at call site or overload `updateItem`:
```typescript
// Option A — cast at Select onValueChange:
onValueChange={(v) => updateItem(i, "dayOfWeek", v as DayOfWeek)}

// Option B — split into two functions:
function updateDay(index: number, day: DayOfWeek) { ... }
function updateTime(index: number, time: string) { ... }
```

This is a new issue introduced by Pass 1's fix to `PreferredTimeItem`. It must be addressed.

---

### NEW MEDIUM — A2-2: `upsertPreferredMutation.onSuccess` leaves `// Invalidate/refetch preferred times query` as a comment stub

**Rating:** HIGH

In the updated plan's T2.2:
```typescript
onSuccess: () => {
  toast.success("Preferred times updated");
  setEditingPreferred(false);
  // Invalidate/refetch preferred times query (use existing queryKey pattern in this file)
},
```

This comment is a stub — the implementor must fill in the actual `queryClient.invalidateQueries` call. But the plan does NOT specify what the query key is for the preferred times query in `PackageRow`.

Given that the C1 critical issue (preferredData scope) means the preferred times query needs to be LIFTED into `PackageRow`, the queryKey will be something like:
```typescript
["preferredTimes", organizationId, pkg.id]
```

But the plan never defines this queryKey. The implementor will need to invent it — which is fine for flexible code, but the plan should specify the key for consistency.

**Fix:** Replace comment stub with actual invalidate call pattern (even if the exact queryKey is TBD, show the pattern).

---

### CONFIRMED RESOLVED — A5: OR-permission bare catch

**Rating:** MEDIUM (annotation added in Pass 1 — remains for human judgment)

Pass 1 added an annotation comment. The underlying pattern is unchanged. The annotation is visible to implementors. Confirmed adequate.

---

### CONFIRMED RESOLVED — A2: DB query in router (updateMine)

**Rating:** MEDIUM (annotation added per pass 1)

The plan still shows the DB query directly in the router handler for `updateMine`. The Pass 1 audit noted this as a style deviation. No annotation was added for this finding in Pass 1 (it was listed as M6 in GAPS but not applied to plan.md). 

**Add annotation now.**

---

### INFO — A2-3: T1.6 import of `CategoryBufferRow` uses relative path `"./category-buffer-row"` which is correct for a file in the same `trainers/` directory

**Rating:** INFO ✓

---

### INFO — A2-4: T3.1 uses `queryClient.invalidateQueries` now — resolved ✓

**Rating:** INFO

Pass 1 fixed `refetchCategoryBuffers()` → `queryClient.invalidateQueries(...)` in T3.1. However T3.1 does NOT show `const queryClient = useQueryClient()` being imported/called. The existing `my-services/view.tsx` may or may not already have `queryClient` in scope.

**MEDIUM finding:** The implementor must ensure `useQueryClient()` is imported and called in `my-services/view.tsx` — the plan snippet does not show this import.

---

## Status Table

| Finding | Rating | New/Carried |
|---|---|---|
| A2-1: updateItem dayOfWeek type error | MEDIUM | NEW — introduced by Pass 1 DayOfWeek fix |
| A2-2: onSuccess comment stub | HIGH | NEW — unresolved placeholder |
| A2-3: T3.1 missing queryClient import | MEDIUM | NEW |
| A5: OR-permission annotation | MEDIUM | Carried, annotation added |
| A2: DB query in router | MEDIUM | Carried, unannotated — needs annotation |
