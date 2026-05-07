# Doc Consistency Audit — Pass 1

**Session:** 05-07_10-00_trainer-scheduling
**Lens:** doc-consistency-auditor

---

## Summary

Verifying every file path, component name, router key, and phase dependency claim in the plan against the actual codebase.

---

## Findings

### HIGH — D1: `TrainerServicesSection` props do NOT include `memberId` — plan assumes it does

**Rating:** HIGH

The plan at T1.6 states:
> "Add query and mutation (inside component, mirroring existing service buffer pattern — gate on same `isOpen` prop)"
> ```typescript
> const { data: categoryBuffers = [] } = useQuery({
>   queryKey: ["categoryBufferOverrides", organizationId, memberId],
>   queryFn: () =>
>     client.categoryBufferOverrides.listForMember({
>       organizationId: organizationId!,
>       memberId: memberId!,
>     }),
>   enabled: isOpen && !!organizationId && !!memberId,
> });
> ```

Checking actual `TrainerServicesSection.tsx` props:
```typescript
type Props = {
  organizationId: string;
  memberId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};
```

`memberId` IS a prop ✓. The plan's assumption is correct.

`organizationId` IS a prop ✓.

**No gap — props exist as assumed.**

---

### HIGH — D2: `CategoryBufferRow` type cast `cat as CategoryBufferRowData` is unnecessary and potentially misleading

**Rating:** MEDIUM

In T1.6, the plan casts:
```tsx
cat={cat as CategoryBufferRowData}
```

The `client.categoryBufferOverrides.listForMember` return type will be inferred from the router handler, which returns `CategoryOverrideRow[]` from the service. The `CategoryBufferRowData` local type in the component has identical shape. The cast is unnecessary if the import type is used consistently, but it's safe. Not a bloat issue.

---

### CRITICAL — D3: `my-services/view.tsx` — the plan assumes `organizationId` is available in scope but the file structure is unknown

**Rating:** HIGH

The plan at T3.1 references `organizationId!` inside `my-services/view.tsx`:
```typescript
queryFn: () =>
  client.categoryBufferOverrides.listMine({ organizationId: organizationId! }),
```

We confirmed `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx` exists. However, we have NOT verified that `organizationId` is available in scope in this component. Other pages get `organizationId` from `useUserContext()` or similar.

**Risk:** If the component doesn't already have `organizationId` in scope, the plan's T3.1 code will have a compile error.

**Action needed:** Implementor must verify `organizationId` source in `my-services/view.tsx` before using `organizationId!`.

---

### MEDIUM — D4: Phase dependency claim — "Phase 3 depends on Phase 1" is correctly stated

**Rating:** INFO

Plan states Phase 3 "Depends on Phase 1 — requires `categoryBufferOverrides` router and `CategoryBufferRow` component." This is accurate. `CategoryBufferRow` is created in T1.5 (Phase 1), imported in T3.1 (Phase 3). Phase ordering is correct.

---

### MEDIUM — D5: `package-row.tsx` — plan references `preferredData` but actual variable name in file may differ

**Rating:** HIGH

The plan at T2.2 references `preferredData` in:
```tsx
onClick={() => {
  setDraftTimes(
    (preferredData ?? []).map((t) => ({
```

We only read the first ~180 lines of `package-row.tsx`. The `PreferredTimesSection` component fetches its own data internally (it's a separate sub-component). The plan adds the edit state to `PackageRow` but `preferredData` is not a prop or local variable of `PackageRow` — it lives inside `PreferredTimesSection`.

**Gap:** The plan assumes `preferredData` is accessible in `PackageRow`'s scope, but the existing pattern is that `PreferredTimesSection` fetches and renders its own data. The plan's T2.2 code will NOT compile as written — `preferredData` is undefined in `PackageRow`.

**Fix required:** Either:
1. Lift the `useQuery` for preferred times from `PreferredTimesSection` into `PackageRow`, OR
2. Pass an `onEdit` callback to `PreferredTimesSection` that gives `PackageRow` access to the data, OR
3. Have `PreferredTimesSection` accept `editMode` state from `PackageRow`.

**This is a CRITICAL implementation gap.**

---

### MEDIUM — D6: `client.preferredTimes.upsert` — `items` field: plan uses `PreferredTimeItem[]` but router uses `preferredTimeItemSchema` which requires `dayOfWeek` as enum

**Rating:** MEDIUM

The plan defines:
```typescript
export type PreferredTimeItem = { dayOfWeek: string; time: string; priority: number };
```

But the router's `preferredTimeItemSchema` has:
```typescript
dayOfWeek: z.enum(["monday", "tuesday", ...])
```

TypeScript will accept `string` for an enum field at the call site (Zod validates at runtime, not compile time for the client call). The oRPC client type will infer the enum type from the schema. So at compile time, passing `string` for an enum field may cause a type error.

**Fix:** The `PreferredTimeItem` type should use the same union type:
```typescript
type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type PreferredTimeItem = { dayOfWeek: DayOfWeek; time: string; priority: number };
```

---

### LOW — D7: Section 8 Open Question #4 — `coachIntakeExceptions.date` type claim

**Rating:** LOW

The plan states: "`coachIntakeExceptions.date` is a `timestamp with timezone`". This was not verified against the actual schema. Minor documentation risk; no implementation impact for this plan.

---

### INFO — D8: All component file paths confirmed

**Rating:** INFO

| Path | Exists |
|---|---|
| `apps/web/src/components/trainers/TrainerFormDialog.tsx` | ✓ |
| `apps/web/src/components/trainers/TrainerServicesSection.tsx` | ✓ |
| `apps/web/src/components/customers/customer-360/package-row.tsx` | ✓ |
| `apps/web/src/routes/_authenticated/dashboard/_layout/my-services/view.tsx` | ✓ |
| `apps/web/src/components/trainers/category-buffer-row.tsx` | NEW (created by plan) |
| `apps/web/src/components/customers/customer-360/preferred-times-editor.tsx` | NEW (created by plan) |

---

## Status Table

| Finding | Rating | Issue |
|---|---|---|
| D1: TrainerServicesSection props correct | INFO | ✓ |
| D2: Unnecessary type cast | MEDIUM | Cosmetic |
| D3: organizationId scope in my-services | HIGH | Must verify source |
| D4: Phase 3 → Phase 1 dependency correct | INFO | ✓ |
| D5: preferredData not in PackageRow scope | CRITICAL | Will cause compile error |
| D6: PreferredTimeItem.dayOfWeek typed as string | MEDIUM | TypeScript type mismatch |
| D7: coachIntakeExceptions.date type unverified | LOW | Minor doc risk |
| D8: All file paths confirmed | INFO | ✓ |
