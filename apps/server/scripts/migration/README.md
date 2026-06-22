# Legacy → Avantej Onboarding Migration

Reusable, config-driven ETL for migrating a gym client's legacy data into an
Avantej tenant Neon branch. Built to run **once per client** — each client is a
manifest, not new code.

Scale: **Small (<50k)** today; the architecture scales to Large by swapping the
write strategy. See `zplan/sheet-schema-gap/` (`MIGRATION-STRATEGY.md`,
`DECISIONS-AND-GAPS.md`) for the full plan, locked decisions, and blockers.

## Architecture

```
adapters/clients/<slug>/manifest.ts   per-client: column/value maps, transforms
        │  (+ adapters/xlsx.ts, transforms.ts)
        ▼
core/canonical.ts                     STABLE contract (Avantej-shaped DTOs)
        ▼
core/loaders/*.ts                     consume canonical → write tenant DB
        │  via core/writer.ts          BatchInsert (now) | CopyStaging (seam)
        ▼
core/crosswalk.ts + core/reconcile.ts  idempotency + sign-off gate
        ▲
engine/run.ts                         orchestrates: adapt → load → reconcile
```

Adding a client = write `adapters/clients/<slug>/manifest.ts`. Loaders never change.
A Large client = add a `CopyStagingWriter`; loaders never change.

## Status

| Stage | File | State |
|-------|------|-------|
| canonical contract | `core/canonical.ts` | ✅ (Branch; rest added per phase) |
| xlsx adapter (fidelity-safe) | `adapters/xlsx.ts` | ✅ |
| transforms | `adapters/transforms.ts` | ✅ |
| crosswalk (source_system-aware) | `core/crosswalk.ts` | ✅ |
| writer (BatchInsert) | `core/writer.ts` | ✅ |
| reconcile | `core/reconcile.ts` | ✅ (counts; financial tie-outs per phase) |
| bootstrap (org root) | `core/loaders/00-bootstrap.ts` | ✅ |
| location → hierarchy tree (+ branch-manager 2nd pass) | `core/loaders/01-location.ts` | ✅ |
| staff → users + org-members + members (+ profiles) | `core/loaders/02-staff.ts` | ✅ |
| product → services (PT packages) | `core/loaders/03-product.ts` | ✅ |
| client → users + members + customer_profiles | `core/loaders/04-client.ts` | ✅ |
| appointment → appointments | `core/loaders/07-appointment.ts` | ✅ (client links blocked by source key mismatch) |
| sales → orders + items + payments + commission | — | ⛔ blocked: commission amounts + multi-currency |
| client package → package_instances | — | ⛔ blocked: serviceId (blank product_id + sales) |
| redemption → coach_session_claims | — | ⛔ blocked: new table needed |

## Run (from apps/server)

```bash
# DRY RUN (rolls back) — default org + client, uses ./adapters/clients/pt-franchise/data/source.xlsx
bun run scripts/migration/engine/run.ts

bun run scripts/migration/engine/run.ts --org <slug> --client pt-franchise
bun run scripts/migration/engine/run.ts --file /path/to/workbook.xlsx
bun run scripts/migration/engine/run.ts --org <slug> --commit   # WRITE — only after a clean dry-run
```

Dry-run is the **default**: the load runs in one transaction and rolls back
unless `--commit`. Iterate on a **throwaway Neon branch** until reconciliation
passes, then commit against the real branch.

## Onboarding a new client

1. `mkdir adapters/clients/<slug>` and write `manifest.ts` (copy pt-franchise).
2. Drop their workbook at `adapters/clients/<slug>/data/source.xlsx` (gitignored).
3. `bun run scripts/migration/engine/run.ts --org <tenant-slug> --client <slug>` (dry-run).
4. Fix mappings until reconciliation passes → `--commit`.

## Prerequisites

- `apps/server/.dev.vars` with `DATABASE_URL` (control-panel) — auto-loaded.
- Target tenant already **provisioned** (Neon branch + org-root node). Migration
  fails loudly if the root node is missing.
- Client source data is **gitignored** — never committed.

## Known gaps (flagged by loaders / strategy doc)

- `migrations-proposed/0095_branch_details_migration_fields.sql` — extended
  branch columns (tiers, status, codes, dates). Confirm with client, then promote
  per `docs/TENANT_MIGRATION_WORKFLOW.md`.
- `redemption` needs a new `coach_session_claims` table.
- **Multi-currency hardening** (payments.currency default, per-currency payout
  batches, per-country tax) is a precondition for correct money loads.
- **Sales-commission amounts** absent from source — blocked pending client rules
  or a separate export (coach session payouts OK via `redemption.claim_amount`).
