# Future: Net Promoter Score (NPS) Reporting

**Status:** Parked. Mobile app teams own collection.

## What was removed

- KPI tile #6 in `reports/view.tsx` ("NPS Score") was a UI-only stub displaying `—` with a fake sparkline of `[18, 16, 14, 15, 12, 10, 9, 7, 6]`. Removed because:
  - No data source existed (no `nps_responses` table, no survey UI).
  - Displaying `—` next to working KPIs eroded user trust in the dashboard.
- The `stub` prop on `KpiTile` becomes unused after this removal — kept for now in case other stubs return; safe to delete once nothing references it.

## When to bring NPS back

The mobile apps (per the product owner) handle NPS surveys directly. When mobile starts emitting NPS responses:

1. **Tenant table** `nps_responses`:
   - `id uuid pk`
   - `member_id uuid` (FK members.id, cascade)
   - `score smallint` (0–10)
   - `comment text` (optional, free-form)
   - `submitted_at timestamptz`
   - `source text` (e.g., "mobile-ios", "mobile-android", "in-app-post-class")
2. **Service** `nps.service.ts`:
   - `submitNpsResponse(tenantDb, params)` — called by mobile API or webhook
   - `getNpsSummary(tenantDb, { from, to })` — returns `{ score, promoters, passives, detractors, totalResponses, trendSeries }`
   - NPS formula: `% promoters (9–10) − % detractors (0–6)`, range −100 to +100
3. **Router** `nps`:
   - `submit` — public or authenticated depending on whether mobile passes a member token
   - `getSummary` — `protectedProcedure`, guarded by `reports:read`
4. **Reports page**:
   - Restore the KpiTile, wire `value` to `client.nps.getSummary({...})`, drop the `stub` prop.
   - Bring grid back to `xl:grid-cols-6`.

## Why this is here

When a feature is half-built across multiple repos (mobile + backend + dashboard), the dashboard ends up looking complete while the data layer is empty. Better to remove the visual artefact entirely until the data flow is real, then re-add in one commit. This file is the breadcrumb for that commit.
