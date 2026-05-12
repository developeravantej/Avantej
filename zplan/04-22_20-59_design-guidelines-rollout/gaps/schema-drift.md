# Schema Drift Audit
**Session:** 04-22_20-59_design-guidelines-rollout
**Findings:** 4 (0 critical · 1 high · 2 medium · 1 info)

## Findings

### [HIGH] Drizzle schema still declares `expenses.currency` default as `"usd"` despite migration already fixing it to `"myr"`

**Plan claims:** §8.8 treats `expenses.currency = "usd"` as an unfiled, out-of-scope schema defect — "File a separate ticket." Phase 1.4 says to confirm the UI shows MYR regardless.

**Actual:** Migration `0014_expenses_currency_myr.sql` already exists and has been applied. It runs `UPDATE expenses SET currency = 'myr' WHERE currency = 'usd'` and `ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'myr'`. The live DB column default is now `'myr'`. However, the Drizzle schema source file still reads `.default("usd")`, creating a forward schema-drift: any future `bun db:push` or `db:generate` run will detect a drift and may try to revert the column default back to `"usd"`.

**File:** `packages/db/src/schema/tenant/expenses.ts:21` (schema), `packages/db/src/migrations/tenant/0014_expenses_currency_myr.sql` (migration)

**Fix:** Update `expenses.ts` line 21 from `.default("usd")` to `.default("myr")` so the Drizzle ORM source matches the live DB state. This is a one-line schema sync, not a new migration — it only corrects the ORM's view of what the DB already has.

---

### [MEDIUM] `CanonicalStatus` uses `"no_show"` (underscore) but `appointments.status` uses `"no-show"` (hyphen)

**Plan claims:** `CanonicalStatus` includes `"no_show"` as a valid status value (plan §12.5 / TypeScript definition). The `StatusBadge` component will map every incoming status string against this union type.

**Actual:** `appointments.ts:36` documents the column as accepting `"no-show"` (hyphen, not underscore). The `check-ins.ts:46` `outcome` field also uses `"no_show"` (underscore) — so two different conventions exist across related tables. If `StatusBadge` receives a live `appointments.status` value of `"no-show"`, it will not match `"no_show"` in `CanonicalStatus` and will fall through to an undefined/default mapping.

**File:** `packages/db/src/schema/tenant/appointments.ts:36`, `packages/db/src/schema/tenant/check-ins.ts:46`

**Fix:** Decide on one canonical form. Either (a) add `"no-show"` alongside `"no_show"` in `CanonicalStatus` and handle both in the badge map, or (b) normalise appointment status values to `"no_show"` at the service/API layer before passing to the UI. Document the decision. The plan's Phase 1.4 / Phase 5 prep should include this audit step for `appointments.status`.

---

### [MEDIUM] `commissionSplits.status` uses `"void"` — already in `CanonicalStatus` but plan defers the semantic decision

**Plan claims:** §8.3 flags `"void"` as an open question: "If `void` is load-bearing, add it to `CanonicalStatus`. Otherwise migrate callers to `cancelled`." The plan already includes `"void"` in the `CanonicalStatus` union definition (plan line 112), but notes the decision is deferred to Phase 4.F.5.

**Actual:** `commission-splits.ts:53` uses `"void"` as a documented lifecycle status (`pending → approved → paid | void from any state`). The schema comment at line 14 explicitly calls out `void` as a valid terminal state distinct from `cancelled`. `"void"` means "commission invalidated due to refund or correction" — semantically distinct from `cancelled` and should not be collapsed. The decision to keep it is already implicitly made by including it in `CanonicalStatus`; the §8.3 action item should be closed, not deferred.

**File:** `packages/db/src/schema/tenant/commission-splits.ts:12-14, 53`

**Fix:** Close §8.3 as resolved — `"void"` is load-bearing (documented distinct terminal state) and is already in `CanonicalStatus`. Remove the deferral note and add a one-line comment in `status-badge.tsx` explaining the `void` vs `cancelled` distinction.

---

### [INFO] `purchaseOrderStatusEnum` uses `"partially_received"` — not in `CanonicalStatus`, but no conflict

**Plan claims:** `CanonicalStatus` covers `"received"`, `"fulfilled"`, `"in_transit"`, `"draft"`, and `"cancelled"` for inventory/supply chain statuses. The plan does not list `"partially_received"` or `"ordered"`.

**Actual:** `purchase-orders.ts:27-34` defines a `pgEnum("purchase_order_status")` with values: `"draft"`, `"approved"`, `"ordered"`, `"partially_received"`, `"received"`, `"cancelled"`. Of these, `"ordered"` and `"partially_received"` are not in `CanonicalStatus`. These are PO-specific intermediate states not currently rendered elsewhere in the UI as generic badges.

**File:** `packages/db/src/schema/tenant/purchase-orders.ts:27-34`

**Fix:** No immediate action needed — the plan correctly limits `CanonicalStatus` to cross-domain statuses. However, when Phase 4 (purchase orders UI) is implemented, `StatusBadge` will need an extension entry for `"partially_received"` and `"ordered"`, or those pages will need a local override. Add a note to the purchase orders page plan.

---

## Summary

The plan's "no DB schema, no migration" claim is accurate for the UI refactoring work itself — no new migrations are needed. However, two pre-existing schema issues surface that the plan did not fully account for: (1) a migration fixing `expenses.currency` to `"myr"` already landed (`0014_expenses_currency_myr.sql`) but the Drizzle ORM source file was never updated, creating a live schema-vs-source drift that will cause problems on the next `db:generate` or `db:push`; (2) `appointments.status` uses a hyphenated `"no-show"` while `CanonicalStatus` defines `"no_show"` with an underscore, meaning the new `StatusBadge` component will silently mis-map live appointment status values. The `"void"` commission status question in §8.3 can be closed — it is already in `CanonicalStatus` and is semantically non-collapsible. The `purchaseOrderStatusEnum` intermediate values are an info-only gap for future work.
