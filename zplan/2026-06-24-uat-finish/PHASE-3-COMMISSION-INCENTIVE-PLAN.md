# Phase 3 — §12 Commission Incentive + Renewal Engine (standalone session brief)

**Status:** PLANNED, not started. Gated behind explicit go/no-go (money path).
**Basis:** UAT §12 "Commission & Incentive Readiness" items not yet covered:
- "Incentive thresholds; renewal rule vs new-sale" → currently **deferred**.

> Reality from the engine investigation: this is **not a fixture task** — the
> incentive-threshold logic and the renewal-vs-new-sale distinction **do not
> exist anywhere** in `packages/services`. Both are genuine feature builds on the
> commission money path. Treat as its own 3–5 day session with a staff-eng review
> before merging.

---

## What exists today (do not rebuild)

- **Engine:** `commission-calculator.service.ts` — 3-stage pipeline
  `loadCommissionContext → planSplits → persistSplits`. Inputs: trainer tier
  (`members.trainerTierId`), category/track rates, slot weightage (sums to 10000 bp).
  Entry points: `calculateCommissionForAppointment`, `calculateCommissionForPos`.
- **Tracks framework** (`commission-tracks.ts`): `scope`, `roleType`, `trigger`
  (`on_completion`|`on_sale`), `basis`, `paymentType`, `poolPolicy`,
  `maxBeneficiaries`; rates in `commissionTrackRates`; **conditions**
  (`commission-conditions.ts`) already support operator thresholds
  (`lt/lte/gt/gte/eq/between`) — but only for **POS quantity tiers**, not renewal
  status or period-aggregate incentives.
- **Earn reasons** (`packages/types/src/commission.ts`):
  `completion|cancellation|no_show|pos_product|manual`. No `incentive`, no renewal.
- **Snapshots:** `commission_splits.trainerTierId` already frozen per split.
- **Cron:** daily/hourly commission + payout jobs in `apps/server/src/index.ts`
  `scheduled` handler — the natural home for a period-aggregate incentive sweep.

---

## Sub-feature 3a — Renewal vs new-sale rate (≈2 days)

**Journey:** Admin sets a category/track to pay rate A on a *new* package sale and
rate B on a *renewal*. A member's first purchase of a service earns A; their
repurchase of the same service/category earns B.

1. **Detect renewal at sale time.** A sale is a *renewal* when the client already
   has a prior `package_instances` row for the same service (or service category).
   Compute in the POS/package-purchase path and stamp it.
   - Schema: `package_instances.is_renewal boolean NOT NULL DEFAULT false`
     (tenant migration + `bun gen:migrations`). Idempotent SQL.
2. **Scope rates by sales type.** Add `sales_type` to `commission_tracks`
   (`new | renewal | any`, default `any` — preserves existing rows). Engine
   `planSplits` filters candidate tracks by the sale's renewal flag (a `renewal`
   sale prefers a `renewal` track; falls back to `any`).
3. **Procedures + UI:** track create/update gains a `salesType` selector; surface
   in the commission-config UI.
4. **Tests:** unit (engine picks renewal track for a renewal sale) + e2e
   `_e2e/web/commissions/renewal-rate.rule.spec.ts` (new sale → rate A split;
   renewal of same service → rate B split).

**Risk:** renewal detection must not misclassify (same service vs same category —
decide explicitly); default `any` keeps all existing configs working.

---

## Sub-feature 3b — Incentive thresholds (≈2–3 days)

**Journey:** Finance configures "a Senior trainer who books > RM X in confirmed
sales this month earns a Y bonus." At month close (or on the daily sweep), a
trainer who crossed the threshold gets exactly one incentive commission split;
one who didn't gets none; re-running the sweep never double-pays.

1. **Schema:** new tenant table `commission_incentives`
   `{ id, role_type, trainer_tier_id (nullable), period_type ('monthly'),
   threshold_cents, bonus_type ('fixed'|'pct'), bonus_value, is_active }`
   + migration + `gen:migrations`.
2. **Earn reason:** add `'incentive'` to `CommissionEarnReason`
   (`packages/types/src/commission.ts`) + anywhere the union is narrowed.
3. **Evaluator (idempotent):** for each active incentive rule + period, aggregate
   the trainer's qualifying confirmed sales/commission base; if it crosses
   `threshold_cents`, emit ONE incentive split (`earnReason='incentive'`,
   `splitType='manual'`/system).
   - **Idempotency is the hard part:** a partial unique index on
     `(staff_id, incentive_rule_id, period_key)` (raw SQL — Drizzle can't express
     it) so re-runs are no-ops. Mirror the cancellation-sequence / advisory-lock
     patterns already in the repo.
4. **Wire into cron:** add to the daily commission sweep in the `scheduled`
   handler (or a dedicated `0 4 * * *` job + `wrangler.jsonc` trigger).
5. **Procedures:** CRUD for incentive rules (`commissionIncentives.*`) +
   "my incentives this cycle" read.
6. **Tests:** unit (below threshold → 0 splits; crossing → 1 split of exact
   amount; second run → still 1, no double-pay) + integration against a seeded
   multi-sale scenario + e2e for the read/CRUD surface.

**Risk (high):** money path. New table on per-tenant Neon branches ⇒ idempotent
migration + rollout to live tenants (`migrate-all-tenants.ts`). The evaluator
must be exactly-once per period — the unique-index idempotency key is the
safeguard; test the re-run case explicitly.

---

## Cross-cutting

- **Migrations:** two tenant migrations (3a column, 3b table). Commit SQL +
  regenerated `tenant-migrations.generated.ts` together; `bun verify:migrations`
  must stay green; rollout via `migrate-all-tenants.ts` (needs prod creds).
- **Drift:** run `bun scripts/gen-erd.ts` + `bun scripts/check-drift.ts` after schema.
- **Ledger:** flip §12 "Incentive thresholds; renewal rule vs new-sale" →
  covered only after both sub-features land with green tests.
- **Verification:** `bun check-types`; server unit + integration tests; e2e for
  renewal-rate + incentive read; refresh `review-uat.html` via `shard-run.sh`.

## Suggested order
1. 3a renewal (smaller, no cron, no idempotency complexity) — proves the
   track-scoping seam.
2. 3b incentive (bigger — schema + idempotent sweep + cron).

Each sub-feature ships a complete journey and can merge independently.
