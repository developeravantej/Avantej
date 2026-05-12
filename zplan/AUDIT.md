# zplan/ Audit Ledger

**Last run:** 2026-05-04 17:45
**Sessions audited:** 3
**Clean:** 0 · **Needs attention:** 3 · **Critical:** 0

## Sessions

| Status | Session | Summary | Report |
|--------|---------|---------|--------|
| 🟡 needs-attention | `05-04_17-18_coach-intake-availability` | 8/8 sections, 0 broken refs, 2 plan corrections applied (schema path, UNIQUE constraint DDL) — re-audit pending | [report](05-04_17-18_coach-intake-availability/audit/report.md) |
| 🟡 needs-attention | `04-30_14-30_trainer-selection-buy-flow` | 8/8 sections, 2 broken refs fixed (SummaryRow, test files), audit-applied — re-audit pending | [report](04-30_14-30_trainer-selection-buy-flow/audit/report.md) |
| 🟡 needs-attention | `04-29_20-57_package-approval-flow` | 8/8 sections, 8 broken/wrong-path refs, 6 unlisted callers, not executed | [report](04-29_20-57_package-approval-flow/audit/report.md) |

## How to act on this

- 🔴 **critical** — plan cannot be executed as-is; rewrite before any `/execute`.
- 🟡 **needs-attention** — plan is executable but has gaps; read the report and patch before shipping.
- 🟢 **clean** — ready to hand off.
