# Type Safety Audit

## Summary

Critical type safety issues found: (1) `TrainerRow` type does not expose `userId`, causing AS-001 staffId bug to be undetectable at compile time. (2) `OnSubmitPayload.staffAssignments[].staffId` is `string` — no distinction between member.id and member.userId at type level. (3) `recurrenceParams` type in frontend (`CustomRecurrence`) does not match backend API input shape. (4) Edit semantics enum is partially typed. (5) `syntheticId` approach has unsafe string parsing.

---

## Findings

### TS-001 — CRITICAL: `TrainerRow` type has no `userId` field
**Severity: CRITICAL**

`apps/web/src/hooks/useAppointmentFormData.ts`:
```typescript
export type TrainerRow = {
  id: string;       // ← this is members.id (tenant DB UUID)
  name: string;
  role: string;
  department: string;
  // NO userId field
};
```

The StaffPicker uses `trainer.id` as the Select value. The form hook puts `newAppointment.employeeId` (which equals `trainer.id = members.id`) into `staffAssignments[].staffId`.

TypeScript cannot catch this because both `members.id` and `members.userId` are `string`. The type system has no branded/nominal distinction.

**Fix:** Add `userId: string` to `TrainerRow`:
```typescript
export type TrainerRow = {
  id: string;     // members.id — for trainerId FK field
  userId: string; // members.userId — for staffAssignments[].staffId
  name: string;
  role: string;
  department: string;
};
```
Then update the mapping in `useAppointmentFormData.ts`: `userId: m.userId`.
Then update `StaffPicker` and `useAppointmentFormState` to use `trainer.userId` for `staffAssignments`.

---

### TS-002 — `OnSubmitPayload.staffAssignments` type is opaque `string` — cannot enforce userId
**Severity: MEDIUM**

```typescript
// apps/web/src/types/appointments.ts
export type OnSubmitPayload = {
  ...
  staffAssignments?: { staffId: string; slotIndex: number }[];
};
```

`staffId: string` gives no compile-time assurance it is a userId vs member.id. Consider a branded type or at minimum a JSDoc comment:
```typescript
/** staffId must be members.userId (control-panel user ID), NOT members.id */
staffAssignments?: { staffId: string; slotIndex: number }[];
```

---

### TS-003 — Frontend `CustomRecurrence` type does NOT match backend `RecurrenceParams`
**Severity: HIGH**

Frontend type (`apps/web/src/types/appointments.ts`):
```typescript
export type CustomRecurrence = {
  frequency: number;        // plan calls this "frequencyValue"
  timeUnit: string;
  repeatOn: string[];       // ← array of strings, plan says number[]
  monthlyType?: string;
  endsType: string;
  endsDate: string;         // plan calls this "endsOn"
  endsOccurrences: number;  // plan calls this "endsAfterOccurrences"
};
```

Backend `RecurrenceParams` (proposed in plan Phase 2.2):
```typescript
recurrence?: {
  frequencyValue: number;
  timeUnit: 'day' | 'week' | 'month';
  repeatOn?: number[];      // ← number[], not string[]
  monthlyType?: 'day_of_month' | 'day_of_week';
  monthlyDayOfWeek?: number;
  monthlyWeekOfMonth?: number;
  endsType: 'never' | 'on_date' | 'after_occurrences';
  endsAfterOccurrences?: number;
  endsOn?: Date;
}
```

Mismatches:
- `frequency` vs `frequencyValue`
- `repeatOn: string[]` vs `repeatOn: number[]` (weekday chips return strings like "Mon" in `RepeatRuleSection` — must be converted to numbers 0-6)
- `endsDate: string` vs `endsOn?: Date` (type coercion needed)
- `endsOccurrences` vs `endsAfterOccurrences`
- `endsType` string literal "on"/"after" vs "on_date"/"after_occurrences" (confirmed from RepeatRuleSection.tsx line 198: `"on"` and `"after"`)

**Fix required in Phase 2.7:** An adapter/mapper function to convert `CustomRecurrence` → `RecurrenceParams` before the API call. OR update `CustomRecurrence` to match backend types directly. The existing `RepeatRuleSection` uses "on"/"after"/"never" — plan must account for this translation.

---

### TS-004 — Edit semantics enum: "this/all/future" not formally typed
**Severity: MEDIUM**

Plan Phase 2.9 describes 6 edit actions:
- "Edit this", "Cancel this" → `materializeOccurrence`
- "Edit all future", "Cancel all future" → `splitSeries`
- "Edit all", "Cancel all" → `update` on parent

These should be a discriminated union or enum type in the frontend to prevent string typos. Plan does not define a formal `EditOccurrenceAction` type. Without it, conditional logic will use raw string comparisons.

Proposed type (add to `packages/types/src/` or `apps/web/src/types/`):
```typescript
export type OccurrenceEditAction =
  | "edit_this"
  | "cancel_this"
  | "edit_future"
  | "cancel_future"
  | "edit_all"
  | "cancel_all";
```

---

### TS-005 — `syntheticId` parsing is unsafe string splitting
**Severity: MEDIUM**

Plan Phase 2.3: virtual occurrence `id` = `"{parentId}:{isoDate}"`. Client detects `id.startsWith('virtual:')` and parses `parentId` and `occurrenceDate`.

Plan says prefix `virtual:` but the id format is `{parentId}:{isoDate}` — so the actual detection is `id.includes(':')` plus length check, or the prefix changes to `virtual:{parentId}:{isoDate}`.

Risk: `appointments.id` is a UUID which does not contain `:`, so splitting on `:` first occurrence would give `parentId`. But ISO dates also contain `:` (e.g. `2026-05-07T10:30:00.000Z`). Splitting on first `:` would give wrong results.

**Recommendation:** Use a clear delimiter that cannot appear in UUIDs or dates, e.g.:
```
virtual__{parentId}__{isoDate}
```
Or define a typed `VirtualOccurrenceId` branded string with a parser function. This must be formally defined before Phase 2.3/2.8 implementation.

---

### TS-006 — `RecurrenceRule` type for `expandRecurrenceRule` function not defined in plan
**Severity: MEDIUM**

Plan Phase 2.1:
```typescript
export function expandRecurrenceRule(
  rule: RecurrenceRule,
  parentStartTime: Date,
  windowStart: Date,
  windowEnd: Date,
): Date[]
```

`RecurrenceRule` type is not defined. It should be derived from the DB schema:
```typescript
type RecurrenceRule = typeof recurrenceRules.$inferSelect;
```
But the plan should explicitly state this to avoid implementers defining a redundant type.

---

### TS-007 — `AppointmentWithOccurrence` extends `Appointment` — need to confirm base type
**Severity: LOW**

Plan Phase 2.1:
```typescript
interface AppointmentWithOccurrence extends Appointment {
  occurrenceDate?: Date;
  isVirtual: boolean;
  parentId?: string;
  syntheticId?: string;
}
```

The base `Appointment` type should be `typeof appointments.$inferSelect` from the schema. This is standard pattern in the codebase. Plan should confirm this rather than leaving `Appointment` unresolved.

---

### TS-008 — `timeUnit` in recurrence is `text` (unconstrained) in DB but plan uses union type
**Severity: LOW**

`recurrence_rules.timeUnit: text("time_unit").notNull()` — no DB-level check constraint.
Plan correctly types the service layer as `'day' | 'week' | 'month'` union.
Zod validation in router will enforce this. No action needed at DB level, but implementers should use `z.enum(['day', 'week', 'month'])` in the router input schema.

---

### TS-009 — `endsType` in recurrence is `text` (unconstrained) in DB
**Severity: LOW**

Same as TS-008 for `endsType: text("ends_type").notNull()`.
Should use `z.enum(['never', 'on_date', 'after_occurrences'])` in router.

---

## Summary Table

| ID | Issue | Severity |
|----|-------|----------|
| TS-001 | TrainerRow missing userId field | CRITICAL |
| TS-002 | staffId opaque string | MEDIUM |
| TS-003 | CustomRecurrence ↔ RecurrenceParams shape mismatch | HIGH |
| TS-004 | Edit semantics not formally typed | MEDIUM |
| TS-005 | Synthetic ID parsing unsafe | MEDIUM |
| TS-006 | RecurrenceRule type not defined | MEDIUM |
| TS-007 | AppointmentWithOccurrence base type unclear | LOW |
| TS-008 | timeUnit text unconstrained in DB | LOW |
| TS-009 | endsType text unconstrained in DB | LOW |
