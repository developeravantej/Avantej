# Type Safety Audit — Pass 1

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** type-safety-auditor

---

## Summary

Focused on TypeScript type correctness, Zod schema shapes, nullable column handling, non-null assertions, and type inference gaps across all plan code.

---

## Findings

### CRITICAL — TS1: `preferredData` undefined in `PackageRow` — compile error

**Rating:** CRITICAL

(Cross-references D5 from doc-consistency lens.)

In T2.2, the plan's JSX inside `PackageRow`:
```tsx
onClick={() => {
  setDraftTimes(
    (preferredData ?? []).map((t) => ({
      dayOfWeek: t.dayOfWeek,
      time: t.time,
      priority: t.priority,
    })),
  );
  setEditingPreferred(true);
}}
```

`preferredData` is not defined in `PackageRow`'s scope. It lives inside `PreferredTimesSection` sub-component. This WILL cause a TypeScript compile error: `Cannot find name 'preferredData'`.

**Fix required before implementation:** One of:
1. Lift the preferred times query into `PackageRow` and pass data to `PreferredTimesSection` as a prop
2. Invert control — `PreferredTimesSection` accepts `editMode: boolean` + `onEditStart: (items) => void` props

---

### HIGH — TS2: `CategoryOverrideRow.bufferTimeMinutes: number | null` — inconsistent with non-null upsert return

**Rating:** HIGH

The plan's service function `upsertCategoryBufferOverride` declares:
```typescript
): Promise<{ categoryId: string; bufferTimeMinutes: number | null }>
```

When `bufferTimeMinutes !== null` (upsert case), the return is:
```typescript
return { categoryId, bufferTimeMinutes: result!.bufferTimeMinutes };
```

`result!.bufferTimeMinutes` from Drizzle is `number` (column is `integer().notNull()`), so this is `number`, NOT `number | null`. The return type is unnecessarily wide. This won't cause a runtime bug but could confuse callers who check for null after a successful upsert.

**Recommendation:** Either:
- Overload the return type: `Promise<{ categoryId: string; bufferTimeMinutes: number }>` for upsert, `Promise<{ categoryId: string; bufferTimeMinutes: null }>` for delete
- Or simplify to a single return type `number | null` (current approach) and document the semantics

---

### HIGH — TS3: `result!.bufferTimeMinutes` — non-null assertion on Drizzle `.returning()` result

**Rating:** HIGH

```typescript
const [result] = await tenantDb
  .insert(memberCategoryBufferOverrides)
  .values({ ... })
  .onConflictDoUpdate({ ... })
  .returning();

return { categoryId, bufferTimeMinutes: result!.bufferTimeMinutes };
```

The `!` non-null assertion assumes `.returning()` always returns at least one row. For a `INSERT ... ON CONFLICT DO UPDATE` this is guaranteed to return exactly 1 row by PostgreSQL — so the assertion is safe. However, if the query is ever changed (e.g., to not use `.returning()`), this would become a silent runtime crash.

**Recommendation:** Add a guard:
```typescript
if (!result) {
  throw new Error("Upsert returned no rows — unexpected");
}
```

**Rating: MEDIUM** — Safe in practice but fragile.

---

### HIGH — TS4: `CategoryBufferRow` component `onSave` callback — no loading/disabled state during mutation

**Rating:** MEDIUM

The `CategoryBufferRow` component's `onSave` prop is:
```typescript
onSave: (categoryId: string, bufferTimeMinutes: number | null) => void;
```

It does not receive an `isPending` boolean or `disabled` state. After the user clicks "Save", the row's "Save" button remains clickable while the mutation is in-flight. Repeated clicks would fire multiple `upsert` calls.

**Fix:** Pass `isPending: boolean` to `CategoryBufferRow`, or handle at the mutation level with `mutate` (which queues but doesn't block the button).

---

### MEDIUM — TS5: `PreferredTimeItem.dayOfWeek` typed as `string` — should be enum union

**Rating:** MEDIUM

(Cross-references D6 from doc-consistency lens.)

```typescript
export type PreferredTimeItem = { dayOfWeek: string; time: string; priority: number };
```

The oRPC client infers the input type for `preferredTimes.upsert.items[].dayOfWeek` as the string enum union from `z.enum(["monday", "tuesday", ...])`. Passing a `PreferredTimeItem[]` with `dayOfWeek: string` to the client will cause a TypeScript error because `string` is not assignable to the literal union.

**Fix:**
```typescript
type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type PreferredTimeItem = { dayOfWeek: DayOfWeek; time: string; priority: number };
```

---

### MEDIUM — TS6: `parseInt` vs `Number.parseInt` — plan uses both inconsistently

**Rating:** LOW

In `CategoryBufferRow.handleSave`:
```typescript
const parsed = value === "" ? null : Number.parseInt(value, 10);
```

In `TrainerServicesSection` (existing code):
```typescript
const parsed = parseInt(bufferInputValue, 10);
```

The plan uses `Number.parseInt` (ESM best practice, avoids global). Consistent with Biome rules. No functional difference. ✓

---

### MEDIUM — TS7: `setDraftTimes` initial state — plan initializes as `[]` but opens with existing data

**Rating:** MEDIUM

```typescript
const [draftTimes, setDraftTimes] = useState<PreferredTimeItem[]>([]);
```

Initial state is `[]`. When "Edit" is clicked:
```typescript
setDraftTimes(
  (preferredData ?? []).map((t) => ({ ... })),
);
```

This is correct — the draft is initialized from existing data when edit mode is entered. However, if the user opens edit, cancels, and re-opens, the draft is re-initialized from `preferredData` (which may be stale if the query hasn't refetched). This is acceptable UX.

**No type issue here.** ✓

---

### LOW — TS8: `useQuery` `refetch` pattern vs `invalidateQueries`

**Rating:** LOW

The plan uses `refetch` from `useQuery`:
```typescript
const { data: categoryBuffers = [], refetch: refetchCategoryBuffers } = useQuery({ ... });

onSuccess: () => {
  toast.success("Category buffer updated");
  refetchCategoryBuffers();
},
```

Existing `TrainerServicesSection` uses `queryClient.invalidateQueries({ queryKey: [...] })`. Both patterns work; `invalidateQueries` is generally preferred in this codebase as it handles multiple subscribers. The plan's `refetch` approach only refetches the specific hook instance.

**Recommendation:** Use `queryClient.invalidateQueries` for consistency with the existing pattern in `TrainerServicesSection`.

---

### INFO — TS9: Drizzle `selectDistinct` return type handles nullable columns

**Rating:** INFO

```typescript
const assignedCategories = await tenantDb
  .selectDistinct({
    categoryId: services.categoryId,
    categoryName: serviceCategories.name,
    orgDefaultBuffer: serviceCategoryConfig.bufferTimeMinutes,
  })
  ...
```

`services.categoryId` is nullable (defined as `.references(...)`  without `.notNull()`). So `categoryId: string | null`. The service code filters: `filter((r) => !!r.categoryId)` and uses non-null assertion `r.categoryId!` in the map. This is correct null handling. ✓

`serviceCategoryConfig.bufferTimeMinutes` has `.default(0).notNull()` but via LEFT JOIN it could be `null`. The plan handles this: `r.orgDefaultBuffer ?? 0`. ✓

`serviceCategories.name` is `notNull()` but via LEFT JOIN could be `null`. The plan handles: `r.categoryName ?? "(unnamed)"`. ✓

---

## Status Table

| Finding | Rating | Issue |
|---|---|---|
| TS1: preferredData undefined in PackageRow | CRITICAL | Compile error — must fix |
| TS2: bufferTimeMinutes return type | HIGH | Unnecessarily wide, causes confusion |
| TS3: result! non-null assertion | MEDIUM | Safe but fragile |
| TS4: No isPending on CategoryBufferRow | MEDIUM | Race condition on rapid click |
| TS5: dayOfWeek typed as string | MEDIUM | TypeScript error at call site |
| TS6: parseInt vs Number.parseInt | LOW | Cosmetic |
| TS7: draftTimes re-init on reopen | LOW | Acceptable UX |
| TS8: refetch vs invalidateQueries | LOW | Style; prefer invalidateQueries |
| TS9: Nullable column handling | INFO | ✓ correct |
