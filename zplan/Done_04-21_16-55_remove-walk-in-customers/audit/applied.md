# Audit Apply: 04-21_16-55_remove-walk-in-customers

**Applied:** 2026-04-21 17:30
**Source report:** audit/report.md (audited 2026-04-21 17:20)
**Plan file:** plan/plan.md
**Freshness:** ok — plan was last modified before the audit; applied cleanly.

> Note: the audit agent returned its report content but never wrote it to disk.
> `audit/report.md` was materialized from the agent's return value at apply time.
> This does not affect the applied edits — the report content is identical to
> what the agent produced.

## Summary
| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 0 |
| Broken refs left as TODO | 0 |
| Callers added to impact section | 1 (`packages/api/src/routers/pos.ts`) |
| Structural sections stubbed | 0 |
| Task additions | 1 (Task 1.4b) |
| Unresolved questions consolidated | 0 (Q1 already in §8 Open Questions) |
| Deferred (process gaps) | 4 (research, execute, chrome-test, prompts) |

## Changes

### Auto-fixes

1. **Phase 1 Task 1.4 — tightened import-drop note** (`pos.service.ts` schema import).
   Before: `**Drop unused imports:** walkInCustomers from drizzle schema, ilike/or if no longer referenced.`
   After: same line + explicit caveat that the `walkInCustomers` schema import may still be needed by the `walkInCustomerId` column write inside `createSalesOrder`; re-grep before removing. Prevents a likely type break if implementer drops the import before Task 1.4b lands.

2. **Phase 1 Task 1.4b added — remove legacy walk-in lookup in `createSalesOrder`** (lines 274–289 of `pos.service.ts`).
   - Inserted as a new task between Task 1.4 and Task 1.5.
   - Specifies the exact lines to delete (`else if (input.customerId !== "anonymous") { walkInCustomers.findFirst(...) }`).
   - Includes the expected edit shape, interaction notes with Task 1.4 import cleanup, and acceptance criteria.
   - Addresses audit Priority Action 1.

3. **Phase 1 "Files touched" — added `packages/api/src/routers/pos.ts`** as "verify only — imports `searchPosCustomers`; confirm no type regressions after Task 1.4." Addresses audit Priority Action 2.

4. **Appendix A — `pos.service.ts` row updated** to include Task 1.4b and the dead-code removal scope.

5. **Appendix A — `packages/api/src/routers/pos.ts` row added** as "verify only."

### TODOs injected

None. All findings were unambiguous enough to auto-fix.

### Deferred (process gaps)

- No `execute/log.md` → run `/execute` or `/execute-pro` when ready to implement.
- No `chrome-test/` → run `/chrome-plan` before verifying the drop-in form and customers page in the browser.
- No `research/brief.md` → not needed; the plan already references primary source files directly.
- No `prompts/` → not needed unless splitting into parallel agent handoffs via `/orchestrator`.

### Unresolved questions

Q1 (display-name persistence sign-off) is already properly consolidated in the plan's `§8 Open Questions / Risks` section, including the explicit "Confirm with user before Phase 1 lands" directive. No plan edit required — this is a decision gate, not a plan gap. User still needs to confirm before Task 1.1 (the irreversible tenant-DB migration) begins.

## Next steps

1. **User decision:** confirm Q1 — persist display name to `check_ins.client_display_name` (YES per current plan) or strip the column (Task 1.1 + 1.3 + field in 2.1).
2. Re-run `/audit 04-21_16-55_remove-walk-in-customers` to confirm status flips to `clean`.
3. When ready to implement, run `/execute` or `/execute-pro` — the plan now covers the dead-code removal and the router verification step.
