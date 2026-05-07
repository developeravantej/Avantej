# Type Safety Audit — Pass 2

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** type-safety-auditor
**Against:** updated plan/plan.md

## Summary

Pass 1 addressed: DayOfWeek enum union (TS5), result! guard (TS3), invalidateQueries pattern (TS8). Pass 2 checks for new issues introduced by those fixes and residual items.

---

## Findings

### NEW CRITICAL — TS2-1: `updateItem` function — `string` not assignable to `DayOfWeek`

**Rating:** CRITICAL

This is a new issue introduced by Pass 1's DayOfWeek fix. Full details in api-surface Pass 2 (A2-1).

In `PreferredTimesEditor`:
```typescript
function updateItem(index: number, field: "dayOfWeek" | "time", value: string) {
  const next = items.map((item, i) => (i === index ? { ...item, [field]: value } : item));
  onChange(next);
}
```

When `field === "dayOfWeek"`, the computed type of `{ ...item, [field]: value }` is:
```typescript
{ dayOfWeek: string; time: string; priority: number }
```
But `onChange` expects `PreferredTimeItem[]` where `dayOfWeek: DayOfWeek`. TypeScript will error.

The `Select.onValueChange` returns `string`, so the call `updateItem(i, "dayOfWeek", v)` passes a `string`.

**Fix (auto-applicable):**
```typescript
function updateItem(index: number, field: "dayOfWeek" | "time", value: string) {
  const next = items.map((item, i) =>
    i === index
      ? { ...item, [field]: field === "dayOfWeek" ? (value as DayOfWeek) : value }
      : item,
  );
  onChange(next);
}
```

Or simpler — split the call sites:
```tsx
// For Select:
onValueChange={(v) => {
  const next = items.map((item, i) => i === index ? { ...item, dayOfWeek: v as DayOfWeek } : item);
  onChange(next);
}}
// For Input:
onChange={(e) => {
  const next = items.map((item, i) => i === index ? { ...item, time: e.target.value } : item);
  onChange(next);
}}
```

---

### CONFIRMED CRITICAL — TS1: `preferredData` still undefined in code snippet

**Rating:** CRITICAL (carried from Pass 1)

The annotation documents the fix strategy but the code still shows `preferredData`. This will produce a TypeScript compile error. Needs code-level fix, not just annotation.

---

### CONFIRMED RESOLVED — TS3: result! guard

**Rating:** RESOLVED ✓

The `if (!result)` guard was added in Pass 1:
```typescript
if (!result) {
  throw new Error("upsertCategoryBufferOverride: INSERT returned no rows unexpectedly");
}
return { categoryId, bufferTimeMinutes: result.bufferTimeMinutes };
```
✓ Clean.

---

### CONFIRMED RESOLVED — TS5: DayOfWeek type

**Rating:** RESOLVED — but introduced TS2-1 (see above)

---

### NEW MEDIUM — TS2-2: `CategoryBufferRow` state initialization does not reset when `cat` prop changes

**Rating:** MEDIUM

```typescript
const [value, setValue] = useState(
  cat.bufferTimeMinutes !== null ? String(cat.bufferTimeMinutes) : "",
);
```

`useState` initializer runs only once — on mount. If `cat.bufferTimeMinutes` changes after a successful mutation (parent re-renders with fresh data), the local `value` state will be stale (still showing the old value). The user would see the input unchanged until they click Edit again.

**Fix:** Use `useEffect` to sync the local state when `cat.bufferTimeMinutes` changes:
```typescript
useEffect(() => {
  if (!editing) {
    setValue(cat.bufferTimeMinutes !== null ? String(cat.bufferTimeMinutes) : "");
  }
}, [cat.bufferTimeMinutes, editing]);
```

Or reset when edit mode closes (simpler): already happens because `setEditing(false)` does not reset `value` — so next time Edit is opened, the stale `value` is shown. 

**Actually:** The issue is that when the mutation succeeds and the query refetches, the parent passes a new `cat.bufferTimeMinutes`. Since `value` was initialized once, it won't update. The "view" display (non-editing state) correctly reads from `cat.bufferTimeMinutes` directly (no state involved). The issue only affects the INPUT VALUE shown when entering edit mode for the second time.

**Impact:** After saving "30 min", clicking Edit again shows the old value (e.g., "15") if `cat` prop wasn't reset. This is a UX bug.

**Fix:** Reset `value` state when edit mode opens:
```typescript
// Change onClick={() => setEditing(true)} to:
onClick={() => {
  setValue(cat.bufferTimeMinutes !== null ? String(cat.bufferTimeMinutes) : "");
  setEditing(true);
}}
```

---

### NEW LOW — TS2-3: `isPending` omitted from `CategoryBufferRow` — double-save race still present

**Rating:** MEDIUM (carried from Pass 1 TS4, not yet fixed)

Pass 1 flagged this as TS4 (MEDIUM) and it was listed in GAPS.md as H4. No fix was applied in Pass 1 (H4 was listed but not in the auto-fixable table). The component still has no `isPending` prop:

```typescript
export function CategoryBufferRow({
  cat,
  onSave,
}: {
  cat: CategoryBufferRowData;
  onSave: (categoryId: string, bufferTimeMinutes: number | null) => void;
})
```

A user double-clicking "Save" fires `onSave` twice before the mutation completes, queuing two identical mutations. Low severity in practice but worth annotating.

---

### INFO — TS2-4: `result.bufferTimeMinutes` type is now `number` (not `number | null`)

After the `if (!result)` guard was added in Pass 1, `result` is narrowed to non-null. `result.bufferTimeMinutes` is typed as `number` (column is `.notNull()`). The return type `Promise<{ categoryId: string; bufferTimeMinutes: number | null }>` is still wider than the actual return (`number` not `null` in the upsert branch). This is pass 1's TS2 carried — acceptable as-is, semantic correctness is maintained.

---

## Status Table

| Finding | Rating | New/Carried |
|---|---|---|
| TS2-1: updateItem string→DayOfWeek error | CRITICAL | NEW — introduced by Pass 1 |
| TS1: preferredData compile error | CRITICAL | Carried — annotation present, code not fixed |
| TS3: result! guard | RESOLVED | Fixed in Pass 1 ✓ |
| TS5: DayOfWeek enum | RESOLVED | Fixed in Pass 1 (but introduced TS2-1) |
| TS2-2: CategoryBufferRow stale edit value | MEDIUM | NEW |
| TS2-3: isPending omitted | MEDIUM | Carried from Pass 1 H4 |
| TS2-4: return type width | LOW | Carried — acceptable |
