# Legacy → Avantej Onboarding Migration Pipeline (2026-06-19)

Reusable, config-driven ETL for migrating a gym client's legacy data into an
Avantej tenant Neon branch. **6 of 8 loaders are built, verified live (dry-run),
and reconciling green.** The remaining work is blocked on client data + product
preconditions, not on engineering — hence deferred here.

**Code:** `apps/server/scripts/migration/` (see its `README.md`).
**Planning docs:** `zplan/sheet-schema-gap/` — `MIGRATION-STRATEGY.md`,
`DECISIONS-AND-GAPS.md`, `GAP.md`.
**Client #1:** "pt-franchise" (Malaysian PT franchise, Aoikumo + GHL export,
8-tab workbook). Source xlsx is gitignored under the client's `data/` dir.

## Architecture (do NOT redo)
`adapters/clients/<slug>/manifest.ts` (per-client column/value maps) →
`core/canonical.ts` (stable DTO contract) → `core/loaders/*` →
`core/writer.ts` (BatchInsert now; CopyStaging = documented seam for >500k) →
`core/crosswalk.ts` (idempotency) + `core/reconcile.ts`. Engine
(`engine/run.ts`) is dry-run-by-default (one tx, rolls back unless `--commit`);
cross-DB loaders nest a control-panel tx inside the tenant tx. Reads .xlsx
directly via `exceljs` (`cell.text`) to preserve NRIC/phone/date fidelity.

## Already done + verified (dry-run on the real tenant)
- **00 bootstrap** — resolves org root.
- **01 location** → hierarchy tree (org→country→state→branch synth, dedup, reuse
  existing) + branch_details; **2nd pass** links branch managers' `pic_user_id`.
- **02 staff** → CP user + organization_members + tenant members (+ profiles),
  lazy login (emailVerified=false, no credential).
- **03 product** → services (PT packages: sessionCount/expiryDays/price RM→cents).
- **04 client** → CP user + members + customer_profiles (identity/address →
  user table; coach link via crosswalk).
- **07 appointment** → appointments (branch/coach/booked-by/times resolved).
- Reconciliation: 6 branches · 11 staff · 6 services · 8 clients · 16 appts ✅.
- `check-types` clean, `oxlint` 0 warnings.

## Locked decisions (client)
Multi-country (MYR+THB+SGD) · backfill commission amounts · migrate history ·
provision Better-Auth logins (lazy claim).

## Why deferred — the 3 remaining loaders are BLOCKED
| Loader | Blocker |
|---|---|
| **05 sales** → orders + items + payments + commission | Sales-commission **amounts absent from source**; **multi-currency** not hardened |
| **06 client package** → package_instances | `serviceId` NOT NULL but package `product_id` **blank** + sales blocked |
| **08 redemption** → coach_session_claims | **No target table** — needs new migration |

## Blockers to clear (mostly NOT code-first)
1. **Client re-export (source data-quality)** — biggest:
   - Client cross-ref key mismatch: transactions use `CL-xxxx`; client dimension
     leaves `client_id` blank (only `aoikumo_xxx`). Today this nulls every
     appointment→customer link, and will do the same for sales/package.
   - Populate `product_id` on `client package` (or accept order→product bridging
     once sales loads).
2. **Historical commission amounts** — source has WHO (allocation staff) but no
   per-allocation amount/%. Need the client's commission rules to recompute OR a
   commission export, OR go attribution-only. (Coach session payouts are fine —
   `redemption.claim_amount` exists.)
3. **Multi-currency hardening (code)** — `payments.currency` defaults `'usd'`;
   per-currency payout batches; per-country tax (MY SST / TH VAT 7% / SG GST 9%).
   Precondition for correct money loads. A standalone workstream.
4. **`coach_session_claims` table** — new tenant migration (claim lifecycle:
   draft→submitted→approved→rejected→paid, claim_amount, payout_batch_id). SQL
   sketch in `MIGRATION-STRATEGY.md`. The one blocker doable solo.
5. **`branch_details` extended columns** — `migrations-proposed/0095_*.sql`
   (branch_code, display_name, tiers, status, codes, dates) — confirm which the
   client uses, then promote per `docs/TENANT_MIGRATION_WORKFLOW.md`.

## Out of scope
- The `CopyStaging` writer (only needed at >500k; this client is <50k).
- In-app self-serve importer UI (natural end-state; same adapter/loader split).
- Membership-holds reconstruction from freeze windows (frozenUntil only for now).

## Acceptance criteria (to call the migration done)
- All 8 loaders run; reconciliation passes incl. **financial tie-outs** (sum of
  payments, outstanding AR, credits remaining, commissions paid).
- Appointment/sales/package **customer + order links resolve** (post re-export).
- A clean `--commit` against a throwaway Neon branch, then the real tenant.
- Per-currency reconciliation (MY pilot first, then TH, SG).
