# Audit Apply: 04-19_19-31_tier4-new-surfaces

**Applied:** 2026-04-20
**Source report:** audit/report.md (audited 2026-04-20)
**Plan file:** plan/plan.md
**Freshness:** ok

## Summary
| Category | Count |
|----------|-------|
| Broken refs auto-fixed | 1 (3 occurrences updated) |
| Broken refs left as TODO/blocker | 2 |
| Prerequisites added | 1 |
| Notes added | 2 |
| Deferred (process gaps) | 4 |

## Changes

### Auto-fixes
- `customerDirectory.getById` field name mismatch: changed `id` → `memberId` at three plan locations:
  - Line 281 (component pseudocode in §3G)
  - Line 306 (API calls list in §3G)
  - Line 635 (Phase 4F task 4F.2)

### TODOs/Blockers injected
- Phase 4E heading: `<!-- TODO (audit): BLOCKED — package_instances has no staffId column. Backend prereq: add staffId filter to installments.adminOverview (per Q4) before this phase. -->`
- Phase 4F heading: `<!-- TODO (audit): BLOCKED — appointments.list has no clientId/userId param. Backend prereq: add clientId filter to appointments router input schema. -->`

### Prerequisites added
- Phase 4G: `**Prerequisite:** Run \`bun add cmdk\` in apps/web before starting this phase (audit verified: not currently installed).`

### Notes added
- Phase 4D: `**Note:** Use \`Intl.RelativeTimeFormat\` for relative time display (audit verified: date-fns not installed in apps/web).`
- Phase 4G task 4G.6 (sales search): inline `<!-- audit: confirmed Q8 fallback (client-side filter over cached list) is the only viable path; salesOrders.list has no search param. -->`

### Deferred
- No execute/log.md → run `/execute` after backend prereqs done
- No chrome-test/ → run `/chrome-plan` after execution
- No research/brief.md
- No prompts/

## Next steps
1. Resolve backend prereqs (staffId filter on installments.adminOverview, clientId filter on appointments.list) before Phase 4E/4F
2. Run `bun add cmdk` in apps/web
3. Re-run /audit to verify
