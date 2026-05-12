# Doc Consistency Audit — Post-Apply Re-Run
**Session:** zplan/05-06_09-12_schema-relationship-fixes
**Run:** 2nd pass (after --apply amendments)
**Findings:** 4 (C 2 · H 2)

---

## Findings

### [CRITICAL] Agent 1.1 owner-files still references old migration filename `0009_...`
**Plan claims (post-apply):** Phase 1 header has AF8 renumber warning: "All Phase 1-2 migrations must be renumbered to 0021+"
**Actual:** Agent 1.1 owner-files section still lists:
```
- packages/db/src/migrations/tenant/0009_fix_walk_in_customer_actions.sql (NEW)
```
`0009` is already taken by `0009_majestic_switch.sql`. The AF8 warning applies globally but the individual section was not updated.
**File:** Plan §5 Agent 1.1 owner-files
**Fix:** Update to `0021_fix_walk_in_customer_actions.sql` (or whichever 0021+ slot is assigned). All agent owner-files sections with `00XX_` filenames need the same treatment — see schema-drift.md for the full renumbering map.

---

### [CRITICAL] Error mapper path inconsistency — two contradictory paths in Agent 2.4
**Plan claims (owner-files):** `apps/server/src/orpc-error-mapper.ts`
**Plan claims (inline annotation added by --apply):** `apps/server/src/lib/orpc-error-mapper.ts`
**Actual:** Neither path exists yet — this is a new file to be created. But Agent 2.4 now contains two conflicting canonical paths in the same section. Any agent implementing this will guess one path; the other reference will become a dangling import.
**File:** Plan §5 Agent 2.4 owner-files (top) vs. audit annotation (body)
**Fix:** Standardize to `apps/server/src/lib/orpc-error-mapper.ts` (consistent with `apps/server/src/lib/` convention for server utilities). Edit owner-files entry to match.

---

### [HIGH] Agent 3.2 owner-files still references non-existent `customers.ts` router
**Plan claims (post-apply):** Section 6 annotation corrects router name to `customerProfiles`/`customerDirectory`
**Actual:** Agent 3.2 owner-files section still lists `packages/api/src/routers/customers.ts (modify)`. The section 6 fix was applied to the impact table but not to the Agent 3.2 section itself.
**File:** Plan §5 Agent 3.2 owner-files
**Fix:** Update Agent 3.2 owner-files to `packages/api/src/routers/customer-profiles.ts (modify)` — this is the router that manages customer profile fields the walk-in conversion (3.5) produces

---

### [HIGH] Agent 2.5 owner-files still lists `commission.service.ts` (not corrected in agent section)
**Plan claims (post-apply):** Conflict matrix (AF2) and section 6 (AF3) were updated to show 3 real commission service files
**Actual:** Agent 2.5 owner-files section itself still says `packages/services/src/commission.service.ts (extend)`. The AF2/AF3 annotations corrected the conflict matrix and section 6, but the Agent 2.5 task brief was not updated.
**File:** Plan §5 Agent 2.5 owner-files
**Fix:** Replace with the 3 real files (with clarified ownership):
```
- packages/services/src/commission-splits.service.ts (extend — add snapshotConfigVersion)
- packages/services/src/commission-calculator.service.ts (read-only — call existing methods)
- packages/services/src/category-commission.service.ts (read-only — no changes)
```

---

## Summary

`--apply` successfully updated: Phase 3 sequencing header (AF1), conflict matrix filenames (AF2/AF3), Phase 0 scope (AF4/AF5), Task 1.2 validation annotation (AF6), Agent 2.10 scope reduction (AF7), Phase 1 renumber warning (AF8), section 6 router names, §7 FK index checklist, and Q1/Q5 resolutions. Four items remain uncorrected: the stale migration filename in Agent 1.1 (and implicitly all other agent sections), the error mapper path conflict introduced by the annotation itself, and two agent owner-files sections that weren't updated when their corresponding section-6/conflict-matrix entries were. No new doc consistency issues were introduced. The plan is structurally sound — these 4 findings are all mechanical fixes resolvable in a single targeted edit pass.
