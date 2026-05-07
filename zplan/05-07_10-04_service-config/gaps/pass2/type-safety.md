# Type Safety Audit — Pass 2

**Auditor:** type-safety-auditor
**Date:** 2026-05-07 (Pass 2)

## Pass 1 Fixes Verified

- TS1 (AppointmentFormContentProps manual update) — FIXED: explicit note added to Task 3.2
- TS2 (qualifiedTrainerIds useMemo) — FIXED: plan now wraps in `React.useMemo`
- TS3 (useQueryClient in TrainersTab) — FIXED: `const qc = useQueryClient();` added to TrainersTab spec, but note it appears AFTER the two `useQuery` calls. React hooks must be called in consistent order and BEFORE any conditional returns — check placement.

## New Findings (Pass 2)

### P2-TS1 — MEDIUM: `useQueryClient()` hook placement in `TrainersTab` violates Rules of Hooks ordering

The plan's `TrainersTab` now shows:
```typescript
function TrainersTab({ serviceId, organizationId }: TrainersTabProps) {
  // 1. fetch assigned trainers
  const { data: assigned = [], refetch } = useQuery({...});

  // 2. fetch all active trainers
  const { data: allTrainers = [] } = useQuery({...});

  const assignedIds = new Set(...);
  const unassigned = allTrainers.filter(...);

  // NOTE (audit TS3): useQueryClient must be called at the top of the component
  const qc = useQueryClient();
```

The comment says "at the top" but the code places it AFTER two `useQuery` calls. This is technically valid (hooks can be called in any order as long as it's consistent — no conditionals), but placing it after derived logic is confusing. **Best practice:** move `useQueryClient()` before the `useQuery` calls.

This is a LOW-MEDIUM risk: React won't error, but code review will flag it as a hooks ordering violation of best practices.

### P2-TS2 — MEDIUM: `TrainersTab` missing `useUserContext` for `organizationId`

The plan's `TrainersTab` receives `organizationId` as a prop. But to call `useQueryClient()` and `useMutation`, it still needs access to the query client. Looking at `service-detail-dialog.tsx`: the dialog receives `organizationId` as a prop. The `TrainersTab` will also receive it as a prop (per the plan's `TrainersTabProps`). **This is correct — `organizationId` flows down as a prop, not from a hook.** VERIFIED.

### P2-TS3 — LOW: `serviceAssignments` type inference from `listForService`

When `useQuery` calls `client.serviceMembers.listForService(...)`, the return type is inferred from the oRPC router return:
```typescript
{ memberId: string; isPrimary: boolean; displayName: string }[]
```

The `serviceAssignments` variable is typed as this array (or `[]` as default). The `qualifiedTrainerIds = useMemo(() => serviceAssignments.map(a => a.memberId), [serviceAssignments])` produces `string[]`. **SAFE.**

### P2-TS4 — MEDIUM: `derivedTrainers` return type must match `StaffPickerProps.trainers`

`StaffPicker` expects `trainers: Trainer[]` where `Trainer = { id: string; name: string; role: string; department: string }`.

`TrainerRow` from `useAppointmentFormData` = `{ id: string; name: string; role: string; department: string }`.

`derivedTrainers` is `TrainerRow[]` = `trainers.filter(...)` where `trainers` is `TrainerRow[]`.

The plan passes `derivedTrainers` to `StaffPicker` in place of `trainers`. Both have the same shape. **SAFE.**

However, the plan's `AppointmentFormContentProps` currently declares `trainers: { id: string; name: string; role: string; department: string }[]` (inline type, not `TrainerRow`). The plan must add `derivedTrainers` with the same inline type. If the implementor uses the named `TrainerRow` type, they need to import it from `useAppointmentFormData`. The plan should specify which.

### P2-TS5 — LOW: The `trainerFilterActive` and `trainerFilterFallback` are `boolean` but default to `false` in the hook when `firstServiceId = null`

```typescript
const trainerFilterActive = firstServiceId !== null && serviceAssignments.length > 0;
const trainerFilterFallback = firstServiceId !== null && serviceAssignments.length === 0;
```

When `firstServiceId = null`: both are `false`. When query is loading (no `serviceAssignments` yet): `serviceAssignments = []` (default), so `trainerFilterActive = false`, `trainerFilterFallback = true`. This means while the query is loading (service selected but assignments not yet returned), the fallback caption shows briefly. **Potential UX flicker.**

**Recommendation:** Add `isLoadingAssignments` check:
```typescript
const trainerFilterFallback = firstServiceId !== null && !isLoadingAssignments && serviceAssignments.length === 0;
```

## Summary

| ID | Severity | Finding |
|---|---|---|
| P2-TS1 | MEDIUM | `useQueryClient()` placed after useQuery calls — should move to top |
| P2-TS2 | VERIFIED | organizationId correctly passed as prop |
| P2-TS3 | VERIFIED | serviceAssignments type inference correct |
| P2-TS4 | MEDIUM | Need to specify TrainerRow import or inline type for derivedTrainers in props |
| P2-TS5 | LOW | trainerFilterFallback flickers during loading — add isLoadingAssignments guard |
