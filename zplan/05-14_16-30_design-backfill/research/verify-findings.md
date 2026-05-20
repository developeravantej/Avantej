# Phase 0 — Verify Findings
Date: 2026-05-14
Author: verify agent

## 0.1 google_calendar_connections.last_sync_at
**Answer:** YES
**Evidence:** `packages/db/src/schema/tenant/google-calendar-connections.ts:16` — `lastSyncAt: timestamp("last_sync_at", { withTimezone: true })`. Also `last_sync_error` at line 17. Confirmed in generated migrations `packages/db/src/generated/tenant-migrations.generated.ts:1694-1695`.
**Implication:** Migration D does NOT need to add `last_sync_at`. KPI "Last sync" can read this column directly. (Note: column is nullable — UI must handle `null` as "Never synced".)

## 0.2 gcal sync events / conflicts table
**Answer:** NO
**Evidence:** Grep for `gcal_sync_events`, `gcal_conflicts`, `sync_events`, `conflict_count` across `packages/db/src` returned zero matches. Only `ghl_sync_events` exists (GoHighLevel CRM, unrelated). The Google Calendar schema is just `google_calendar_connections` + `google_calendar_event_mappings` — neither tracks per-connection sync-event counts or conflict counts.
**Implication:** "Conflicts detected" KPI must show "—" (or be removed). If we want a real number, Migration D must add either a `gcal_sync_events` table or a `conflict_count` column on `google_calendar_connections`.

## 0.3 hierarchy_nodes.address / opening_hours
**Answer:**
- `address`: **YES** — `packages/db/src/schema/tenant/hierarchy.ts:30` `address: text("address")` (nullable, branch-only).
- `opening_hours`: **NO** — grep for `opening_hours` / `openingHours` across `packages/db/src` returned zero matches.
**Implication:** Migration I still needed, but scope reduces to **only** `opening_hours` (jsonb or text). Do NOT re-add `address`.

## 0.4 Roles V1 — per-role Delete action
**Answer:** NO
**Evidence:** Read `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx` end-to-end (617 lines). Role list is rendered inline as `<button>` cards (lines 412-447) — only props are `onClick={() => setSelectedRoleId(role.id)}`. No `···` menu, no hover Trash icon, no `deleteRole` mutation. Grep for `deleteRole|roles\.delete|Delete role|Trash` within `access-control/` shows hits ONLY in legacy/unmounted components (`permission-cards/RoleCard.tsx`, `editors/RoleEditor.tsx`, `pages/access-control/roles-tab.tsx`) — none of these are imported by the live `roles.tsx` route. The active page imports only `RoleEditor` (for the create dialog) and `PermissionMatrix` types.
**Implication:** Phase 2-A MUST restore per-role Delete (with system-role guard). Backend `client.roles.delete` may or may not exist — verify in Phase 2-A.

## 0.5 PosWorkflow — multi-client per sale
**Answer:** NO
**Evidence:**
- `pos-workflow.tsx:171` — single `selectedCustomer` state for the entire sale.
- `pos-workflow.tsx:446-472` `recordSale` call sends a single `customerId` / `customerType` / `customerName` (not per-item).
- `items-step.tsx` — `CartItem` shape only has `{id, type, refId, description, quantity, unitPriceCents}`; no `clientId`/`assignedTo`/`forClientId`. Grep in `apps/web/src/components/pos/` and `pos/types.ts` for these patterns returned zero matches.
- Trainer assignment per-item exists (`ItemTrainerAssignments`, `trainer-picker-step.tsx`) — but trainers ≠ clients/customers.
- Customer-switch handler `handleCustomerSelect` (line 346) explicitly clears the cart when the customer changes.
**Implication:** Phase 2 MUST restore multi-client per sale (per-line `clientId` on `CartItem`, UI selector per row, and backend `pos.recordSale` items[] must accept per-line client).

## Summary — migration scope adjustments
- **Migration D (gcal):** SHRINK — `last_sync_at` already exists. Either drop "Conflicts detected" KPI or add a new sync-events/conflicts table+column (decision needed).
- **Migration I (hierarchy):** SHRINK — `address` already exists; only `opening_hours` needs adding.
- **Phase 2-A (Roles V1):** Restore Delete affordance + wire `client.roles.delete`.
- **Phase 2 (POS):** Restore per-item client assignment (schema, types, items-step UI, cart-summary display, recordSale payload).
