# Scalability Audit — Sales Pipeline Fixes

Plan reviewed: `zplan/05-12_17-10_sales-pipeline-fixes/plan/plan.md`
Reviewer: scalability auditor
Date: 2026-05-12

Severity legend: **CRITICAL** (data loss / deadlock under load) · **HIGH** (1k+ row degradation, exploitable race) · **MEDIUM** (index miss, memory spike) · **LOW** · **INFO**

---

## 1. Backfill N+1 (Task 1.6) — **HIGH**

**Plan text:** "For each `commission_splits` row where `status = 'pending'` AND `source = 'pos'` AND linked appointment status NOT IN (`completed`, `cancelled`): void it."

**Gap.** The plan says "for each row" without specifying the access pattern. A naive port iterates tenants → splits → per-split lookup of the linked appointment, which is O(tenants × splits × 1 SELECT). For a tenant with 10k POS-pending splits this is 10k+ round-trips per tenant.

**Required pattern (must be made explicit in plan).** Per tenant, do **two** queries total:

```sql
-- 1. one batched join that finds candidate splits in a single pass
SELECT cs.id, cs.appointment_id
  FROM commission_splits cs
  LEFT JOIN appointments a ON a.id = cs.appointment_id
 WHERE cs.status = 'pending'
   AND cs.source = 'pos'
   AND (a.id IS NULL OR a.status NOT IN ('completed','cancelled'));

-- 2. one batched UPDATE ... WHERE id = ANY($1::uuid[])
```

Process tenants sequentially (avoid blasting Neon control plane). Within a tenant, process the void list in chunks of ~500 ids using `inArray`. Add an explicit instruction to the script: **never one-row-per-statement**.

**Same risk in `runBatch` preview.** §3 contract says preview returns "aggregated split rows in one query" but §5/2.1 says `SELECT ... FOR UPDATE on splits where status='approved' AND staffId IN (...) AND earnedAt BETWEEN`. That single query is correct — call it out explicitly that preview must use the same WHERE shape (no per-staff loop in TS).

**Action:** add to plan §1.6: "Single batched LEFT JOIN per tenant; chunked UPDATE via `inArray`." Add to §2.1: "preview = one SELECT, no per-staff loop."

---

## 2. Pagination realism — **MEDIUM**

Plan claims:
- Payouts list — cursor 50/page
- `listAssignedToMe` — cursor 50/page
- cancelled-sales — paginated via existing data-table pattern

**Findings.**
- `listAssignedToMe` (Task 4.1) — explicitly says "Cursor pagination (limit 50)". Realistic; matches existing `parseCursor`/`encodeCursor` helpers already imported in `packages/api/src/routers/package-instances.ts:33`.
- **Payouts list** — the plan never specifies the cursor key. The natural keys are `(paidAt DESC, id DESC)` or `(createdAt DESC, id DESC)`. Without specifying, an implementer may default to `OFFSET/LIMIT`, which degrades on tenants with thousands of historical payouts. **Add to plan:** payouts list cursor = `(paidAt DESC NULLS LAST, id DESC)`, default limit 50, max 200.
- **Cancelled-sales list** — "existing data-table pattern" is ambiguous. Verify the existing `cancelledSales.list` router actually uses cursor; if it uses OFFSET, this needs uplift before being unhidden. **Action:** Phase 6 should explicitly verify and document the cursor strategy.
- **`previewBatch`** — §7 Performance Checklist says "preview capped at 500 rows". Good upper bound, but no description of what happens at 501 — is the proc rejected, or truncated with a "narrow your range" hint? Pick rejection (simpler) and surface a specific error code (e.g. `PAYOUT_PREVIEW_TOO_LARGE`).

---

## 3. `SELECT ... FOR UPDATE` lock scope — **HIGH**

**`runBatch`.** WHERE = `status='approved' AND staffId IN (...) AND earnedAt BETWEEN`. With the existing composite index `commission_splits_staff_status_earned_idx (staffId, status, earnedAt)` (confirmed at `packages/db/src/schema/tenant/commission-splits.ts:128`), Postgres should index-scan the targeted band — lock scope is acceptable AS LONG AS `staffIds` is non-empty. **Risk:** if the UI passes `staffIds: []`, the WHERE collapses to "all approved splits in date range" and locks every staff member's pending payouts at once. **Action:** server-side guard — reject `runBatch` when `staffIds.length === 0` (require explicit "all staff" sentinel that admin must opt into, with an upper cap of e.g. 50 staff per batch). Same guard belongs in `previewBatch`.

**`cancelPackageInstance`.** Plan says "`SELECT ... FOR UPDATE` on instance". One row, scoped by primary key — fine. No issue.

**Missing lock-acquisition order.** When `runBatch` does (a) lock splits, (b) insert payouts, (c) update splits to `paid`, document that no other code path takes locks in the reverse order (splits then payouts then splits). With current code there's no reverse-order writer, but Phase 7's reversal/refund flow could introduce one. **Action:** add a short "lock order" note: always splits → payouts → splits-update, never payouts → splits.

---

## 4. External calls inside DB transactions — **MEDIUM (existing) / LOW (new)**

**Existing code is safe.** `notifyStaffOfPendingPackage` is called in `packages/api/src/routers/package-instances.ts:371` AFTER `created` returns — i.e. outside the create transaction, in its own try/catch. It uses `context.tenantDb` (not `tx`), and only inserts notification rows (no SMTP / Resend / webhook). So no external network call in tx today.

**New code to watch.**
- Phase 1 cancellation branch: `appointment.service.ts:528` cancel branch wraps everything in `tx`. The new call `runAppointmentCommission(existing, { via: "cancellation" })` already runs inside the existing tx (existing pattern at line 638/641). That's fine — it's pure SQL.
- Phase 2 `runBatch`: must not call any notification (e.g. "payout created" email to trainer) inside the tx. **Add explicit instruction:** if a payout-notification feature is added later, fire it AFTER `tx` commits. Plan §2 doesn't propose any external send; just preempt.
- Phase 5 `cancelPackageInstance`: same rule — if "customer notified of cancellation" is added, queue it outside the tx.

**Recommendation:** add a one-liner under §7 "Cross-Cutting" → "No external I/O (email, SMS, webhook, Stripe) inside any transaction. Defer with a post-commit hook or a queued notification row."

---

## 5. Missing indexes — **MEDIUM**

Plan adds:
- `installments(sales_order_id)` ✅
- `package_instances(sales_order_id)` ✅

**Already present (confirmed in schema):**
- `commission_splits_staff_status_earned_idx (staffId, status, earnedAt)` — covers `runBatch` and `previewBatch` perfectly. **No new index needed.**
- `commission_splits_payout_idx (payoutId)`, `commission_splits_status_idx`, `commission_splits_appointment_idx`.

**Missing — should be added in 0010 migration:**
- `package_instances(assigned_trainer_id, status)` — Task 4.1 query is `WHERE assignedTrainerId = ? AND status IN (...)`. Plan §7 row 4 says "verify; add if missing". Verification not done in plan — make it an explicit migration line.
- `commission_splits(earn_reason)` — only needed if filtered/grouped by reason in UI. Plan adds `earnReason` and an index in 1.2 ("text + index"). Confirm it's a low-cardinality column — a btree on `(earn_reason)` alone is wasteful; if it's only for display, drop the index; if it's for filtered counts, make it `(staffId, earn_reason)` composite.
- `commission_splits(appointment_id, staff_id)` partial unique — already exists per the schema header comment line 107. Good.

---

## 6. Race in cancelled-as-delivered rule — **HIGH (mitigated by existing index)**

**Scenario.** Two admins click "Cancel" on the same appointment within milliseconds. Both calls reach `appointment.service.ts:528`. Both call `runAppointmentCommission(... via: "cancellation")`. Without a uniqueness guard, you get two `commission_splits` rows for the same `(appointmentId, staffId)`.

**Existing safeguard.** The schema header at `commission-splits.ts:107` documents:
```
commission_splits_appt_staff_unique  ON (appointment_id, staff_id) WHERE appointment_id IS NOT NULL
```
This is a partial unique index (per migration 0024). Concurrent inserts → second one fails with `unique_violation`.

**Gap in plan.** The plan doesn't say how `runAppointmentCommission` should handle the violation. Three options:
- (a) catch SQLState `23505` and treat as success (idempotent semantics).
- (b) re-read and return existing splits.
- (c) propagate as 409.

**Action:** specify (a) in Task 1.3 — "Catch `23505` from `commission_splits_appt_staff_unique` and short-circuit; the first cancel won." Without this the second cancel surfaces a 500 to the user.

**Secondary race.** If the appointment is first cancelled, then completion runs (e.g. via auto-completion cron racing manual cancel), both call sites fire. Same unique index protects insert; same handling needed.

---

## 7. `ALTER TYPE ADD VALUE` in migration — **CRITICAL if not split**

**Postgres rule.** `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction as queries that reference the new value. The plan's migration §3 wraps two enum extensions plus DDL plus a CREATE FUNCTION plus DDL trigger in a single SQL file.

**Plan acknowledges this in §6 / Risks** ("two-deploy plan: ship migration → wait one deploy → ship code that reads the new value") — good — but the migration file itself does NOT enforce it. Drizzle/`runTenantMigrations` runs each file in a transaction by default.

**Required fix.** Either:
- (a) Split into TWO migration files: `0010_enum_extensions.sql` (only `ALTER TYPE ADD VALUE`, ends with the implicit COMMIT) and `0011_sales_pipeline_fixes.sql` (everything else, including the trigger that doesn't reference the new enum values).
- (b) Add explicit `COMMIT;` between the `DO $$ ... END $$;` and any subsequent statement that references `'frozen'` / `'completed'` / `'card'` / `'fpx'` / `'stripe'`.

Looking at the migration body in plan §3 — the trigger and the other DDL do not literally reference the new enum values, so **technically** this single file *might* work today. But Task 5.2 (`markCompleteIfFinal` writes status `'completed'`) and Task 5.3 (`freeze` writes `'frozen'`) WILL run as soon as the application code deploys. If the migration runs at request time (`runTenantMigrations()` per the CLAUDE.md tenant pipeline) and the same request later writes `'frozen'`, the new value may not be visible to the prepared statement cache.

**Action:** Split into 0010 (enum extensions only) + 0011 (the rest). Verify `runTenantMigrations` commits between files (it does — each file is its own tx). This is non-negotiable for correctness.

---

## 8. POS deferred commission unbounded growth — **HIGH**

**Plan §8 Open Q-2 Option B:** flag `sales_order_items.commission_deferred = true`, swept later. Plan admits "if a deferred sale never produces an appointment, commission never fires — need a sweeper cron after N days".

**Gap.** No sweeper is designed. Concrete risks:
- Service products that customers buy but never book → row stays `commission_deferred = true` forever. Over years this accumulates. Without a TTL, the boolean partition grows unbounded.
- No index proposed on `(commission_deferred, createdAt)` — sweeper will full-scan `sales_order_items`.
- No state machine: what if customer books → cancels → rebooks → cancels? Does the flag flip back to `true`? Currently undefined.

**Required additions to plan:**
1. Define sweep policy: at N days (suggest 90) after `salesOrderItems.createdAt`, sweeper either (a) auto-completes commission as if the appointment was cancelled, or (b) surfaces to admin via a new `stuck_commissions` queue. Pick one, document it.
2. Add index: `CREATE INDEX sales_order_items_commission_deferred_idx ON sales_order_items (created_at) WHERE commission_deferred = true;` (partial — minimal storage).
3. Add hard upper bound: items older than 365 days are auto-resolved by sweeper into a "void" terminal state, regardless.
4. Add sweeper procedure design: cron job (Cloudflare Workers cron trigger), per-tenant, paginated 100/batch, idempotent.

Without these, "Option B" guarantees a growing pile of stale flag rows that no one will ever clean up.

---

## 9. Permission backfill at scale — **MEDIUM**

**Plan §6 / Risks:** "new `payout_management` resource — without seed, no one can access the new page. Include seed in migration."

**At 100+ tenants.** A per-tenant migration that does `INSERT INTO role_permissions ... WHERE role.name = 'admin'` is fine — each tenant runs the migration on first request via `runTenantMigrations`. The seed is one INSERT (or a small INSERT...SELECT joined to the local `roles` table) per tenant. Sub-second per tenant.

**Risk surface, not blocker.** The plan doesn't:
- Specify whether the seed is in SQL (idempotent `INSERT ... ON CONFLICT DO NOTHING`) or in a TypeScript service called post-migration. Service-side is harder to make idempotent across cold-start retries.
- Account for tenants with custom role names (no `admin` role, only `owner`). The seed will silently grant 0 rows for those tenants.

**Action:**
- Make the seed pure SQL inside `0010` (or `0011`):
  ```sql
  INSERT INTO role_permissions (role_id, resource, action)
  SELECT r.id, 'payout_management', 'manage'
    FROM roles r WHERE r.name IN ('admin','owner')
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.resource = 'payout_management'
    );
  ```
- Add a one-line check in §2.5 acceptance: "non-admin roles get 403; admin role with custom name `owner` also passes."
- For 100 tenants, total migration time impact: ~1ms × 100 = trivial. Not a blocker.

---

## 10. Native installment picker — `useQuery` staleTime — **LOW**

**Plan §3.2** uses:
```ts
useQuery({ queryKey: ["installmentPlans","active"], queryFn: ... })
```
No `staleTime` set. React Query default is `staleTime: 0` — refetches on every screen mount and on window focus.

**Impact.** Native screens mount on every navigation. The buy-package flow has multi-step navigation (plan picker → confirm → pay). Each remount fires a fresh RPC. Not catastrophic (small response, indexed query), but unnecessary load and a perceptible spinner each step.

**Action:** add `staleTime: 5 * 60 * 1000` (5 min — admin-defined plans change rarely) and `gcTime: 10 * 60 * 1000`. Plan §7 Performance Checklist row 10 says "staleTime: 30s" generically — apply the longer 5-min staleTime here specifically because plans are slow-changing config data.

Same applies to Phase 4 trainer assigned-packages: 30s is too short for a list a trainer scrolls a few times — bump to 60s and rely on invalidation when admin assigns/edits.

---

## Summary table

| # | Concern | Severity | Required action |
|---|---|---|---|
| 1 | Backfill N+1 | HIGH | Specify batched JOIN + chunked `inArray` UPDATE |
| 2 | Pagination spec | MEDIUM | Specify cursor keys + reject empty staffIds preview |
| 3 | runBatch lock scope | HIGH | Reject empty staffIds; cap at 50 staff/batch |
| 4 | External I/O in tx | LOW (new) / MEDIUM (rule) | Add cross-cutting "no external I/O in tx" rule |
| 5 | Missing indexes | MEDIUM | Add `package_instances(assigned_trainer_id, status)`; reconsider `earn_reason` index |
| 6 | Cancel-as-delivered race | HIGH | Specify `23505` catch in `runAppointmentCommission` |
| 7 | ALTER TYPE same-tx | CRITICAL | Split enum extensions into separate migration file |
| 8 | Deferred-commission unbounded | HIGH | Design sweeper, partial index, TTL, terminal void state |
| 9 | Permission seed at scale | MEDIUM | Pure-SQL idempotent seed; cover non-`admin` role names |
| 10 | useQuery staleTime | LOW | Set explicit staleTime per surface |

## Highest-priority follow-ups (must address before execute)

1. **#7 (CRITICAL)** — split the migration so `ALTER TYPE ADD VALUE` commits before any code path or trigger references the new values.
2. **#8 (HIGH)** — design the deferred-commission sweeper before building Phase 1; otherwise Option B is a known data-quality leak.
3. **#3 + #6 (HIGH)** — add explicit guards in the plan: empty-staffIds rejection in `runBatch`, and `23505` short-circuit in `runAppointmentCommission`.
4. **#1 (HIGH)** — make the backfill batched-by-design in the plan text, not left to implementer interpretation.

## Files referenced

- `C:\Project\Avantej\packages\db\src\schema\tenant\commission-splits.ts` — composite index `commission_splits_staff_status_earned_idx` already exists; partial unique on `(appointment_id, staff_id)` already exists.
- `C:\Project\Avantej\packages\services\src\appointment.service.ts:638-641` — existing `runAppointmentCommission` call sites inside tx.
- `C:\Project\Avantej\packages\services\src\notification.service.ts:113-173` — `notifyStaffOfPendingPackage` is SQL-only, no external I/O.
- `C:\Project\Avantej\packages\api\src\routers\package-instances.ts:367-380` — notification call is OUTSIDE the create transaction.
- `C:\Project\Avantej\packages\services\src\payouts.service.ts:65-80` — existing reversal tx pattern (good reference for runBatch).
