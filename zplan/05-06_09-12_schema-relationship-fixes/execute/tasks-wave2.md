# Task Inventory — Wave 2 (Phase 1 drift fixes)

**Generated:** 2026-05-06 12:35
**Scope:** Phase 1 drift fixes — D1 + D2. D3 dropped (no-op; schema already correct).

## D3 status: NO-OP
- Plan claimed `ghl_branch_links` → `ghl_location_links` rename. Inspection: `packages/db/src/migrations/control-panel/0006_free_bruce_banner.sql` creates `ghl_location_links` directly. Schema source `packages/db/src/schema/control-panel/ghl-location-links.ts` matches. No `ghl_branch_links` reference anywhere in repo.
- Action: documented as no-op; no migration written.

## Wave 2 tasks

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | D1 — Create `packages/db/src/migrations/tenant/0022_fix_walk_in_customer_actions.sql` | Agent 1.1 | done |
| 2 | 1 | D1 — `bun gen:migrations` + `bun verify:migrations` | Agent 1.1 | done |
| 3 | 1 | D2 — Create `apps/server/scripts/check-preferred-trainer-orphans.ts` | Agent 1.2 | done |
| 4 | 1 | D2 — Run script across all tenants; **0 orphans across 7 tenants — VACUOUSLY clean** (column not yet present; migration 0019 not yet applied to dev tenants). Re-run post-deploy. | Agent 1.2 | done w/ caveat |
| 5 | 1 | Verify integration tests still pass | Both | done (5/5 pass, 193 expects) |
