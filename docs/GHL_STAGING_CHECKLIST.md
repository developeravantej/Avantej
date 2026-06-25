# GoHighLevel (GHL) Integration — Staging Readiness Checklist

Status (2026-06-22): integration is **feature-complete in code**. What remains for
staging is **configuration + provisioning + verification** — no feature work.

The integration has three surfaces:

- **Outbound** (Avantej → GHL): branch sync, staff sync, customer sync.
- **Inbound** (GHL → Avantej): webhook at `POST /webhooks/gohighlevel/:locationId`.
- **Manual oRPC** procedures: connect/disconnect/retry from the settings UI.

---

## 1. Secrets & env vars to set on the staging Worker

Secrets go through `wrangler secret put` (never `vars` in `wrangler.jsonc` — those
are dashboard-visible).

| Key | Required? | Purpose | If missing |
|---|---|---|---|
| `GHL_AGENCY_ID` | Required for **staff sync** | GHL `companyId` for `POST /users/` | Staff/profile sync **silently disabled**. The Worker now logs a one-time `[ghl] GHL_AGENCY_ID is not set …` warning (see `db.middleware.ts`). Branch sync + inbound webhooks unaffected. |
| `ENCRYPTION_KEY` | Required | Decrypts per-tenant GHL API keys (64 hex chars) | Tenant DB + GHL key decryption fails |
| `DATABASE_URL` | Required | Control-panel DB | App won't boot |

Optional overrides (have safe hardcoded defaults — only set to target a sandbox):
`GHL_BASE_URL` (`https://services.leadconnectorhq.com`), `GHL_API_VERSION`
(`2021-07-28`), `GHL_PLACEHOLDER_EMAIL_DOMAIN` (`ghl.placeholder`).

**Do NOT set `MOCK_GHL=1` on staging.** Mock mode is guarded off whenever
`NODE_ENV==="production"` (wrangler sets that), but confirm it is unset anyway.

```bash
cd apps/server
wrangler secret put GHL_AGENCY_ID    # paste the agency companyId
wrangler secret put ENCRYPTION_KEY   # if not already set for the env
```

---

## 2. Per-tenant provisioning (one-time, via UI/oRPC — not a deploy step)

Each org connects GHL through the settings UI, which calls these procedures:

- **Org-shared model** (recommended): `ghl.connectOrgShared({ organizationId, ghlLocationId, ghlApiKey })`
  → validates the key, idempotently bootstraps custom fields (gender, emergency
  contact, medical notes, credit points, internal notes), encrypts + stores the key.
- **Legacy per-branch model**: `ghl.connectBranch({ organizationId, tenantBranchId, ghlLocationId, ghlApiKey })`.

Then in the **GHL dashboard**, register the inbound webhook:

- URL: `https://<staging-worker>/webhooks/gohighlevel/<ghlLocationId>`
- Set the webhook secret to match `ghl_branch_links.webhook_secret` for that location
  (the connect flow can pre-share it; otherwise set both sides to the same value).

---

## 3. How to test

### Tier 1 — Unit (fast, mocked, CI-runnable)

```bash
cd apps/server
bun test src/services/ghl/ src/services/gohighlevel.service.test.ts
```

160 tests cover the HTTP client, payload builders, staff/branch/customer sync,
signature verification (`verifyGhlWebhookAuth`), alpha-canonical skip logic,
placeholder/email helpers, DOB derivation, branch-name matching, and primary-staff
name matching.

### Tier 2 — Outbound smoke (real GHL sandbox, or offline mock)

Proves Avantej can authenticate + write to a real GHL location.

```bash
cd apps/server
# offline self-test (no creds, no network):
MOCK_GHL=1 NODE_ENV=development bun run scripts/ghl-smoke-outbound.ts --with-staff

# live against a THROWAWAY sandbox location:
GHL_SMOKE_LOCATION_ID=<loc> GHL_SMOKE_API_KEY=<key> GHL_AGENCY_ID=<companyId> \
  bun run scripts/ghl-smoke-outbound.ts --with-staff
```

Steps: validate API key → ensure custom fields → create/read/delete a throwaway
contact → (with `--with-staff`) create/delete a GHL user. Cleans up after itself.

### Tier 3 — Inbound smoke (real route + real DB)

The runnable equivalent of the request→DB integration test. Needs the target
server **running** and DB reachable (local: `bun dev:server`).

```bash
cd apps/server
# negative-only (safe, creates no records — just proves route + signature gate):
GHL_SMOKE_BRANCH_NODE_ID=<branchNodeId> bun run scripts/ghl-smoke-inbound.ts

# full create round-trip (creates + cleans up records in the target tenant):
GHL_SMOKE_BRANCH_NODE_ID=<branchNodeId> bun run scripts/ghl-smoke-inbound.ts --create

# point at staging:
GHL_SMOKE_BASE_URL=https://<worker> GHL_SMOKE_BRANCH_NODE_ID=<id> \
  bun run scripts/ghl-smoke-inbound.ts --create
```

`GHL_SMOKE_BRANCH_NODE_ID` must be a real `type='branch'` hierarchy node in the
tenant. The `--create` path uses a **phone-only** contact so the webhook
synthesizes a placeholder email and dispatches **no** magic-link email; created
records are deleted afterward (residue is reported if any).

### Tier 4 — Manual end-to-end against real GHL (the real proof)

1. Connect a sandbox location (step 2).
2. Outbound: create a staff member + a customer in Avantej → confirm a GHL User
   and a GHL Contact (tags `customer:active`, source `Avantej Sync`) appear.
3. Inbound: submit a GHL form / fire a GHL test webhook → confirm an Avantej
   `members.role='client'` is created and `primary_staff` resolves.
4. Inspect via the authed debug endpoints (browser, logged in):
   - `GET /webhooks/gohighlevel/<locationId>/events`
   - `GET /webhooks/gohighlevel/<locationId>/links`
5. Force a failure → exercise `ghl.retryGhlSync` / `ghl.retryFailedSyncs`.

---

## 4. Known gaps (non-blocking for staging)

- **`sync-customer.ts:92` TODO(phase-g):** in org-shared mode, non-branch custom
  fields (gender, emergency contact, …) are passed through from the caller rather
  than auto-resolved per location. No regression on the legacy per-branch path.
- **No GHL cron jobs.** Inbound is push-driven; there is no periodic re-sync /
  recovery / stale-link cleanup job. Fine for v1.
- **No integration test in CI** for the `processGhlWebhook` orchestrator — covered
  instead by the Tier-3 inbound smoke (runnable, not CI-gated).
