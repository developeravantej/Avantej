# Type Safety Audit — Pass 1

**Auditor:** type-safety-auditor
**Date:** 2026-05-07

## New `listForService` Procedure Return Type

The plan's Drizzle query selects:
```typescript
{
  memberId: serviceMembers.memberId,   // uuid → string
  isPrimary: serviceMembers.isPrimary,  // boolean
  displayName: memberProfiles.displayName,  // text | null → string | null
}
```

Return mapping:
```typescript
{
  memberId: r.memberId,       // string (UUID)
  isPrimary: r.isPrimary,     // boolean
  displayName: r.displayName ?? r.memberId,  // string (never null)
}
```

**Type correctness:** `r.displayName` is `string | null` from the leftJoin. `r.memberId` is `string`. The `??` operator correctly narrows to `string`. **SAFE.**

## `TrainersTab` — `allTrainers` shape vs. `assignedIds` comparison

`allTrainers` from `members.list` returns items with shape `{ id: string, ... }`.
`assigned` from `listForService` returns items with `{ memberId: string, ... }`.

Plan comparison: `!assignedIds.has(m.id)` where `assignedIds = new Set(assigned.map((a) => a.memberId))`.

- `m.id` = `members.id` (UUID, from members.list)
- `a.memberId` = `service_members.member_id` (FK → `members.id`, UUID)

Both are UUIDs referencing the same `members.id`. **Comparison is type-correct and semantically correct.**

## `useAppointmentFormState` — `firstServiceId` type

```typescript
const firstServiceId = newAppointment.selectedServices[0] ?? null;
```

`newAppointment.selectedServices` is `string[]` (from `NewAppointment` type). Indexing with `[0]` on an empty array returns `undefined`. The `?? null` coalesces `undefined` → `null`. `firstServiceId` type: `string | null`. **SAFE.**

## `useQuery` enabled guard

```typescript
enabled: !!organizationId && !!firstServiceId,
```

`organizationId` is `string` (possibly empty `""`). `!!""` is `false`. **SAFE — guards against empty string.**

`firstServiceId` is `string | null`. `!!null` is `false`. **SAFE.**

## `qualifiedTrainerIds` type

```typescript
const qualifiedTrainerIds = serviceAssignments.map((a) => a.memberId);
```

`serviceAssignments` is `{ memberId: string, isPrimary: boolean, displayName: string }[]` (from `listForService` return). `.map(a => a.memberId)` produces `string[]`. **SAFE.**

## `derivedTrainers` type

```typescript
const derivedTrainers = firstServiceId && serviceAssignments.length > 0
  ? trainers.filter((t) => qualifiedTrainerIds.includes(t.id))
  : trainers;
```

`trainers` is `TrainerRow[]` from `useAppointmentFormData`. The filter preserves the type. `derivedTrainers` is `TrainerRow[]`. **SAFE.**

## `StaffPicker` prop additions — type check

Current `StaffPickerProps`:
```typescript
type StaffPickerProps = {
  trainers: Trainer[];
  commissionSlots: CommissionSlot[];
  employeeId: string;
  additionalSlotTrainers: string[];
  onChangeEmployeeId: (trainerId: string) => void;
  onChangeAdditionalTrainer: (idx: number, trainerId: string) => void;
  trainerPlaceholder: string;
  disableWhenNoRoom?: boolean;
  roomId?: string;
};
```

Plan adds:
```typescript
trainerFilterActive?: boolean;
trainerFilterFallback?: boolean;
```

Both are optional — additive and non-breaking. **SAFE.**

## Finding TS1 — MEDIUM: `useAppointmentFormState` return type not explicit

The hook `useAppointmentFormState` returns an inferred object type (no explicit `return type` annotation). When the plan adds `derivedTrainers`, `trainerFilterActive`, `trainerFilterFallback` to the return, TypeScript will infer the new fields. But `AppointmentFormContent.tsx` destructures the full return object via props — **the props type in `AppointmentFormContent` is NOT derived from the hook return**, it is a manually maintained `AppointmentFormContentProps` type.

This means adding fields to the hook return does NOT automatically update the component's prop types. The plan must also:
1. Add `derivedTrainers`, `trainerFilterActive`, `trainerFilterFallback` to `AppointmentFormContentProps`
2. Pass these through from the modal to the form content
3. Pass them to `StaffPicker`

**The plan describes this in Tasks 3.2 and 3.3 but does not explicitly warn about the manual prop type sync.** This is a HIGH risk of TypeScript errors during implementation.

**Recommendation:** Add a note in Task 3.2 explicitly stating: "Update `AppointmentFormContentProps` type to add `derivedTrainers: TrainerRow[]`, `trainerFilterActive: boolean`, `trainerFilterFallback: boolean`."

## Finding TS2 — LOW: `useEffect` dependency array may cause stale closure

Task 3.4:
```typescript
React.useEffect(() => {
  if (!trainerFilterActive) return;
  const currentTrainerId = newAppointment.assignedTo;
  if (currentTrainerId && currentTrainerId !== "none" && !qualifiedTrainerIds.includes(currentTrainerId)) {
    setNewAppointment((prev) => ({ ...prev, assignedTo: "none" }));
  }
}, [firstServiceId, trainerFilterActive, qualifiedTrainerIds]);
```

`qualifiedTrainerIds` is a new array reference on every render (computed from `serviceAssignments.map(...)`). This means the effect fires on every render where `serviceAssignments` changes. To prevent spurious rerenders, `qualifiedTrainerIds` should be wrapped in `useMemo`:
```typescript
const qualifiedTrainerIds = useMemo(
  () => serviceAssignments.map((a) => a.memberId),
  [serviceAssignments]
);
```

Without `useMemo`, the effect will re-fire on every `serviceAssignments` query refetch even if the values are identical. **LOW — performance, not correctness.**

## Finding TS3 — MEDIUM: `TrainersTab` missing `useQueryClient`

The plan's `TrainersTab` code uses `qc.invalidateQueries(...)` but doesn't show `const qc = useQueryClient()` in the component. The mutation `onSuccess` callbacks reference `qc` without it being in scope. **This is a TypeScript/runtime error if omitted.**

**Plan must include:** `const qc = useQueryClient();` inside `TrainersTab`.

## Summary

| ID | Severity | Finding |
|---|---|---|
| TS1 | MEDIUM | `AppointmentFormContentProps` must be manually updated (not inferred from hook) |
| TS2 | LOW | `qualifiedTrainerIds` needs `useMemo` to prevent effect re-fires |
| TS3 | MEDIUM | `TrainersTab` missing `useQueryClient()` call — runtime error if omitted |
