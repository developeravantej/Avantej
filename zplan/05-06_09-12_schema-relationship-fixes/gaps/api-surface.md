# API Surface Audit — Post-Apply Re-Run
**Session:** zplan/05-06_09-12_schema-relationship-fixes
**Run:** 2nd pass (after --apply amendments)
**Findings:** 8 (C 5 · H 1 · M 2)

---

## Findings

### [CRITICAL] Router `memberships.ts` does NOT exist
**Plan claims:** Phase 3.1 creates `packages/api/src/routers/memberships.ts` NEW with `freeze` procedure for J4
**Actual:** No `memberships.ts` in `packages/api/src/routers/`. No `freeze` procedure registered in `baseRouter`.
**File:** `packages/api/src/routers/index.ts` — memberships NOT imported
**Fix:** Agent 3.1 must create router from scratch and register in `baseRouter`

---

### [CRITICAL] Router `households.ts` does NOT exist
**Plan claims:** Phase 3.6 creates `packages/api/src/routers/households.ts` NEW with `create`/`list` procedures
**Actual:** No `households.ts` in routers directory; not in `baseRouter`.
**File:** `packages/api/src/routers/index.ts`
**Fix:** Agent 3.6 must create router from scratch and register in `baseRouter`

---

### [CRITICAL] Router `inventory.ts` does NOT exist
**Plan claims:** Phase 2.6 creates `packages/api/src/routers/inventory.ts` with `movementHistory` procedure
**Actual:** No `inventory.ts` in routers directory; not in `baseRouter`.
**File:** `packages/api/src/routers/index.ts`
**Fix:** Agent 2.6 must create router from scratch and register in `baseRouter`

---

### [CRITICAL] Procedure `refunds.createPartial` does NOT exist
**Plan claims:** Phase 2.8 implements `client.refunds.createPartial()` for J5 partial-package refund
**Actual:** `packages/api/src/routers/refunds.ts` only has: `list`, `getById`, `request`, `approve`, `reject`, `process`
**File:** `packages/api/src/routers/refunds.ts`
**Fix:** Agent 2.8 must add `createPartial: protectedProcedure` to refundsRouter

---

### [CRITICAL] Procedure `walk-in-customers.convertToPackage` does NOT exist
**Plan claims:** Phase 3.5 implements `client.walk-in-customers.convertToPackage()` for walk-in payment conversion
**Actual:** `packages/api/src/routers/walk-in-customers.ts:12-13` exports only `list` (plus 3 deprecated stubs)
**File:** `packages/api/src/routers/walk-in-customers.ts:12-22`
**Fix:** Agent 3.5 must add `convertToPackage: protectedProcedure` to walkInCustomersRouter

---

### [HIGH] Error mapper path inconsistency — two different paths in same plan
**Plan claims (Agent 2.4 owner-files):** `apps/server/src/orpc-error-mapper.ts`
**Plan claims (inline annotation added by --apply):** `apps/server/src/lib/orpc-error-mapper.ts`
**Actual:** Neither path exists — this is a new file. But the plan now contains contradictory locations in the same agent section.
**File:** Plan §5 Agent 2.4 — owner-files vs. annotation text
**Fix:** Standardize to `apps/server/src/lib/orpc-error-mapper.ts` (consistent with `apps/server/src/lib/` for server utilities). Update owner-files entry to match.

---

### [MEDIUM] Agent 3.2 owner-files references non-existent `customers.ts` router
**Plan claims:** Agent 3.2 owner-files section lists `packages/api/src/routers/customers.ts` (modify)
**Actual:** No `customers.ts` router exists. Section 6 annotation corrects this to `customerProfiles` / `customerDirectory`, but the Agent 3.2 owner-files section was not updated during --apply.
**File:** Plan §5 Agent 3.2 owner-files
**Fix:** Update Agent 3.2 owner-files to reference `packages/api/src/routers/customer-profiles.ts` (the correct router for profile updates)

---

### [MEDIUM] `members.updateRole` input shape mismatch
**Plan claims:** J1 mutation accepts `{ memberId, roleId, legacyRole }` per Agent 2.1 design
**Actual:** `packages/api/src/routers/members.ts:399-405` input shape is `{ organizationId, memberId, newRole: enum["admin"|"trainer"|"staff"|"client"] }`
**File:** `packages/api/src/routers/members.ts:399-405`
**Fix:** Agent 2.1 must update procedure input to accept optional `roleId: z.string().uuid().optional()` alongside existing `newRole` for custom role support

---

## Summary

Five procedures/routers are entirely absent from the codebase — agents 2.6, 2.8, 3.1, 3.5, and 3.6 all start from a "create from scratch" baseline. The `--apply` run fixed the Section 6 router name references but did NOT update individual agent owner-files sections — two remain stale (Agent 3.2 `customers.ts`, Agent 2.4 error mapper path conflict). The baseRouter registration step for all 3 new routers (inventory, memberships, households) remains unplanned — coordinator must add imports + registrations after each agent delivers. `members.updateRole` input schema mismatch blocks Agent 2.1 integration without an explicit input change.
