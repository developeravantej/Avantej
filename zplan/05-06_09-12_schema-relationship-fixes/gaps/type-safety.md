# Type Safety Audit — Post-Apply Re-Run
**Session:** zplan/05-06_09-12_schema-relationship-fixes
**Run:** 2nd pass (after --apply amendments)
**Findings:** 6 (C 2 · H 2 · M 2)

---

## Findings

### [CRITICAL] `creditsRemaining` is a GENERATED ALWAYS AS computed column — Agent 2.8 FOR UPDATE pattern is architecturally impossible
**Plan claims (Agent 2.8):** "`package_instances.remainingCredits` decrement on refund → `SELECT ... FOR UPDATE`"
**Actual:**
```typescript
// packages/db/src/schema/tenant/package-instances.ts:48-50
creditsRemaining: integer("credits_remaining")
  .generatedAlwaysAs(sql`COALESCE(credits_unlocked, credits_total) - credits_used`)
  .notNull(),
```
`creditsRemaining` is a **PostgreSQL generated column** (`GENERATED ALWAYS AS`). It cannot be written to directly — the value is computed from `credits_unlocked`, `credits_total`, and `credits_used`. `SELECT ... FOR UPDATE` acquires a row lock and is valid, but the plan's intent (decrement `remainingCredits`) is impossible as written. The correct approach: increment `credits_used` and rely on the generated column to recompute.
**File:** `packages/db/src/schema/tenant/package-instances.ts:48-50`
**Fix:** Agent 2.8 must redesign the refund decrement pattern:
1. Lock row: `SELECT ... FOR UPDATE` on `package_instances` (valid — lock on the row, not the generated col)
2. Increment: `UPDATE package_instances SET credits_used = credits_used + refund_qty WHERE id = ?`
3. `creditsRemaining` auto-updates via the generated expression
4. Validate `credits_used <= COALESCE(credits_unlocked, credits_total)` before committing

---

### [CRITICAL] Non-null assertion `updatedMember!` after dual-write with no null guard
**Plan claims:** Agent 2.1 dual-writes: new `roles` table + legacy `members.role` enum field
**Actual:** `packages/api/src/routers/members.ts:512-517` already contains:
```typescript
const updatedMember = await tx.query.members.findFirst({ where: eq(members.id, input.memberId) });
// ...
return updatedMember!.id; // non-null assertion — will throw at runtime if row missing
```
If `memberId` not found in `members` table (race condition: member deleted between lock and update), `updatedMember` is `undefined` and the `!` assertion throws a runtime TypeError, not a typed error.
**File:** `packages/api/src/routers/members.ts:512-517`
**Fix:** Replace `updatedMember!.id` with explicit check:
```typescript
if (!updatedMember) throw new ORPCError({ code: "NOT_FOUND", message: "Member not found" });
return updatedMember.id;
```

---

### [HIGH] Pre-existing unsafe cast in hierarchy router — still unresolved
**Plan claims:** No mention of hierarchy.ts unsafe cast. Agent 2.1 works on members.ts (same context pattern).
**Actual:** `packages/api/src/routers/hierarchy.ts:28`:
```typescript
function getControlPanelDb(context: { honoContext?: any }): NeonDatabase<typeof controlPanelSchema> | null {
  return context.honoContext?.get("controlPanelDb") as NeonDatabase<typeof controlPanelSchema> | null;
}
```
Agent 2.1 and Agent 2.3 will add new procedures to `members.ts` and `sales-orders.ts` that may copy this pattern. If parallel agents introduce the same unsafe cast in new procedures, the `any` accumulation grows.
**File:** `packages/api/src/routers/hierarchy.ts:28-30`
**Fix:** Define `HonoContext` interface in `packages/api/src/lib/context-types.ts` before Phase 2 agents start. Replace `any` with typed interface. All agents given this as a constraint in their briefs.

---

### [HIGH] Pre-existing unsafe cast in installment.service.ts — financial field, still unresolved
**Plan claims:** Not mentioned in plan.
**Actual:** `packages/services/src/installment.service.ts:760`:
```typescript
(err as any).code = "CONFLICT";
```
Unsafe cast on error object in financial payment workflow. Not directly touched by this plan but risk of agents copying pattern.
**File:** `packages/services/src/installment.service.ts:760-761`
**Fix:** Define typed error class before Phase 2 agents write new service code. Agents 2.5, 2.8, 2.9 write financial service logic and must NOT copy this pattern.

---

### [MEDIUM] DEFERRABLE INITIALLY DEFERRED for Agent 2.9 self-FK requires raw SQL migration
**Plan claims:** `commission_split_reversals` has self-FK + `DEFERRABLE INITIALLY DEFERRED`
**Actual:** Drizzle schema generator does not produce `DEFERRABLE` syntax. Plan §5 Agent 2.9 annotation hints at raw SQL but does not make this mandatory in the task brief. Agent using `schema.ts` + standard Drizzle migration will produce a non-deferrable FK.
**File:** Plan §5 Agent 2.9 migration file
**Fix:** Agent 2.9 migration (now `0031_add_commission_split_reversals.sql`) must include raw SQL for the deferrable FK:
```sql
ALTER TABLE commission_split_reversals
  ADD CONSTRAINT csr_reversal_of_fk
  FOREIGN KEY (reversal_of_id) REFERENCES commission_split_reversals(id)
  DEFERRABLE INITIALLY DEFERRED;
```
Do NOT let Drizzle auto-generate this constraint.

---

### [MEDIUM] `refund_items` triple-nullable FK check missing DB enforcement
**Plan claims:** "at least one of `salesOrderItemId`, `packageInstanceId` must be set (CHECK)"
**Actual:** Existing `refunds.ts:22-30` shows similar pattern with comment "enforced in service layer + DB CHECK" but DB CHECK is comment-only in schema, not in any migration. Agent 2.8 must add explicit CHECK constraint in migration.
**File:** `packages/db/src/schema/tenant/refunds.ts:22-30`
**Fix:** Agent 2.8 migration (`0030_add_refund_items.sql`) must include:
```sql
ALTER TABLE refund_items ADD CONSTRAINT refund_items_target_xor
  CHECK (num_nonnulls(sales_order_item_id, package_instance_id) >= 1);
```

---

## Summary

Two new CRITICAL findings emerged from post-apply re-audit. The `creditsRemaining` computed-column issue is the most impactful: Agent 2.8's entire concurrency design assumed a mutable column that is actually generated. The fix is straightforward (increment `credits_used` instead) but the agent brief must be corrected before dispatch. The `updatedMember!` non-null assertion is a pre-existing time-bomb in members.ts that Agent 2.1's new procedures will share. Three pre-existing unsafe casts (hierarchy.ts, sales-orders.ts, installment.service.ts) remain unresolved by this plan — recommend fixing them in a separate cleanup PR before Phase 2 agents add adjacent code. The DEFERRABLE and refund_items CHECK constraints are implementation-level fixes needed in agent migration files.
