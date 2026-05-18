# Plan F.2.5 — Agent C verification (`/comms` outbox + template library)

## Files created
- `packages/db/src/migrations/control-panel/0029_comms_templates.sql`
- `packages/db/src/schema/control-panel/comms-templates.ts`
- `apps/server/src/routers/platform-admin-comms.ts`
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/comms.tsx`
- `apps/web/src/components/platform-admin/comms-outbox-list.tsx`
- `apps/web/src/components/platform-admin/template-library-panel.tsx`
- `apps/web/src/components/platform-admin/template-editor-dialog.tsx`
- `apps/web/e2e/tests/ship/plan-f-2-5/C-comms.spec.ts`
- `verification/plan-f-2-5/C-comms.webm` (263 KB)
- `VERIFICATION-C.md` (this file)

## Files patched (surgical)
- `apps/server/src/index.ts` — imported `platformAdminCommsRouter`, mounted as top-level `platformAdminComms` key (after `platformAdminRevenue`)
- `packages/api/src/routers/index.ts` — added `platformAdminCommsRouterType` stub with full handler types for outbox + 6 template procs; mounted in `appRouter`
- `packages/db/src/schema/control-panel/index.ts` — added `export * from "./comms-templates"`

## Audit action strings
The outbox reads `admin_session_actions` rows with `action_type IN ('tenant_dm', 'tenant_announcement_create')`. These are the actual action strings written by `platform-admin-tenants-comms.ts` (Plan E.5) — the plan-doc placeholders `tenant.direct_message_sent` / `tenant.announcement_created` did not match source. Documented in router header.

Template mutations write new audit rows with:
- `comms_template_create`
- `comms_template_update`
- `comms_template_archive`
- `comms_template_unarchive`

## RPC results (from e2e run)
- `listOutbox({})` → 200, `{ rows: [], total: 0, page: 1, limit: 50 }` (empty dev DB — valid)
- `listOutbox({ kind: 'direct_message' })` → 200, all rows have kind = direct_message (zero rows in dev)
- `createTemplate(...)` → 200, returns `{ ok: true, template: {...id, name, subject, kind...} }`
- `updateTemplate({ id, subject })` → 200, returned template.subject == updated value
- `getTemplate({ id })` → 200, matches updated value
- `archiveTemplate({ id })` → 200; template hidden from default list, visible with `includeArchived: true` (`archivedAt` populated)
- Support-role `createTemplate(...)` → 403 FORBIDDEN, message "Your platform admin role does not permit this action"
- Support-role `listTemplates({})` → 200 (read-only OK)

## Playwright scenarios (all passed)
- ✅ Scenario 1: Outbox RPC golden shape
- ✅ Scenario 2: Outbox kind filter
- ✅ Scenario 3: Templates full CRUD (create → list → update → get → archive → list-default-hides → list-includeArchived-shows)
- ✅ Scenario 4: RBAC — super_admin allowed, support role 403
- ✅ Scenario 5: UI render at `/dashboard/platform-admin/comms` — heading + Outbox/Templates tabs visible, Template panel renders on click

Result: `1 passed (11.7s)`.

## Video
`verification/plan-f-2-5/C-comms.webm` — 263 KB.

## Migration
0029_comms_templates.sql applied manually to local dev control-panel DB via psql (CREATE TABLE + 2 indexes). `bun db:push` not used (journal drift documented in prior agents).

## Deviations
- Action-string mapping. Plan doc said `tenant.direct_message_sent` / `tenant.announcement_created`; source-of-truth strings are `tenant_dm` / `tenant_announcement_create`. Used the actual strings.
- Template payload `priority` enum: plan-doc used `info|warning|critical` for templates; existing Plan E.5 announcement send uses `low|normal|high|urgent`. Kept template-side as plan-spec (`info|warning|critical`) since this is template metadata, not an actual send. Agent B will map at compose-time as needed.
- Template `createdByUserId` stored as plain text (Better-Auth user id, no FK) to mirror the immutable-audit pattern used by `admin_session_actions.adminUserId` / `targetUserId`.

## Pre-existing issues hit
- `bun check-types` surfaces many unrelated failures in `apps/server` test files (`saas-subscription.service.integration.test.ts`, `webhook-dedupe.service.integration.test.ts`, `tests/integration/org.test.ts`). Scoped grep for `comms|template` shows zero type errors in new/touched files.
- `getTenantDetail` 500 (noted in handoff) — not touched here.

## Compliance with locked spec
- Symbols: `commsTemplates` table export ✅, `platformAdminCommsRouter` export ✅, `platformAdminCommsRouterType` stub ✅, top-level mount key `platformAdminComms` ✅
- Migration slot 0029 ✅; additive-only schema (CREATE TABLE IF NOT EXISTS + indexes); no DROP/RENAME
- Did NOT touch `platform-admin-tenants-comms.ts` (Agent B's extension target)
- Did NOT commit or push; no PR opened
