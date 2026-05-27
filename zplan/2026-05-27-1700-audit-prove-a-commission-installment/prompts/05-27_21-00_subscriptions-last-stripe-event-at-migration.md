# Add `subscriptions.last_stripe_event_at` column to replace F-SAAS-3 proxy

> Handoff prompt generated 2026-05-27 21:00 · Branch: `audit-prove-a/commission-installment-20260527-1700` · Project: Avantej

## Mission

Add a `last_stripe_event_at: timestamp` column to the **control-panel** `subscriptions` table and update `markPastDue` / `markActive` / `upsertSubscriptionFromStripe` to compare incoming Stripe `event.created` against this column (currently they compare against `updatedAt` as an imprecise proxy). The proxy is correct most of the time but can silently skip a legitimate Stripe event arriving within the same second as an unrelated app write to the row.

## Context

**Project:** Avantej — multi-tenant SaaS (TanStack Router + oRPC + Drizzle + Better-Auth + Cloudflare Workers + Bun monorepo)
**Stack relevant here:** Drizzle ORM, control-panel Postgres (NOT a tenant Neon branch), Stripe webhook event timestamps, no tenant migration runtime — control-panel uses standard `bun db:migrate:control-panel`
**Branch:** `audit-prove-a/commission-installment-20260527-1700` (already commit `2b8c88ec` ahead of origin)
**Recent work:**
- `2b8c88ec fix(audit-prove-a): commission + installment remediation across both iterations` — F-SAAS-1/2/3 lifecycle fixes landed; F-SAAS-3 used `updatedAt` proxy with a `TODO (follow-up)` comment at `saas-subscription.service.ts:196-203`
- `b40d19b1 docs(audit-prove-a): Phase 6 report` — flagged this migration as the canonical fix

## Current State

`apps/server/src/services/saas-subscription.service.ts:196-203` has this comment:
```
* event timestamp because the schema has no dedicated last_stripe_event_at column.
* This is an imperfect guard — updatedAt can be moved by app writes unrelated to
* Stripe events — but it prevents the most common replay scenario where a stale
* ...
* TODO (follow-up): Add a last_stripe_event_at timestamp column to subscriptions
* (migration required) so this comparison is always precise.
```

Both `markPastDue` and `markActive` accept an optional `stripeEventCreatedAt?: number` (unix seconds) and compare:
```ts
const incoming = new Date(stripeEventCreatedAt * 1000);
if (incoming.getTime() <= row.updatedAt.getTime()) { /* skip */ }
```
This works most of the time but can drop legitimate newer events.

## Scope

**In scope:**
- `packages/db/src/schema/control-panel/subscriptions.ts` — add `lastStripeEventAt: timestamp("last_stripe_event_at", { withTimezone: true })`
- New control-panel migration file under `packages/db/migrations/control-panel/` (drizzle-kit naming, e.g. `00NN_add_subscriptions_last_stripe_event_at.sql`)
- `apps/server/src/services/saas-subscription.service.ts` — replace `updatedAt` proxy with `lastStripeEventAt` in `markPastDue`, `markActive`, and `upsertSubscriptionFromStripe`
- Backfill SQL for existing rows: `UPDATE subscriptions SET last_stripe_event_at = updated_at WHERE last_stripe_event_at IS NULL` (one-time, idempotent)

**Out of scope (do not touch):**
- Tenant DB schemas — this is the control-panel `subscriptions` table only
- The Stripe webhook handler itself (already passes `event.created` correctly)
- F-SAAS-1 / F-SAAS-2 logic (paymentStatus sync, past-due sweeper) — those land via the same handlers but their behavior is unchanged
- The `updatedAt` column — leave it alone; it stays for general row-level audit

## Tasks

1. Read `packages/db/src/schema/control-panel/subscriptions.ts` in full to see the current schema and timestamp convention (`{ withTimezone: true }` is the project default per CLAUDE.md).
2. Add column to the schema:
   ```ts
   lastStripeEventAt: timestamp("last_stripe_event_at", { withTimezone: true }),
   ```
   Nullable (no `.notNull()`) so backfill is graceful for legacy rows.
3. Generate the migration: `bun db:generate:control-panel`. Verify the new SQL file appears under `packages/db/migrations/control-panel/`.
4. Edit the generated SQL to include the backfill at the end: `UPDATE subscriptions SET last_stripe_event_at = updated_at WHERE last_stripe_event_at IS NULL;`.
5. Apply locally: `bun db:migrate:control-panel`. Verify with `bun db:studio:control-panel` that the column exists.
6. In `apps/server/src/services/saas-subscription.service.ts`:
   - Find both `markPastDue` and `markActive` handlers. Replace `row.updatedAt` with `row.lastStripeEventAt ?? row.updatedAt` (the `?? updatedAt` is the safety fallback for any rows the backfill missed — but it should be unnecessary).
   - When applying the mutation, ALSO set `lastStripeEventAt: incoming` inside the same tx.
   - Update `upsertSubscriptionFromStripe` similarly — on insert, set `lastStripeEventAt: incoming`; on update, apply the same ordering guard.
   - Remove the `TODO (follow-up)` block (lines ~196-203) and replace its comment with a one-liner: `// F-SAAS-3 ordering guard: lastStripeEventAt is the canonical event-timestamp anchor.`
7. Run `bun check-types --force` from repo root.
8. Run the integration tests that exercise these handlers:
   ```
   cd apps/server
   bun test src/services/saas-subscription.service.integration.test.ts 2>&1 | tail -20
   ```

## Verification

- [ ] `bun check-types --force` exits 0 across all 3 packages
- [ ] `bun db:studio:control-panel` shows `last_stripe_event_at` column on `subscriptions` table
- [ ] After backfill: `SELECT count(*) FROM subscriptions WHERE last_stripe_event_at IS NULL` returns 0
- [ ] Integration test for SaaS lifecycle still passes (or skips with `STRIPE_*` env-related skip — that's pre-existing)
- [ ] No remaining `updatedAt` comparison in `markPastDue`, `markActive`, `upsertSubscriptionFromStripe`
- [ ] TODO comment removed; new comment refers to `lastStripeEventAt` as the canonical anchor

## Key References

| Resource | Path / Command |
|----------|---------------|
| Schema file | `packages/db/src/schema/control-panel/subscriptions.ts` |
| Service file (3 handlers) | `apps/server/src/services/saas-subscription.service.ts` (search for `markPastDue`, `markActive`, `upsertSubscriptionFromStripe`) |
| Generate migration | `bun db:generate:control-panel` |
| Apply migration | `bun db:migrate:control-panel` |
| Studio | `bun db:studio:control-panel` |
| Type check | `bun check-types --force` |
| Prior session report | `zplan/2026-05-27-1700-audit-prove-a-commission-installment/REPORT.md` |

## Constraints

- This is a **control-panel** migration. The control-panel DB uses standard Drizzle migrations (drizzle-kit generate + apply), NOT the tenant migration pipeline described in `docs/TENANT_MIGRATION_WORKFLOW.md`.
- Timestamps use `{ withTimezone: true }` everywhere in this codebase — match the convention.
- The new column must be nullable initially so backfill is graceful; the in-migration backfill should populate every row. Adding `NOT NULL` later is a separate follow-up if desired.
- Do NOT modify the existing `updatedAt` column or its triggers.
- Do NOT commit the migration without running it locally first — the journal-vs-SQL drift checks in `scripts/check-drift.ts` will catch you.

## Agent Recommendation

**Suggested agent:** `backend-engineer`
**Why:** Schema migration + Drizzle ORM update + service-layer integration are all squarely in this agent's scope, and the project's Drizzle + Postgres conventions are part of its system prompt.
