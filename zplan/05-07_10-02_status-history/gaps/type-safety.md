# Type Safety Audit — Pass 1

**Auditor:** type-safety-auditor
**Date:** 2026-05-07

---

## Summary

One CRITICAL type gap found: cursor parsing is unguarded and will throw on malformed input. Two HIGH gaps found: `changedAt` returned as `Date | string` creates nullable confusion; `fromStatus` null propagation is not guarded in the UI. Several MEDIUM gaps around Zod schema completeness.

---

## Findings

### CRITICAL — Cursor parsing has no error guard

**Location:** Plan section 3.4, section 7 (Pagination)

The plan specifies cursor encoding as `changedAt|id` (ISO + uuid). The API handler must parse this cursor on the way in. No guard is specified for:
- Malformed cursor strings (e.g. missing `|`)
- Invalid ISO date strings
- Invalid UUIDs

**Risk:** A client sending a malformed `cursor` string will cause a `Date.parse` NaN or string split producing wrong values, resulting in either an incorrect query or an unhandled exception that leaks as a 500.

**Required fix:** Wrap cursor parsing in a try/catch or Zod `.refine()`. If parsing fails, treat as no cursor (return from the beginning).

```typescript
function parseCursor(cursor: string): { changedAt: Date; id: string } | null {
  try {
    const [tsStr, id] = cursor.split("|");
    const changedAt = new Date(tsStr!);
    if (Number.isNaN(changedAt.getTime())) return null;
    if (!id || id.length !== 36) return null;
    return { changedAt, id };
  } catch {
    return null;
  }
}
```

---

### HIGH — `changedAt` column returns `Date` from Drizzle but plan output type says `Date | string`

**Location:** Plan section 3.4, output row shape

Plan output type:
```typescript
changedAt: Date | string,
```

Drizzle returns `Date` for `timestamp` columns with `{ withTimezone: true }`. The `Date | string` union is overly permissive and will force null-checks in the UI that are unnecessary.

**Fix:** Narrow the output type to `changedAt: Date` (Drizzle guarantees this). The UI component `StatusTimelineProps` also lists `changedAt: Date | string` — this should be narrowed or the component should accept both and call `new Date(changedAt)` before formatting.

---

### HIGH — `fromStatus: string | null` propagation not guarded in UI

**Location:** Plan section 5, Phase 1, item 4; Phase 2, item 6

The plan's `StatusTimeline` component receives `fromStatus: string | null`. If `fromStatus` is null (first transition), the UI must not render `null → toStatus` as text. The plan does not specify how to handle the null case visually.

**Risk:** Rendering `null` as a string in React produces `"null"` text visible to the user.

**Required:** The component must check `fromStatus !== null` before rendering it. Plan should explicitly document: "if `fromStatus` is null, render as 'Initial state' or omit the from-status portion."

---

### MEDIUM — Zod input schema uses `z.string().uuid()` for `entityId` but plan body uses `salesOrderId`

**Location:** Plan section 3.4

The shared input schema uses `entityId` as the generic key name:
```typescript
z.object({
  organizationId: z.string().uuid(),
  entityId: z.string().uuid(),
  ...
})
```

But in practice, each procedure should use the semantically correct key (`salesOrderId`, `appointmentId`, etc.) to match the codebase pattern (see existing `salesOrdersRouter.getById` which uses `id`, not `entityId`).

**Recommendation:** Use entity-specific key names in each procedure's Zod schema. Do not use a generic `entityId` — it violates the pattern established by all existing routers in this codebase.

---

### MEDIUM — `changedBy` output type is `string` but can be user ID (UUID) or literal "system"

The plan describes `changedBy: string` in the raw output and `changedByName: string` after resolution. The raw `changedBy` is not returned in the API output per the plan — only `changedByName` is returned. This is correct.

**Verify:** The implementation should NOT return raw `changedBy` (UUID) in the API response — only `changedByName` (resolved name). Leaking user UUIDs to the frontend is a minor privacy concern.

---

### MEDIUM — `limit` default in Zod differs from plan description

Plan section 3.4 shows:
```typescript
limit: z.number().int().min(1).max(100).default(50),
```

Plan section 7 states "Default `limit = 50`." These are consistent. However, the existing `salesOrdersRouter.list` uses `max(200)` not `max(100)`. For read-heavy history endpoints, max(100) is appropriate but should be documented explicitly as a deliberate constraint.

---

### LOW — `notes` field — plan output type includes `notes: string | null` but `StatusTimelineProps` in Phase 2 does not include `notes`

**Location:** Plan section 5, Phase 2, item 6

The `StatusTimelineProps` interface in the plan:
```typescript
interface StatusTimelineProps {
  entries: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedByName: string;
    changedAt: Date | string;
    reason: string | null;
    notes: string | null;  // ← MISSING from props interface shown in plan
  }>;
  ...
}
```

The plan's `StatusTimelineProps` code block omits `notes` from the entries array type. The API output includes `notes` but the component props don't declare it. This will cause a type error if the component tries to access `entry.notes`.

**Fix:** Add `notes: string | null` to the `StatusTimelineProps.entries` array item type.

---

### INFO — `nextCursor: string | null` in output is well-typed

The plan specifies `nextCursor: string | null`. Returning `null` when no more pages exist is idiomatic. The Zod output schema (not shown in plan) should declare this explicitly so oRPC generates correct client types.
