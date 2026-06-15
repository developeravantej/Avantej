# Phase 0 — Decisions Recorded (post-verify)

Date: 2026-05-14
Decided by: orchestrator (per user "Make all decisions based on optimal approach + scalability")

## D1 — Migration D (Google Calendar)
- Ship as drafted: add `sync_direction` + `conflict_policy` enums only.
- `last_sync_at` already exists; do NOT re-add.
- Bonus columns from Task 1.36 (`cached_calendar_list_json`, `cached_calendar_list_at`) BUNDLED into Migration D (one commit, idempotent — safe).

## D2 — Conflicts detected KPI
- **DEFER**. No backing data (no `gcal_sync_events` / no conflict counter).
- `googleCalendar.orgStatus` returns `conflictsDetected: null`; UI shows "—" with tooltip "Conflict tracking not yet enabled".
- Re-open as a new session if a franchise asks for it.

## D3 — Migration I (Hierarchy)
- ADD as a new migration; scope = `opening_hours jsonb` ONLY.
- `hierarchy_nodes.address` already exists; do NOT re-add.

## D4 — Roles V1 Delete
- Phase 2-A new task: restore per-role Delete on `roles.tsx`.
- Pattern: `···` overflow menu on each role-row → "Delete role". Disabled (with tooltip "System role cannot be deleted") for `isSystemRole` rows.
- Verify `client.roles.delete` procedure exists; if not, add as a small Phase 1b task.

## D5 — POS multi-client per sale
- **DEFER** to a future session.
- Rationale: This is not "restore hidden affordance" — the schema/types never had `clientId` per `CartItem`. Adding it requires: schema change (`sales_order_items.client_user_id` text), service refactor, UI redesign in items-step. That's a multi-day, multi-file feature build, not a UI re-expose.
- Aligns with §9.4 plan deferral note: "POS depth … acceptable for v1; revisit if cashier feedback says they can't find ...".

## Migration order (final)
1. A — sales_orders.refund_status + refunded_amount_cents (+ index, + backfill)
2. B — sales_orders.cancellation_reason_category (+ partial index)
3. C — payouts.gross_amount_cents + deductions_cents (+ backfill)
4. D — google_calendar_connections.sync_direction + conflict_policy + cached_calendar_list_json + cached_calendar_list_at
5. E — commission_splits indexes
6. F — branch_stats_cache table
7. G — sales_orders partial index for repeat-offender
8. I — hierarchy_nodes.opening_hours

All eight ship as one phase (user confirmed: commit per phase, pre-prod). Idempotent SQL throughout.
