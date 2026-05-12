# Type Safety Audit — Pass 2

**Auditor:** type-safety-auditor
**Date:** 2026-05-07
**Based on:** Updated plan.md after Pass 1 fixes

---

## Summary

Pass 1 HIGH/CRITICAL type fixes confirmed applied. `changedAt` narrowed to `Date`. `notes` added to `StatusTimelineProps`. `nextCursor` moved to response level. `parseCursor` guard added. One new MEDIUM: the `rows` vs `entries` naming mismatch between API response and component props is a real type incompatibility that must be handled in the UI query hook. One new LOW: `parseCursor` splits on `"|"` but ISO timestamp strings can contain `+` or `:` — the `id` after splitting will only contain the UUID if the `changedAt` encoding is strict ISO without timezone offset (use UTC `.toISOString()` always).

---

## Findings

### CONFIRMED RESOLVED — `changedAt: Date | string` narrowed to `Date`

Plan output type now:
```typescript
changedAt: Date,  // Drizzle returns Date for timestamptz; never string
```
`StatusTimelineProps` also now uses `changedAt: Date`. ✓

### CONFIRMED RESOLVED — `notes` added to `StatusTimelineProps` entries

`StatusTimelineProps` entries now include `notes: string | null`. ✓

### CONFIRMED RESOLVED — `nextCursor` moved to response level

Output shape now:
```typescript
{
  rows: Array<{...}>,
  nextCursor: string | null,
}
```
Not inside each row. ✓

### CONFIRMED RESOLVED — `parseCursor` guard added

Guard function is now in the plan with null-return on malformed input. ✓

### MEDIUM — `rows` (API) vs `entries` (component prop) naming mismatch requires explicit mapping

**Location:** Plan section 3.4 (output shape uses `rows`), Phase 2 item 6 (`StatusTimelineProps` uses `entries`)

The API returns `{ rows: Array<...>, nextCursor }`. The `StatusTimeline` component expects `{ entries: Array<...> }`. The UI query hook must map:

```typescript
const { data } = useQuery({
  queryFn: () => client.salesOrders.statusHistory({ ... }),
});

// data.rows must be mapped to entries:
<StatusTimeline entries={data?.rows ?? []} isLoading={isLoading} />
```

The plan does not show this mapping in the UI component code, which risks an implementer accidentally passing `data` directly to `entries` (wrong type). The plan should explicitly note the `rows → entries` mapping.

### MEDIUM — `fromStatus: null` UI guard is documented but not enforced by type

**Location:** Plan Phase 2, item 6 `StatusTimelineProps`

The type `fromStatus: string | null` is correct. The plan notes "never render as the string `null`". But TypeScript won't enforce this at runtime — the component body must have an explicit check:
```typescript
{entry.fromStatus !== null ? <span>{entry.fromStatus}</span> : <span className="text-muted">Initial state</span>}
```

This is a runtime concern, not a type error, but the plan should include this snippet in the component spec to avoid the bug in implementation.

### LOW — `parseCursor` splits on first `|` but ISO strings containing `+` are safe

ISO timestamps from `.toISOString()` always use `Z` suffix (UTC), not `+HH:MM`. So `"2026-05-07T10:00:00.000Z|uuid-..."` splits cleanly on `|` with one separator. The cursor encoding is safe **as long as the encoder always uses `.toISOString()`** for the `changedAt` value.

**Risk:** If any code path encodes the cursor with a non-UTC timestamp like `"2026-05-07T18:00:00+08:00"`, the `split("|")` is still safe because `+` is a different character than `|`. No fix needed — just confirming safety.

### LOW — Zod schema uses `z.string().optional()` for cursor but does not validate the `|` format

The cursor Zod schema is:
```typescript
cursor: z.string().optional(),
```

This accepts any string. An invalid cursor won't cause a Zod parse error — it will reach `parseCursor` and return null (treated as no cursor). This is the correct behavior per the plan's guard design. No change needed.

### INFO — oRPC will infer return type from handler return value

Since oRPC uses structural type inference, the TypeScript return type of the procedure handler will be inferred from the returned object shape. The plan does not specify a separate `.output(z.object({...}))` validation schema. This is acceptable — oRPC infers output types without explicit `.output()` schemas. No action needed.

---

## Verdict

No new CRITICAL/HIGH type issues after Pass 1 fixes. Two MEDIUMs (`rows`→`entries` mapping and `fromStatus` null guard snippet) should be documented in plan before implementation.
