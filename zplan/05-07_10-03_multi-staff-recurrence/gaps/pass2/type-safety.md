# Pass 2 — Type Safety Audit

## Summary

Pass 1 CRITICAL TS-001 (`TrainerRow` missing `userId`) is annotated in plan but not fixed in source. New finding: `RepeatRuleSection` `DAYS` keys are string abbreviations ("M", "T", "W", "TH", "F", "S", "SU"), not ISO weekday numbers — the adapter must map these to 0-6 correctly.

---

## New Findings

### TS-P2-001 — `DAYS` key format in RepeatRuleSection does NOT map directly to 0-6 weekday numbers
**Severity: HIGH**

`RepeatRuleSection.tsx` DAYS array:
```typescript
const DAYS = [
  { key: "M",  full: "Monday"    },  // should be 1
  { key: "T",  full: "Tuesday"   },  // should be 2
  { key: "W",  full: "Wednesday" },  // should be 3
  { key: "TH", full: "Thursday"  },  // should be 4
  { key: "F",  full: "Friday"    },  // should be 5
  { key: "S",  full: "Saturday"  },  // should be 6
  { key: "SU", full: "Sunday"    },  // should be 0
];
```

The `repeatOn: string[]` field in `CustomRecurrence` stores values like `["M", "TH", "F"]`.

The backend `recurrence_rules.repeatOn` is `number[]` where `[0]=Sun, [1]=Mon, ..., [6]=Sat`.

The adapter function `mapCustomRecurrenceToParams` must convert:
```typescript
const DAY_KEY_TO_NUMBER: Record<string, number> = {
  "SU": 0, "M": 1, "T": 2, "W": 3, "TH": 4, "F": 5, "S": 6
};
// repeatOn: cr.repeatOn.map(k => DAY_KEY_TO_NUMBER[k]).filter(n => n !== undefined)
```

If this mapping is wrong, recurring series on the wrong days are silently created with no error. Must have a unit test for the adapter.

---

### TS-P2-002 — "year" in RepeatRuleSection timeUnit conflicts with backend `'day' | 'week' | 'month'` union
**Severity: MEDIUM** (mirrors SD-P2-002)

`RepeatRuleSection.tsx` has `<SelectItem value="year">year</SelectItem>`.
The planned backend Zod schema uses `z.enum(['day', 'week', 'month'])`.

If a user selects "year" in the UI and submits, the Zod validation in the router will reject with `"Invalid enum value"`. No graceful error handling is planned.

Fix options:
1. Add "year" to backend enum and implement year expansion in `expandRecurrenceRule`
2. Remove "year" from the UI dropdown in Phase 2.7
3. Show "Coming soon" tooltip on "year" option and disable it

Plan must resolve this in Phase 2.7 implementation notes.

---

### TS-P2-003 — `OccurrenceEditAction` type added to plan but not yet defined anywhere
**Severity: LOW** (expected — plan change only so far)

Pass 1 added the `OccurrenceEditAction` type to Phase 2.9 plan comments. It does not exist in source. Implementers should create it in `apps/web/src/types/appointments.ts` in Phase 2.9.

---

## Pass 1 Findings Still Open in Source

| TS | Source Status |
|----|---------------|
| TS-001: TrainerRow missing userId | Still open in `useAppointmentFormData.ts` |
| TS-003: CustomRecurrence ↔ RecurrenceParams mismatch | Still open — adapter function not yet written |
| TS-004: OccurrenceEditAction not typed | Listed in plan, not in source |
| TS-005: syntheticId unsafe parsing | Fixed in plan to `virtual__` format; not in source |
| TS-006: RecurrenceRule type not defined | Annotated in plan expansion function signature |
