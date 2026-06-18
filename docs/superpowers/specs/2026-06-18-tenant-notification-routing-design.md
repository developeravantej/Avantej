# Tenant Notification Routing — Design

**Date:** 2026-06-18
**Branch (target):** `feat/tenant-email-resend` (continues the Resend transactional-email work)
**Status:** Design — awaiting review

---

## 1. Goal

Let a tenant decide, per notification type, **which sending-address alias, from-name, and subject line** their transactional emails use — so a tenant's coaches, customers, and staff all receive mail from the tenant's own verified business domain (e.g. `e2e-demo.zhiyuantech.ai`) with a sensible per-flow sender, instead of the platform sender `onboarding@resend.dev`.

This change also **closes the two known gaps** where tenant-facing email still uses the platform sender (member invitations + customer payment receipts) and brings **all** tenant-facing invite send-sites onto one consistent route.

### Decisions locked in brainstorming
| Question | Decision |
|---|---|
| Which notification types are bindable | **All tenant-facing**: `member_invitation`, `payment_receipt`, `auth_verification`, `auth_password_reset`, `auth_magic_link` |
| Bind to what | **Curated alias** (from `email_domain_aliases`), resolved to its local-part |
| When a type has no binding | **Fall through** the existing chain → `email_domains.defaultLocalPart` → `"support"` (bindings are optional refinements) |
| Per-type customization scope | **Alias + from-name + subject** (subject is a `{token}` template, not static) |

---

## 2. Corrections from codebase verification

These came out of verifying the original design against real code. They **change** the plan and must be reviewed.

1. **`member_invitation` has FOUR send-sites, not two.** The original plan named only `invitations.sendEmail` + the org-plugin path. Two more tenant-facing invite senders exist:
   - `apps/server/src/routes/invitations.routes.ts:61` — REST invite (platform sender).
   - `apps/server/src/services/tenant-provisioning.service.ts:203` — owner-onboarding invite (platform sender; org has no domain at provisioning time → will always platform-fallback).
   **Decision:** wire all four to `sendTenantEmail` + `notificationType:'member_invitation'` for a single consistent sender. Provisioning keeps `allowPlatformFallback:true`; it just falls back today (no domain yet) but becomes correct once a domain exists and stays semantically tagged.

2. **`dispatchAuthEmail` uses `allowPlatformFallback:false`** and runs its own `opts.fallback()` — the "all callers keep `true`" assumption was wrong for auth. **Decision:** keep the auth path's existing `false` + explicit-fallback design; just pass the `auth_*` `notificationType` so from-name/subject overrides apply when a verified domain exists. Do **not** blindly flip to `true` and leave `opts.fallback` dead.

3. **The org-plugin invite path builds a narrow `tempDb`** (`better-auth.ts:544`, schema `{organizations, emailDomains, emailLogs}` only — no aliases, no routes). **Decision:** `resolveNotificationRoute` MUST be implemented with **core `db.select()` + `leftJoin`**, never `db.query.<relation>.*`, so it is client-agnostic across all entrypoints (oRPC router, org-plugin temp client, REST, provisioning, auth ad-hoc client). Also register `emailNotificationRoutes` + `emailDomainAliases` in the `tempDb` schema as belt-and-suspenders.

4. **Route resolution splits into two parts** depending on whether a verified domain exists:
   - **Sender-address parts** (alias → local-part) require a verified domain. In the platform-fallback branch (`verified === null`) they are skipped.
   - **`fromNameOverride` + `subjectOverride`** apply in **both** branches (they work on the platform sender too).
   - `notificationType` stays meaningful for logging/observability in both branches.

5. **`aliasId` is a bare uuid** in the upsert input → an admin could bind another org's alias. **Decision:** the upsert handler validates the supplied `aliasId` resolves to an alias whose `email_domain` belongs to `input.organizationId` (mirrors how `addAlias`/`removeAlias` scope via `getEmailDomainById(cpDb,{id,organizationId})`).

6. **Subject-token header injection.** `subjectOverride` is tenant text and token *values* may contain `\r\n`. **Decision:** sanitize **after** interpolation — strip all control chars (`\r \n \t \x00-\x1F`) from the final subject, trim, cap length 255. Apply identically to the caller-supplied fallback subject. Unknown tokens render to empty string (never leave a literal `{amount}` in a live subject).

7. **`email_logs` + the Resend webhook do not carry `notificationType`.** Without it, per-type deliverability is unanswerable and the async webhook upsert can't preserve it. **Decision (in-scope):** add nullable `notification_type` to `email_logs`, thread it through `RecordEmailLogParams`/`recordEmailLog`, set it from `sendTenantEmail`, emit a Resend `{name:'notification_type'}` tag, and read it back in the webhook upsert.

8. **Migration mechanics:** this is a **control-panel** table. The recent control-panel migrations (0019–0035) are **hand-authored plain SQL** (`_journal.json` is stale at 0018; `bun db:generate`/`bun db:migrate` bare scripts are no-ops — only the `:control-panel` variants work). **Decision:** hand-author `0036_email_notification_routes.sql` (plain `CREATE TABLE`, matching 0035 style) + the Drizzle schema `.ts` + barrel export, apply to the live control-panel DB, and run `gen-erd` + `check-drift` locally before the PR (drift-check CI runs against the live DB).

9. **No `Select` primitive is imported** in `email.tsx` today, and `listAliases` is **per-`emailDomainId`**, but the routing panel is **org-scoped**. **Decision:** add one server proc that returns the panel's whole config in one round-trip (routes + the org's verified-domain aliases + domain meta), and import a shadcn `Select` for the type/alias dropdowns.

10. **`comms_templates` already exists** (subject + body_markdown, used by platform bulk DM). **Decision:** `subjectOverride` is an **inline subject-line template only** — unrelated to `comms_templates`, no body templating. Documented to avoid a parallel templating system.

---

## 3. Data model

### 3.1 New table — `email_notification_routes` (control-panel DB)

`packages/db/src/schema/control-panel/email-notification-routes.ts`

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK `defaultRandom()` | |
| `organizationId` | `uuid` NOT NULL → `organizations.id` **ON DELETE CASCADE** | |
| `notificationType` | `text` NOT NULL | one of the 5 types; plain text (house style stores enums as text) |
| `aliasId` | `uuid` NULL → `email_domain_aliases.id` **ON DELETE SET NULL** | nullable; target is a PK = valid FK |
| `fromNameOverride` | `text` NULL | |
| `subjectOverride` | `text` NULL | inline `{token}` subject template |
| `createdAt` | `timestamp` `defaultNow()` NOT NULL | |
| `updatedAt` | `timestamp` `defaultNow()` NOT NULL | |

- **Unique index** `email_notification_routes_org_type_unique_idx` on `(organizationId, notificationType)` — one route per type per org (upsert target).
- Index on `organizationId`.
- `relations()` block (organization, alias) for completeness, but **resolution uses core select**, not relational query.
- Register: `export * from "./email-notification-routes";` in `packages/db/src/schema/control-panel/index.ts`. No `control-panel-schema.ts` edit (it re-exports the barrel).

### 3.2 `email_logs` — add `notification_type`

`ALTER TABLE email_logs ADD COLUMN notification_type text;` (nullable). Add to the Drizzle schema + `RecordEmailLogParams` + the `recordEmailLog` insert.

### 3.3 Migration

`packages/db/src/migrations/control-panel/0036_email_notification_routes.sql` — hand-authored, plain `CREATE TABLE` + `CREATE UNIQUE INDEX` + `CREATE INDEX` + the `email_logs` `ADD COLUMN`. FK actions must match the schema exactly (cascade on org, set null on alias) or drift-check flags an `action_mismatch`.

---

## 4. Resolution semantics (in `sendTenantEmail`)

New params on `SendTenantEmailParams`:
- `notificationType?: NotificationType` — when set, look up the org's route.
- `subjectVars?: Record<string, string>` — token values for the subject template.

**Order of operations inside `sendTenantEmail`:**

1. Resolve the route once: `route = notificationType ? await resolveNotificationRoute(cpDb, organizationId, notificationType) : null`. `resolveNotificationRoute` is a **core select + leftJoin** on `email_domain_aliases`, returning `{ aliasId, aliasLocalPart, fromNameOverride, subjectOverride } | null`.

2. **Local-part** (only when a verified domain exists):
   `params.localPart` → `route.aliasLocalPart` → `params.aliasLabel` (resolved) → `verified.defaultLocalPart` → `"support"`.

3. **From-name** (both branches):
   `params.fromName` → `route.fromNameOverride` → (`verified.fromName` if domain else platform default name).

4. **Subject** (both branches):
   if `route.subjectOverride` → `renderSubject(route.subjectOverride, subjectVars)` → else `params.subject`. Then `sanitizeSubject()` on the result regardless.

5. Tag the Resend send with `organization_id` **and** `notification_type` (when set). Persist `notification_type` on the `email_logs` row.

`renderSubject(template, vars)`: replace each `{key}` with `vars[key] ?? ""`; leave nothing literal. `sanitizeSubject(s)`: strip `\r \n \t` and `\x00-\x1F`, collapse whitespace, trim, slice(0,255).

---

## 5. Subject token vocabulary (per type)

Naive `{key}` substitution; callers pass `subjectVars`. Documented in code + under the UI subject input.

| type | tokens | default subject (fallback when no override) |
|---|---|---|
| `member_invitation` | `{organizationName}`, `{role}`, `{inviterName}` | existing invitation subject |
| `payment_receipt` | `{amount}`, `{appointmentId}` | `Payment receipt — {amount}` |
| `auth_verification` | `{appName}` | existing verify subject |
| `auth_password_reset` | `{appName}` | existing reset subject |
| `auth_magic_link` | `{appName}` | existing magic-link subject |

---

## 6. Service layer

New `packages/services/src/notification-route.service.ts` (mirrors `email-domain.service.ts`: pure fns, cpDb-first arg, no env/DB instantiation):

- `export type NotificationType = 'member_invitation' | 'payment_receipt' | 'auth_verification' | 'auth_password_reset' | 'auth_magic_link'` (+ a `NOTIFICATION_TYPES` array for iteration/zod).
- `resolveNotificationRoute(cpDb, organizationId, notificationType)` → core `select().from(routes).leftJoin(aliases).where(and(eq(org), eq(type))).limit(1)` → `{ aliasId, aliasLocalPart, fromNameOverride, subjectOverride } | null`.
- `listNotificationRoutes(cpDb, organizationId)` → all rows for the org (+ joined alias local-part/label).
- `upsertNotificationRoute(cpDb, { organizationId, notificationType, aliasId, fromNameOverride, subjectOverride })` → `insert().onConflictDoUpdate({ target: [organizationId, notificationType], set: {...} })` (atomic; backed by the unique index — handles the concurrent-save race).
- `deleteNotificationRoute(cpDb, { organizationId, notificationType })` → reset to defaults.
- Subject helpers (`renderSubject`, `sanitizeSubject`) live in the **send layer** (`email-send-tenant.ts` or a small pure module it imports) since that's where from-address resolution already lives — not in the CRUD service.

Importable as `@avantej-core/services/notification-route.service` (the `./*` export map; no index edit needed).

---

## 7. oRPC procedures (added to `emailDomainsRouter`)

Added to `apps/server/src/routers/email-domains.ts` (reuses the existing email-admin router; client paths become `client.emailDomains.*`). Every handler replicates the existing 3-step gate: session check → `getControlPanelDb(context)` → `requireOrgAdmin(cpDb, userId, organizationId)`.

- `getNotificationRouting({ organizationId })` → `{ routes: RouteRow[], aliases: AliasOption[], verifiedDomain: {domain, fromName, defaultLocalPart} | null }` — one round-trip for the panel. `aliases` is the org's verified-domain alias list (resolve domain → `listAliases`).
- `upsertNotificationRoute({ organizationId, notificationType, aliasId?, fromNameOverride?, subjectOverride? })`:
  - zod: `notificationType: z.enum(NOTIFICATION_TYPES)`, `aliasId: z.string().uuid().nullable().optional()`, `fromNameOverride: z.string().min(1).max(100).nullable().optional()`, `subjectOverride: z.string().max(255).nullable().optional()` (`.nullable().optional()` distinguishes "clear" vs "leave unchanged").
  - **alias-ownership check**: if `aliasId` set, confirm it belongs to the org's domain → else `BAD_REQUEST`.
  - optional **write-time validation**: reject `subjectOverride` containing tokens outside the type's vocabulary (nicer UX than silent empty render).
  - best-effort audit (action `email_route.changed`) after success.
- `deleteNotificationRoute({ organizationId, notificationType })` → reset; audit.

**No rate-limit guard** (config upsert, not a paid Resend call).

**Audit:** add `email_route.changed` to the canonical action vocabulary in `audit-log.service.ts` (info severity — not in DANGER/WARNING sets). Generalize the best-effort audit helper so `entityType` can be `"email_notification_route"` (currently hardcoded `"email_domain"`); it must still **never throw** and skip with `console.warn` when `tenantDb`/`member`/`session` are missing.

---

## 8. Send-site wiring (closes the gaps)

| # | site | today | change |
|---|---|---|---|
| 1 | `routers/invitations.ts:83` (oRPC `sendEmail`) | platform `sendInvitationEmail` | destructure `context`, `getControlPanelDb(context)`, build via `renderInvitationEmail`, call `sendTenantEmail(cpDb, { organizationId: input.organizationId, notificationType:'member_invitation', subjectVars:{organizationName, role, inviterName}, allowPlatformFallback:true })` |
| 2 | `routes/invitations.routes.ts:61` (REST) | platform | same re-wire, for parity |
| 3 | `services/tenant-provisioning.service.ts:203` | platform | re-wire + `member_invitation`; platform-fallback at provisioning (no domain) is expected |
| 4 | `lib/better-auth.ts:569` (org-plugin) | already `sendTenantEmail` | add `notificationType:'member_invitation'` + `subjectVars`; register new tables in `tempDb` schema |
| 5 | `services/payment-side-effects.service.ts:263` | platform `sendEmail` | `sendTenantEmail(controlPanelDb, { organizationId, notificationType:'payment_receipt', subjectVars:{amount, appointmentId}, allowPlatformFallback:true })` — all 3 handles already direct params; keep best-effort try/catch |
| 6 | `lib/better-auth.ts` `dispatchAuthEmail` | `sendTenantEmail({allowPlatformFallback:false})` + own fallback | thread `auth_verification`/`auth_password_reset`/`auth_magic_link`; **keep** `false`+`opts.fallback`; overrides still apply when a domain exists |

`sendTest` (`email-domains.ts:453`) stays **without** a `notificationType` — diagnostic, not a notification.

---

## 9. UI — "Notification routing" panel

New top-level admin card in `apps/web/.../settings/email.tsx`, third sibling in the `mt-6 space-y-6` stack after `DomainListCard` + `CreateDomainCard`. Receives `organizationId` + `isAdmin`.

- One data fetch: `useQuery([NOTIFICATION_ROUTES_QUERY_KEY_PREFIX, organizationId], () => client.emailDomains.getNotificationRouting({organizationId}))`.
- **One row per fixed notification type** (5 rows, human-friendly labels) — upsert semantics, not a free add-form. Each row:
  - **Alias** `Select` (options = org's verified-domain aliases; first option "Use domain default" → `aliasId=null`).
  - **From-name** `Input` (override, optional).
  - **Subject** `Input` (override template, optional) with a token hint listing that type's `{tokens}`.
  - **"Will send as"** live preview (font-mono muted, mirrors `EditSenderDialog`): effective local-part (selected alias → default → `"support"`) + effective from-name, plus raw subject template.
  - **Save** per row → `client.emailDomains.upsertNotificationRoute`. **Reset** → `deleteNotificationRoute`. `useApiMutation` with `successMessage`/`errorMessage` + `invalidate:[[PREFIX, organizationId]]`.
- All controls gated `disabled={!isAdmin || mutation.isPending}`; non-admin sees the existing helper-note style.
- When a row's `aliasId` is null but the org has a verified domain, show a subtle "falls back to default sender" hint (makes the dangling-after-reregistration state observable).
- Import a shadcn `Select` (confirm `@/components/ui/select` exists; add if missing) + a module-level zod schema for the row form (TanStack Form, matching the file's other forms).
- Forms use **TanStack Form** (house convention in this file); no controlled-`useState` field values.

---

## 10. Testing

- **Unit** (`notification-route.service` + send helpers): `resolveNotificationRoute` join shape; `renderSubject` (known/unknown/missing tokens); `sanitizeSubject` (CRLF in template AND in a token value → stripped; length cap); resolution order incl. fallback branch applying overrides but not local-part.
- **Integration**: route CRUD (upsert/onConflict, delete/reset, alias-ownership rejection, admin gate); `sendTenantEmail` with `notificationType` picks the bound alias/from-name/subject; `email_logs.notification_type` persisted; webhook upsert preserves `notification_type` from the tag.
- **e2e screencast**: admin opens routing panel → binds `payment_receipt` to the `billing` alias + a from-name + subject override → sees "Will send as" preview → save → reload shows persisted. (Same chrome-devtools screencast approach as the existing 8 email e2e tests.)

---

## 11. Non-goals / out of scope

- Body templating (subject-line only; `comms_templates` is unrelated).
- Per-recipient subject personalization (tokens resolved once per send; all wired types are single-recipient).
- Tenant-defined custom notification types (catalog is a fixed code-owned enum).
- Multi-org auth disambiguation: `dispatchAuthEmail` keeps "earliest active membership" org resolution; documented as accepted. Magic-link sign-up (no membership yet) never applies a tenant auth route → platform sender.
- Rate-limiting route upserts.

---

## 12. Risks accepted

- Auth emails for multi-org users resolve to the earliest-joined org's domain (Better-Auth callbacks have no session/org context). Accepted.
- Provisioning invite always platform-falls-back today (no domain at provisioning). Accepted; becomes correct automatically once a domain is verified.
- After domain re-registration, a route's `aliasId` nulls (SET NULL) and silently falls back; mitigated by the UI "falls back to default" hint, not by hard error.
