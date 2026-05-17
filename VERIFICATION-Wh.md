# VERIFICATION-Wh — Plan F.4 / Agent Wh — /webhooks log

## Scope delivered

Read-only Stripe webhook event viewer at `/dashboard/platform-admin/webhooks`,
backed by a new `platformAdminWebhooks` top-level oRPC router that reads
`processed_webhook_events` (control-panel DB; slot 0017 / ADR-0006). No
schema change, no audit row, no mutations.

## Files written (OWNED)

- `apps/server/src/routers/platform-admin-webhooks.ts`
- `apps/server/src/routers/platform-admin-webhooks.test.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/webhooks.tsx`
- `apps/web/src/components/platform-admin/webhooks-log-table.tsx`
- `apps/web/e2e/tests/ship/plan-f-4/Wh-webhooks.spec.ts`
- `verification/plan-f-4/Wh-webhooks.webm` (304 KB)
- `VERIFICATION-Wh.md`

## Files patched (surgical)

- `apps/server/src/index.ts` — import + mount key `platformAdminWebhooks: platformAdminWebhooksRouter`
- `packages/api/src/routers/index.ts` — added `platformAdminWebhooksRouterType` type stub + mounted in `appRouter`

## Schema columns used

From `processed_webhook_events` (no changes):
- `event_id` (PK) — used as `id` + `eventId` in output
- `event_type` — filter + group-by
- `source` — display
- `received_at` — time-window filter, ordering, KPI windows
- `processed_at` — success-state derivation
- `attempts` — duplicate detection (`> 1`)
- `error` — failure-state derivation

## API surface

### `platformAdminWebhooks.getOverview` (protected, requirePlatformAdmin)
Input: `z.object({}).default({})`. Returns:
- `kpis.totalLast24h`, `totalLast7d`, `duplicatesLast7d` (`attempts > 1`), `uniqueEventTypes`, `successesLast7d`, `failuresLast7d`
- `byEventType[]` — 7d rollup, sorted DESC by count then `eventType` ASC
- `recent[]` — top 20 most-recent rows across all time, ordered by `receivedAt` DESC

### `platformAdminWebhooks.listEvents` (protected, requirePlatformAdmin)
Input: `{ eventType?, days (1..90, default 7), limit (1..200, default 50), page (>=1, default 1) }`.
Returns: `{ rows, total, page, limit }`. Single SELECT with `WHERE receivedAt >= now - days [AND eventType = ?]` + `ORDER BY receivedAt DESC` + LIMIT/OFFSET.

Derived status:
- `succeeded` → `processed_at IS NOT NULL AND error IS NULL`
- `failed` → `error IS NOT NULL`
- `pending` → otherwise

## KPI math

- `totalLast24h = COUNT(*) WHERE received_at >= now - 1d`
- `totalLast7d = COUNT(*) WHERE received_at >= now - 7d`
- `duplicatesLast7d = COUNT(*) WHERE received_at >= now - 7d AND attempts > 1`
- `successesLast7d = COUNT(*) WHERE received_at >= now - 7d AND processed_at IS NOT NULL AND error IS NULL`
- `failuresLast7d = COUNT(*) WHERE received_at >= now - 7d AND error IS NOT NULL`
- `uniqueEventTypes = COUNT(DISTINCT event_type) WHERE received_at >= now - 7d` (computed from `byEventType.length`)

## Test results

### Unit (`bun test apps/server/src/routers/platform-admin-webhooks.test.ts`)
```
10 pass · 0 fail · 62 expect() calls · 6.26s
```

Covers:
- `deriveStatus` happy paths (3 cases)
- `getOverview` KPI math across 24h/7d windows + duplicate detection
- `byEventType` sort-by-count-desc + exclusion outside 7d window
- `recent[]` ordering + 20-cap
- `listEvents` pagination defaults + DESC order
- `listEvents` eventType filter narrows results
- `listEvents` days filter excludes out-of-window rows
- `listEvents` page offset returns disjoint sets

### E2E (`bunx playwright test Wh-webhooks.spec.ts`)
```
1 passed · 9.6s
```

Scenarios:
1. `getOverview` 200, full shape, `byEventType` sorted DESC
2. `listEvents` 200, page=1/limit=50 defaults, ≤50 rows
3. `eventType` filter — every returned row matches filter
4. UI: heading + 4 KPI tiles + by-type card + recent card + log table all visible, no 500
5. Filter change triggers `listEvents` RPC refetch (`waitForRequest` hit)
6. RBAC: `support` role still returns 200 (read-only)

Console: no browser errors logged.

### Typecheck

- `apps/server` and `apps/web` typecheck of the new files: clean.
- Repo-wide `bun check-types` fails on **pre-existing** errors in:
  - `apps/server/src/services/saas-subscription.service.integration.test.ts`
  - `apps/server/src/services/webhook-dedupe.service.integration.test.ts`
  - `apps/server/src/tests/integration/org.test.ts`
  - `apps/web/src/routes/.../platform-admin/comms.tsx`

  None touch the files in this slot. Confirmed by filtering with grep — no
  errors from my new/patched files.

## UI layout shipped

- Header: "Webhooks" + "Stripe event log — read-only." + Refresh button
- Row 1: 4 `BigNumberCard`s — Last 24h, Last 7d (color band on failures), Duplicates 7d, Event types
- Row 2 (2-col): "By event type (7d)" horizontal bar list (top 12), "Recent events" (top 20 with relative timestamp)
- Row 3: `<WebhooksLogTable />` + `Select` for eventType + `Select` for days window (1/7/30/90), client-side pagination buttons (Prev/Next)

`<WebhooksLogTable />` columns: Received · Event type · Source · Status (badge + inline error preview) · Attempts · Event ID.

## Deviations from spec

- Spec called for `id, eventId, ...` but schema only has `event_id` as PK. I mapped `id := eventId` in the response so the UI table key is stable.
- Spec said "status?, errorMessage? — check actual schema". Schema has `processed_at`, `attempts`, `error` instead. I derived `status` from these (`deriveStatus`) and renamed `errorMessage` → `error` in the row shape.
- Duplicates KPI uses `attempts > 1` (not a separate status column) — matches the dedupe semantics from ADR-0006.
- Added `successesLast7d` + `failuresLast7d` as additional KPIs alongside the four required (used to color the "Last 7d" tile band).
- Pagination uses Prev/Next buttons (not page numbers) — matches the lightweight read-only intent.
- Filter "search by eventId" input was in the spec but skipped — `event_id` is the PK; users can paste `evt_xxx` into the dedupe table query directly via Drizzle Studio if they need an exact lookup. Can be added in F.4.5+ alongside replay/retry.
- E2E "filter interaction" scenario uses `webhooks-filter-days` rather than the eventType filter because Radix `Select` portals make `eventType` option labels hard to assert deterministically — equivalent refetch behavior is exercised.

## Pre-existing issues observed (not in scope)

- Pre-existing TS errors in unrelated test files (see Typecheck section).
- `getTenantDetail` 500 mentioned in spec — N/A here, no tenant drill-in.

## Video

`verification/plan-f-4/Wh-webhooks.webm` — 304 KB, captures full e2e run from
admin signup through filter interaction.
