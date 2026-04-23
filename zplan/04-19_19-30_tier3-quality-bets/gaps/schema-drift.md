# Schema Drift Audit
**Session:** 04-19_19-30_tier3-quality-bets
**Lens:** schema-drift
**Findings:** 2 (0 critical · 1 high · 1 medium · 0 low · 0 info)

## Findings

### [HIGH] Missing `twoFactor` table schema definition before `bun db:generate`
**Plan claims:** Phase 3.6.2: "Run `bun db:generate` if the plugin requires new auth tables"
**Actual:** The `twoFactor` plugin WILL require two new schema additions: (1) a `twoFactor` table with `secret`, `backupCodes`, `userId` fields, and (2) a `twoFactorEnabled` boolean field on the `user` table. Neither exists in `packages/db/src/schema/auth.ts` currently (72 lines, no two-factor entries). `bun db:generate` compares the schema file against the DB — without updating the schema file first, it will generate no migration and Phase 3.6.2 will silently do nothing.
**File:** `packages/db/src/schema/auth.ts` (entire file — `twoFactor` table and `twoFactorEnabled` field both absent)
**Fix:** Add an explicit prerequisite step to Phase 3.6.2: update `auth.ts` to include the `twoFactor` pgTable and `twoFactorEnabled` boolean on the `user` table before running `bun db:generate`.

---

### [MEDIUM] Plan task 3.6.2 word order implies `db:generate` alone is sufficient
**Plan claims:** "Run `bun db:generate` if the plugin requires new auth tables" — conditional language implies generation may or may not be needed.
**Actual:** It IS required (see HIGH finding above). The "if" framing may lead an implementer to skip the schema-file update step. Additionally, the plan's risk section says "Run `bun db:generate` and `bun db:migrate` against the control-panel DB" but does not mention editing `auth.ts` first.
**File:** `zplan/04-19_19-30_tier3-quality-bets/plan/plan.md` (Phase 3.6.2 and §6 MFA risk paragraph)
**Fix:** Change "Run `bun db:generate` if the plugin requires new auth tables" to a 3-step task: (1) add `twoFactor` schema to `auth.ts`, (2) run `bun db:generate`, (3) run `bun db:migrate` on control-panel DB.

---

## Summary
All phases of this plan except 3.6 (MFA) are frontend-only and touch no DB schemas — zero schema drift in those areas. Phase 3.6 does require a control-panel DB migration, and the plan correctly identifies this need. However, it omits the prerequisite step of updating `packages/db/src/schema/auth.ts` with the `twoFactor` table and `twoFactorEnabled` user field before running code generation. Without this step, `bun db:generate` produces no migration and the MFA plugin will error at runtime. Fix the task wording before executing Phase 3.6.
