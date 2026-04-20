# zplan/ Audit Ledger

**Last run:** 2026-04-20 (combined audit+apply pass 3)
**Sessions audited:** 3
**Clean:** 0 · **Needs attention:** 3 · **Critical:** 0

## Sessions

| Status | Session | Summary | Report |
|--------|---------|---------|--------|
| 🟡 needs-attention | `04-19_19-31_tier4-new-surfaces` | 8/8 sections, 0 remaining broken refs (3 fixed: listForClient→listAll, 2 date-fns), Phase 4E/4F still [BLOCKED] — require human scope decision, not started | [report](04-19_19-31_tier4-new-surfaces/audit/report.md) |
| 🟡 needs-attention | `04-19_19-30_tier3-quality-bets` | 8/8 sections, 0 broken refs (useBlocker API fixed this pass), Q2 Sentry DSN owner unassigned — human decision required, not started | [report](04-19_19-30_tier3-quality-bets/audit/report.md) |
| 🟡 needs-attention | `04-19_19-29_tier2-structural-cleanup` | 8/8 sections, 0 broken refs (Untitled trailing slash fixed), 2 human-decision items: D.1 localStorage filter TODO + §8.5 PM sign-off (A.2 only), not started | [report](04-19_19-29_tier2-structural-cleanup/audit/report.md) |

## How to act on this

- 🔴 **critical** — plan cannot be executed as-is; rewrite before any `/execute`.
- 🟡 **needs-attention** — plan is executable but has gaps; read the report and patch before shipping.
- 🟢 **clean** — ready to hand off.

## Remaining blockers (human decisions required)

All three plans are structurally sound with 0 broken refs. The only remaining needs-attention items are decisions that require a human:

| Plan | Blocker | Who |
|------|---------|-----|
| Tier 2 | §8.5 — announcements audience filter semantics (PM sign-off before A.2) | PM |
| Tier 3 | Q2 — Sentry DSN: who creates the project and sets env var before Phase 3.1 | Team lead |
| Tier 4 | Phase 4E — `staffId` absent from `package_instances`; decide: defer to Tier 5 or redesign | Backend owner |
| Tier 4 | Phase 4F — `appointments.list` has no `clientId` param; decide: defer or add backend param | Backend owner |
