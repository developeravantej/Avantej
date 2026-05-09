# GoHighLevel ↔ Avantej Core Sync — Design

**Status:** Draft for review
**Date:** 2026-04-30
**Branch:** `chore/merge-phase-5` (or successor)
**Author:** Claude (brainstorming session with user)

## Goal

Bidirectional sync between Avantej Core and GoHighLevel (GHL) so that:

1. **Outbound (new):** Customer + staff CRUD in Avantej mirrors to the corresponding GHL location (Contacts for customers, Users for staff).
2. **Inbound (extend existing):** GHL form-submission webhooks create new customers in Avantej. Updates/deletes from GHL on existing customers are **ignored** (Avantej is canonical).

**Out of scope (this spec):** appointments, opportunities, tags, conversations, campaigns, workflows. May be future iterations once the customer/staff baseline is solid.

## Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| Source of truth | **Avantej** (strict canonical) | Avoids ambiguity. Inbound webhook events that update existing customers are ignored. |
| GHL resource for customers | **Contacts** | Customers are CRM leads/clients, not staff. GHL forms create Contacts. Existing schema already aligned (`ghl_contact_links → customer_profiles`). |
| GHL resource for staff | **Users** | Staff (admin/trainer/receptionist) log in to GHL to operate the CRM at their branch. |
| GHL location granularity | **One GHL location per Avantej branch** (Option X) | Each branch is operationally independent; matches "same customer at 2 branches = 2 separate Contact records" rule. |
| Sync trigger | **Inline on every CRUD** | User asked for Option 1 (synchronous). DB write happens first, then GHL call. |
| Failure mode on GHL error after Avantej write | **Mode B — succeed with warning, mark sync_status='error', retry UI** | Consistent with "Avantej canonical": Avantej write must succeed even if GHL is down. |
| Authentication to GHL | **Per-branch Private Integration API key, manually generated and pasted** (now); migration path to **agency-level OAuth** later | User cannot get agency-level credentials yet. Manual paste works at low scale; same data model supports OAuth later with no schema rework. |
| Inbound webhook for existing contacts | **α strict canonical — ignore `ContactUpdate` / `ContactDelete` for existing rows** | Only honor webhooks that create NEW customers (form submissions). Existing customers are not modified by GHL. |
| Cardinality (same person at multiple branches) | **One GHL Contact per branch** (per user's earlier answer) | A customer at MOVE Kuala Lumpur and MOVE Sabah is two separate GHL Contacts in two separate locations. |

## Data model — current state

### Avantej (relevant tables)

```
control-panel
├── organizations            (tenant boundary; one per franchisee)
├── user                     (auth identity; better-auth)
└── ghl_location_links       (existing; will be renamed)
    └── locationId, organizationId, webhookSecret, isActive

tenant (one Neon DB per organization)
├── hierarchy_nodes          (5-level tree: organization → country → region → area → branch)
├── members                  (org membership; role in {admin, staff, trainer, client})
│      └── hierarchy_scope_id → hierarchy_nodes.id (which branch)
├── customer_profiles        (extension: phone, dob, fitness_goals, medical_notes, ...)
│      └── user_id → control-panel user.id (cross-DB)
├── ghl_contact_links        (existing; will get 3 new columns)
│      └── ghl_contact_id, customer_profile_id, sync_status, last_synced_at
└── ghl_sync_events          (existing; webhook event log; no changes)
```

### GHL (target shape)

```
Avantej Agency (you, Avantej)
└── Sub-account / Location (per Avantej branch)
    ├── Contacts             (per customer at this branch)
    └── Users                (per staff at this branch)
```

## Schema changes

Three changes total, all forward-only.

### CHANGE 1 (control panel): rename `ghl_location_links` → `ghl_branch_links`

```
ghl_branch_links                                       ← renamed
─────────────────────────────────────────────────────
id                  uuid PK
organization_id     uuid NOT NULL → organizations(id) ON DELETE CASCADE
tenant_branch_id    uuid NOT NULL                       ← NEW
                       (cross-DB ref to hierarchy_nodes.id where type='branch';
                        no FK constraint)
ghl_location_id     text NOT NULL                       ← renamed from location_id
ghl_api_key         text NOT NULL (encrypted)           ← NEW
                       (Private Integration API key from this branch's GHL location)
webhook_secret      text (encrypted)                    ← keep, encrypt on write
is_active           boolean NOT NULL default true
created_at          timestamp NOT NULL default now()
updated_at          timestamp NOT NULL default now()

UNIQUE (organization_id, tenant_branch_id)
UNIQUE (ghl_location_id)
INDEX  (organization_id)
INDEX  (tenant_branch_id)
INDEX  (is_active)
```

Encryption uses the same `ENCRYPTION_KEY` (AES-256-GCM) pattern as `organizations.connection_string`.

### CHANGE 2 (tenant): extend `ghl_contact_links` with 3 columns

```
ghl_contact_links                                  ← existing, add 3 columns
──────────────────────────────────────────────────
id                   uuid PK
ghl_contact_id       text NOT NULL UNIQUE
user_id              text NOT NULL
customer_profile_id  uuid → customer_profiles(id) ON DELETE SET NULL
branch_node_id       uuid NOT NULL                  ← NEW
                        (the branch this customer belongs to; matches
                         members.hierarchy_scope_id; cross-DB no FK)
ghl_location_id      text NOT NULL                  ← NEW (denormalized)
last_error           text                           ← NEW (last GHL sync error)
sync_status          text NOT NULL default 'active'
last_synced_at       timestamp
created_at, updated_at

UNIQUE (ghl_contact_id)                             ← keep (each GHL Contact maps to one row)
UNIQUE (customer_profile_id, branch_node_id)        ← NEW: same customer at multiple branches → multiple rows
INDEX  (branch_node_id)
INDEX  (ghl_location_id)
INDEX  (sync_status, last_synced_at)
```

Both unique constraints hold simultaneously: a GHL Contact ID is globally unique within the agency, AND a (customer, branch) pair maps to at most one Contact (since a customer at one branch has exactly one Contact in that branch's GHL location).

### CHANGE 3 (tenant): NEW table `ghl_user_links`

Mirror of `ghl_contact_links` for staff sync.

```
ghl_user_links
──────────────────────────────────────────
id                  uuid PK
ghl_user_id         text NOT NULL UNIQUE
user_id             text NOT NULL
member_id           uuid NOT NULL
branch_node_id      uuid NOT NULL
ghl_location_id     text NOT NULL
last_error          text
sync_status         text NOT NULL default 'active'
last_synced_at      timestamp
created_at, updated_at

UNIQUE (member_id, branch_node_id)
INDEX  (branch_node_id)
INDEX  (ghl_location_id)
INDEX  (sync_status, last_synced_at)
```

### NOT changing

| Table | Why |
|---|---|
| `customer_profiles` | `is_deleted` + `deleted_source` already cover loop-prevention for the delete edge case. With strict-canonical inbound, no other columns needed. |
| `members` | No new sync-tracking columns needed; `ghl_user_links` carries the sync state. |
| `ghl_sync_events` | Already correct shape for inbound observability. |

## Migration plan (the safe order)

### How migrations work in this codebase (background)

There are two migration runners:

1. **Drizzle CLI** — used by developers via `drizzle-kit migrate --config=<config>`.
   - `drizzle.control-panel.config.ts` reads `control-panel-schema.ts`, writes to `migrations/control-panel/`, applies to `DATABASE_URL`.
   - `drizzle.tenant.config.ts` reads `tenant-schema.ts`, writes to `migrations/tenant/`, applies to `TENANT_DATABASE_URL`.
   - **Each config is strictly bound to its schema and target URL.** A control-panel migration cannot be applied to a tenant DB or vice versa.
2. **Runtime tenant migrator** — `runTenantMigrations(connectionString)` in `packages/db/src/migrate-tenant.ts`.
   - Embeds tenant migration SQL inline as TypeScript constants in a `TENANT_MIGRATIONS` array.
   - Called automatically when a NEW tenant is provisioned (Cloudflare Workers cannot read the filesystem, so migrations are bundled into the build).
   - Every new tenant migration MUST be added to this array, in addition to being generated as a `.sql` file on disk for dev verification.

There is also a **legacy** `drizzle.config.ts` that points at the parent `./src/schema` directory (which contains BOTH control-panel and tenant subdirs). Running `drizzle-kit push`/`generate`/`migrate` without an explicit `--config=` flag falls through to this legacy config and would generate a mixed-schema diff against `DATABASE_URL` — a footgun. Step 10 (hygiene) below removes the bare scripts that resolve to this config.

### Step-by-step

| # | Action | Files | Verification |
|---|---|---|---|
| 1 | Edit control-panel schema: rename file `ghl-location-links.ts` → `ghl-branch-links.ts`; rename export `ghlLocationLinks` → `ghlBranchLinks`; add `tenant_branch_id`, `ghl_api_key`; rename `location_id` → `ghl_location_id`. Update `index.ts` re-exports. | `packages/db/src/schema/control-panel/{ghl-branch-links.ts, index.ts}` | `bun check-types` |
| 2 | Generate control-panel migration | `cd packages/db && drizzle-kit generate --config=drizzle.control-panel.config.ts --name=rename_ghl_links_per_branch` | new SQL file in `migrations/control-panel/` |
| 3 | Apply control-panel migration | `drizzle-kit migrate --config=drizzle.control-panel.config.ts` | query `DATABASE_URL`, table is renamed |
| 4 | Edit tenant schema: extend `ghl-contact-links.ts` (3 new columns), create `ghl-user-links.ts`. Update `tenant-schema.ts` + `tenant/index.ts` re-exports. | `packages/db/src/schema/tenant/{ghl-contact-links.ts, ghl-user-links.ts, index.ts}`, `tenant-schema.ts` | `bun check-types` |
| 5 | Generate tenant migration | `cd packages/db && drizzle-kit generate --config=drizzle.tenant.config.ts --name=ghl_per_branch_sync` | new SQL file in `migrations/tenant/00XX_*.sql` |
| 6 | Apply to dev tenant DB | `drizzle-kit migrate --config=drizzle.tenant.config.ts` | query `TENANT_DATABASE_URL`, columns + table exist |
| 7 | **Embed the new tenant migration into `migrate-tenant.ts` `TENANT_MIGRATIONS` array** | `packages/db/src/migrate-tenant.ts` (add new `MIGRATION_00XX_GHL_PER_BRANCH_SYNC` constant + entry) | `bun test` integration tests still pass; new tenant provisioning includes this migration |
| 8 | Add a new entry to `apps/server/scripts/run-tenant-migrations.ts` `MIGRATIONS` map (or add to `migrate-all-tenants.ts` map) | tenant scripts | dry-run with `--list` |
| 9 | Apply to all existing production tenants | `bun packages/db/src/scripts/migrate-all-tenants.ts ghl-per-branch-sync` | each tenant DB has new shape |
| 10 | **Hygiene:** update `packages/db/package.json` to require explicit `--config=` flags (remove bare `db:push`/`db:generate`/`db:migrate` from the legacy `drizzle.config.ts`) | `packages/db/package.json` | npm scripts no longer point at legacy mixed config |

The order matters: control-panel first (so `ghl_api_key` column exists before any code reads it), then tenant schema, then code that depends on both. Step 7 is critical — without it, NEW tenants provisioned after this commit will not get the migrations and customer sync will fail.

### Why migrations cannot leak across DBs

| Risk | Mitigation |
|---|---|
| `drizzle-kit migrate --config=drizzle.control-panel.config.ts` somehow applies tenant tables | Cannot — that config's `schema:` only points at `control-panel-schema.ts`, which doesn't import or re-export any tenant tables. The diff Drizzle generates is bounded by what its schema file knows. |
| `drizzle-kit migrate --config=drizzle.tenant.config.ts` somehow applies control-panel tables | Same — `tenant-schema.ts` only re-exports tenant tables. |
| Someone runs the legacy `drizzle.config.ts` (which DOES point at the parent `./src/schema` directory and would mix both) | Step 10 (hygiene) removes the bare `db:push` script that resolves to the legacy config. Documented as a footgun in the migration plan. |
| Tenant migration is generated but not embedded in `migrate-tenant.ts` inline array | Integration test for new-tenant provisioning will fail if the new schema isn't applied to a freshly-provisioned Neon project. Tests gate the merge. |

## Authentication: per-branch Private Integration API key

### Onboarding flow per branch

```
[Avantej admin or franchisee owner creates new branch in Avantej UI]
   │
   ▼
[Avantej shows "Connect GHL" panel for the branch]
   │
   ▼
[Manual: someone with GHL agency access creates a sub-account / location
 for this branch (or uses an existing GHL location).
 — Without agency-level credentials, only the franchisee owner who has
   GHL admin access can do this. Avantej team can do it on the franchisee's
   behalf only if the franchisee shares GHL access.]
   │
   ▼
[Manual: in that GHL location → Settings → Private Integrations → Create new
 → name "Avantej Sync", select scopes (contacts.read/write/delete,
   users.read/write/delete) → Generate]
   │
   ▼
[GHL returns: API key + Location ID]
   │
   ▼
[User pastes both into Avantej "Connect GHL" form]
   │
   ▼
[Avantej validates: makes a test API call (e.g., GET /locations/{locationId})
 to confirm key works and matches the locationId]
   │
   ▼
[Avantej stores in ghl_branch_links:
   { organization_id, tenant_branch_id, ghl_location_id,
     ghl_api_key (encrypted), is_active=true }]
   │
   ▼
[Done — outbound sync now active for this branch]
```

### Required GHL Private Integration scopes

For Contacts:
- `contacts.read`
- `contacts.write`
- `contacts.delete` (or use a soft-delete via custom field if delete scope is unavailable)

For Users:
- `users.read`
- `users.write`
- `users.delete`

For webhook validation (if not already configured):
- `locations.read` (to validate API key on first save)

### Migration to OAuth later (no rework)

When the agency-level credentials become available, the only change is in the credential acquisition flow:

- Replace the manual paste step with an OAuth callback route (`/auth/ghl/callback`)
- Store `access_token`, `refresh_token`, `token_expires_at` instead of (or alongside) `ghl_api_key`
- Add a token-refresh middleware before each outbound call
- Schema additions: `ghl_branch_links.access_token`, `refresh_token`, `token_expires_at` (additive, doesn't break the API key path)

The data shape (one row per branch, encrypted credentials) and the outbound call sites stay the same.

## Outbound sync flow (Avantej → GHL)

### Trigger points

Outbound sync is triggered **inline** at the end of every Avantej mutation that touches a synced entity:

| Avantej operation | GHL operation |
|---|---|
| Create `customer_profiles` row + `members` row with `role='client'` | `POST /contacts/` → store `ghl_contact_id` in `ghl_contact_links` |
| Update `customer_profiles` columns OR `user` columns (name/email) for a synced customer | `PUT /contacts/{ghl_contact_id}/` |
| Update `members.status` to 'inactive' (deactivate) for a customer | `PUT /contacts/{ghl_contact_id}/` with tag `customer:inactive` |
| Set `customer_profiles.is_deleted = true` (soft delete) | `DELETE /contacts/{ghl_contact_id}/` |
| Create `members` row with `role IN ('admin','staff','trainer')` | `POST /users/` → store `ghl_user_id` in `ghl_user_links` |
| Update staff member `user.email`, name, or `members.role` | `PUT /users/{ghl_user_id}/` |
| Deactivate staff (`members.status='inactive'`) — `members` has no `is_deleted` column, so deactivation is the soft-delete equivalent | `DELETE /users/{ghl_user_id}/` (or PATCH-permissions to revoke access if delete is unavailable) |

### Outbound flow detail (customer create example)

```typescript
async function createCustomer(input, context) {
  // 1. Avantej DB write (transactional, succeeds first)
  const { user, profile, member } = await tenantDb.transaction(async (tx) => {
    const u = await controlPanelDb.insert(users)...
    const p = await tx.insert(customerProfiles)...
    const m = await tx.insert(members)...{ role: 'client', hierarchy_scope_id: input.branchNodeId }
    return { user: u, profile: p, member: m };
  });

  // 2. Look up GHL credentials for this branch
  const link = await controlPanelDb.query.ghlBranchLinks.findFirst({
    where: and(
      eq(ghlBranchLinks.organization_id, context.organizationId),
      eq(ghlBranchLinks.tenant_branch_id, input.branchNodeId),
      eq(ghlBranchLinks.is_active, true),
    ),
  });
  if (!link) {
    // Branch not connected to GHL — that's OK, just return successfully
    return { user, profile, member };
  }

  // 3. Outbound sync (best-effort, with timeout)
  try {
    const ghlContact = await ghlApi.contacts.create({
      apiKey: decrypt(link.ghl_api_key),
      locationId: link.ghl_location_id,
      payload: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: profile.phone,
        dateOfBirth: profile.dateOfBirth?.toISOString().split('T')[0],
        // custom fields for medical_notes, fitness_goals, etc.
        customFields: { ... },
      },
      timeout: 5000,  // 5s deadline
    });

    await tenantDb.insert(ghlContactLinks).values({
      ghl_contact_id: ghlContact.id,
      user_id: user.id,
      customer_profile_id: profile.id,
      branch_node_id: input.branchNodeId,
      ghl_location_id: link.ghl_location_id,
      sync_status: 'active',
      last_synced_at: new Date(),
    });
  } catch (error) {
    // Mode B: log + flag; do NOT fail the request
    await tenantDb.insert(ghlContactLinks).values({
      ghl_contact_id: '',  // placeholder for retry
      user_id: user.id,
      customer_profile_id: profile.id,
      branch_node_id: input.branchNodeId,
      ghl_location_id: link.ghl_location_id,
      sync_status: 'error',
      last_error: error.message,
    });
    logger.warn('GHL outbound sync failed; queued for manual retry', {
      customerId: profile.id, branch: input.branchNodeId, error,
    });
  }

  // 4. Return success regardless of GHL outcome
  return { user, profile, member };
}
```

### Field mapping: Avantej customer → GHL Contact

| Avantej source | GHL Contact field | Type / notes |
|---|---|---|
| `user.firstName` | `firstName` | text |
| `user.lastName` | `lastName` | text |
| `user.email` | `email` | required by GHL |
| `customer_profiles.phone` | `phone` | E.164 if possible |
| `customer_profiles.date_of_birth` | `dateOfBirth` | YYYY-MM-DD string |
| `customer_profiles.gender` | custom field `gender` | requires custom field setup in GHL location |
| `customer_profiles.address` | `address1` | text |
| `customer_profiles.emergency_contact_name` | custom field | text |
| `customer_profiles.emergency_contact_phone` | custom field | text |
| `customer_profiles.medical_notes` | custom field | longtext |
| `customer_profiles.fitness_goals` (array) | tags | one tag per goal: `goal:weight_loss`, `goal:strength` |
| `customer_profiles.credit_points` | custom field | numeric |
| `customer_profiles.notes` | `notes` (or custom field) | text |
| `members.status` | tag `customer:active` / `customer:inactive` | |
| (constant) | `locationId` | from `ghl_branch_links.ghl_location_id` |
| (constant) | `source` | "Avantej Sync" |

### Field mapping: Avantej staff → GHL User

| Avantej source | GHL User field |
|---|---|
| `user.firstName` | `firstName` |
| `user.lastName` | `lastName` |
| `user.email` | `email` (login) |
| `customer_profiles.phone` (if present) OR `user.phone` (if exists) | `phone` |
| `members.role = 'admin'` | role: `admin` |
| `members.role IN ('staff','trainer')` | role: `user` (custom permissions) |
| (constant) | `locationIds: [link.ghl_location_id]` |
| (constant) | `type: "account"` |
| (constant) | `companyId` (your agency) |

### Custom fields setup

GHL custom fields must exist in each location before syncing data into them. Two options:

- **Option I — manual setup** (simpler): document required custom fields (medical_notes, gender, emergency_contact_name, emergency_contact_phone, credit_points) in the onboarding doc. Each franchisee adds them once per location after generating the API key.
- **Option II — programmatic setup** (smoother UX): on first sync to a new location, our code calls `POST /locations/{id}/customFields/` to create any missing custom fields. Idempotent.

**Recommendation:** Option II. Adds one bootstrap call when `ghl_branch_links` is first activated. Documented as part of the onboarding handler.

## Inbound sync flow (GHL → Avantej)

### Existing flow (no changes to webhook routing)

GHL is configured with webhook URL: `https://api.avantej.com/webhooks/gohighlevel/{locationId}`. On contact events, GHL POSTs JSON to that URL.

The existing `webhooks.routes.ts` handler:
1. Looks up `ghl_branch_links` by `ghl_location_id` to find the org + branch
2. Verifies HMAC against `ghl_branch_links.webhook_secret`
3. Calls `processGhlWebhook(...)` in `gohighlevel.service.ts`
4. Records the event in `ghl_sync_events`

### What changes (α strict canonical)

In `processGhlWebhook`, we change the behavior based on event type and whether the contact already exists in Avantej:

```typescript
async function processGhlWebhook(args) {
  const eventType = detectGhlEventType(payload);  // create | update | delete
  const ghlContactId = payload.contactId;

  // Look up existing link
  const existingLink = await tenantDb.query.ghlContactLinks.findFirst({
    where: eq(ghlContactLinks.ghl_contact_id, ghlContactId),
  });

  switch (eventType) {
    case 'create':
      if (existingLink) {
        // Already synced; treat as no-op (de-dup)
        recordSkipped('already-linked');
        return;
      }
      // NEW contact from GHL form submission → upsert into Avantej
      await createAvantejCustomerFromGhl(payload);
      break;

    case 'update':
      if (existingLink) {
        // α STRICT: existing customer; ignore
        recordSkipped('avantej-canonical');
        return;
      }
      // No link yet — treat as create (form submission edited before our sync ran)
      await createAvantejCustomerFromGhl(payload);
      break;

    case 'delete':
      if (existingLink) {
        // α STRICT: ignore deletes from GHL
        recordSkipped('avantej-canonical');
        return;
      }
      recordSkipped('not-found');
      break;
  }
}
```

This preserves the existing form-fill → new-customer flow while explicitly ignoring updates/deletes from GHL on customers Avantej already owns. Skipped events are still recorded in `ghl_sync_events` with status `skipped` for observability.

## Service layer changes

### `apps/server/src/services/gohighlevel.service.ts`

Add the following:

```typescript
// Outbound functions
export async function syncCustomerToGhl(args: {
  organizationId: string;
  branchNodeId: string;
  customerProfile: typeof customerProfiles.$inferSelect;
  user: typeof user.$inferSelect;
  operation: 'create' | 'update' | 'delete';
}): Promise<{ status: 'synced' | 'skipped' | 'error'; ghlContactId?: string; error?: string }>;

export async function syncStaffToGhl(args: {
  organizationId: string;
  branchNodeId: string;
  member: typeof members.$inferSelect;
  user: typeof user.$inferSelect;
  operation: 'create' | 'update' | 'delete';
}): Promise<{ status: 'synced' | 'skipped' | 'error'; ghlUserId?: string; error?: string }>;

// Setup utilities
export async function validateGhlApiKey(apiKey: string, locationId: string): Promise<boolean>;
export async function ensureCustomFieldsExist(args: { apiKey: string; locationId: string }): Promise<void>;

// Existing functions unchanged
// processGhlWebhook(...) — modified per α canonical (above)
```

Internal helpers (private):
- `buildContactPayloadFromAvantej(...)` — field mapping function (testable in isolation)
- `buildUserPayloadFromAvantej(...)` — same for staff
- `callGhlApi(method, path, args, opts)` — HTTP client with timeout, error normalization

### Mutation hook sites (oRPC routers / services)

Each Avantej mutation that touches synced data needs to call the appropriate `syncCustomerToGhl` / `syncStaffToGhl` after the local DB write:

| Service / router | Hook |
|---|---|
| `customer-profile.service.ts` `createCustomer`, `updateCustomer`, `softDeleteCustomer` | `syncCustomerToGhl` after DB write |
| `members.service.ts` `createMember` (when role='client') | `syncCustomerToGhl` |
| `members.service.ts` `createMember` (when role≠client) | `syncStaffToGhl` |
| `members.service.ts` `deactivateMember`, `updateMemberRole` | both, depending on role |
| `users.service.ts` profile updates that change name/email | re-sync via `syncCustomerToGhl` AND/OR `syncStaffToGhl` for all branches the user is in |

Each call is wrapped in try/catch; errors are recorded in `ghl_contact_links.last_error` (or the equivalent `ghl_user_links.last_error`) with `sync_status='error'`. The mutation does NOT fail.

### Web UI (`apps/web/src/routes/_authenticated/go-highlevel-integration.tsx`)

Existing page lists `ghl_location_links` rows. Modifications:

- Show one row **per branch** (not per organization) — list all branches and whether each is connected
- "Connect GHL" button per branch opens a form to paste `ghl_location_id` + `ghl_api_key`
- Show count of customers/staff with `sync_status='error'` per branch with a "Retry sync" action
- "Test connection" button calls `validateGhlApiKey(...)` against GHL `GET /locations/{id}` to confirm credentials still work

## Error handling

### Outbound

| Failure | Behavior |
|---|---|
| Branch not connected (`ghl_branch_links` not found or `is_active=false`) | Skip silently. Avantej write succeeds. |
| GHL API timeout (5s) | Insert/upsert `*_links` row with `sync_status='error'`, `last_error='timeout'`. Avantej write succeeds. |
| GHL 4xx (e.g., bad request, missing custom field) | Insert/upsert `*_links` row with `sync_status='error'`, `last_error=<api error>`. Avantej write succeeds. Surface in admin UI. |
| GHL 5xx (transient) | Same. Manual retry from admin UI. |
| Network failure | Same. |
| Encryption key missing or wrong | Treat as fatal config error; log and surface in admin UI. |

### Inbound

| Event type | Existing link | Behavior |
|---|---|---|
| ContactCreate | none | Create Avantej customer; record `processed` in `ghl_sync_events` |
| ContactCreate | exists | Skip (deduped); record `skipped:already-linked` |
| ContactUpdate | none | Treat as create; record `processed` |
| ContactUpdate | exists | Skip (α canonical); record `skipped:avantej-canonical` |
| ContactDelete | exists | Skip (α canonical); record `skipped:avantej-canonical` |
| ContactDelete | none | Skip; record `skipped:not-found` |
| Webhook HMAC fails | — | 401 response; record `failed:auth` |
| Branch not found | — | 404 response; record `failed:no-link` |

## Testing strategy

### Unit tests

- `buildContactPayloadFromAvantej(...)` — table-driven tests for field mapping (see `apps/server/src/services/__tests__/...`)
- `buildUserPayloadFromAvantej(...)` — same
- `processGhlWebhook(...)` — test α canonical branches: existing/non-existing × create/update/delete (extends existing `gohighlevel.service.test.ts`)

### Integration tests

- `syncCustomerToGhl(...)` happy path — mock GHL HTTP, verify call shape + DB state after
- `syncCustomerToGhl(...)` failure modes — mock 4xx, 5xx, timeout, verify Avantej write succeeds and `sync_status='error'` is set
- New-tenant migration runs all migrations including the new `ghl_per_branch_sync` (extend `apps/server/src/tests/integration/org.test.ts`)
- End-to-end webhook with α canonical: insert existing link, simulate ContactUpdate, assert no DB change + `skipped:avantej-canonical` recorded

### Manual smoke test (one-time, post-deploy)

1. Connect a real GHL location to a dev branch (use API key paste flow)
2. Create a new customer in Avantej UI for that branch
3. Verify Contact appears in GHL with all fields
4. Update customer name in Avantej; verify GHL Contact updates
5. Soft-delete customer in Avantej; verify GHL Contact deleted
6. Submit a GHL form on landing page; verify new customer in Avantej
7. Edit Contact in GHL UI; verify Avantej customer is **NOT** changed (α canonical)
8. Test failure mode: invalidate the API key in GHL; create another customer; verify Avantej write succeeds and `sync_status='error'` shows in admin UI

## Affected files (estimate)

| Area | Files |
|---|---|
| Schema | `packages/db/src/schema/control-panel/{ghl-branch-links.ts, index.ts}`, `packages/db/src/schema/tenant/{ghl-contact-links.ts, ghl-user-links.ts, index.ts}`, `tenant-schema.ts`, `control-panel-schema.ts` |
| Migrations on disk | `packages/db/src/migrations/control-panel/00XX_*.sql`, `packages/db/src/migrations/tenant/00XX_*.sql` |
| Migrations inline (NEW tenant runtime) | `packages/db/src/migrate-tenant.ts` (new constant + entry) |
| Migration scripts | `apps/server/scripts/run-tenant-migrations.ts`, `packages/db/src/scripts/migrate-all-tenants.ts` |
| Service | `apps/server/src/services/gohighlevel.service.ts` (extend), new helper modules if needed |
| Mutation hooks | `apps/server/src/services/customer-profile.service.ts`, `members.service.ts`, possibly `users.service.ts` |
| Webhook | `apps/server/src/routes/webhooks.routes.ts` (minor — pass new context to processor), `apps/server/src/services/gohighlevel.service.ts` `processGhlWebhook` (α canonical logic) |
| Web UI | `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx` |
| Hygiene | `packages/db/package.json` (require `--config=` flags) |
| Tests | extend `gohighlevel.service.test.ts`, new sync tests, integration test for tenant migration shape |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tenant migration generated but not embedded in `migrate-tenant.ts` inline array → new tenants don't get the schema | Step 7 of the migration plan is mandatory; integration test for new-tenant provisioning gates the merge |
| Bare `db:push` from package root accidentally runs legacy mixed config | Step 10 (hygiene) removes the bare scripts |
| Per-branch API key paste error → wrong location ID | `validateGhlApiKey` makes a test call before saving; error if mismatch |
| Per-branch onboarding doesn't scale beyond ~50 branches | Documented; OAuth/agency-level migration path is clean |
| GHL custom fields not set up in a location → outbound sync fails | `ensureCustomFieldsExist` runs once on first activation; documented |
| Loop: Avantej updates → GHL → webhook → Avantej change | α canonical inbound prevents loop; `customer_profiles.deleted_source='ghl'` provides explicit hint when needed |
| Same customer in two branches → two GHL Contacts → name change in one branch only updates that branch | Expected behavior; documented for franchisee admins |
| GHL rate limits | Inline + 5s timeout means rate-limit causes warning, not request failure (Mode B). If rate limits become operational issue, revisit Option 2 (outbox + worker). |

## Out of scope (deferred)

- Bulk import/export of existing data (separate one-time tooling)
- Appointments sync (GHL Calendars API)
- Conversations / SMS sync
- Tags-based segmentation rules
- Workflow triggers
- Migration to OAuth / agency-level credentials (well-defined future work; data model already supports it)
- Performance: outbound sync is inline today; if latency becomes user-facing pain, migrate to outbox pattern (Option 2)

## Open questions / things to confirm during implementation

- Exact GHL Private Integration scopes available for User CRUD — verify against the live GHL admin UI; some scopes may require Agency Pro
- Whether `users.delete` endpoint behaves as soft-delete or hard-delete in GHL — affects re-create semantics if a deactivated staff is reactivated
- GHL custom field types for numeric fields (credit_points) — confirm they accept integers without decimal formatting
- Whether the existing `ghl_sync_events.event_key` dedup mechanism collides with our new event type names — review during webhook handler change

---

*End of design.*
