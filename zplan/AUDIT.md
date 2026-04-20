# zplan/ Audit Ledger

**Last run:** 2026-04-20 (Streams B/C/D sealed)
**Sessions audited:** 6 (cumulative)
**Clean:** 2 · **Needs attention:** 4 · **Critical:** 0

## Sessions

| Status | Session | Summary | Report |
|--------|---------|---------|--------|
| 🟢 done | `Done_04-19_19-28_tier1-quick-wins` | Executed + chrome-tested: 8 PASS · 2 FAIL (pre-existing user-assignment crash + Enable All button fix both logged in web-gaps-skipped.md). Sealed 2026-04-20. | [report](Done_04-19_19-28_tier1-quick-wins/audit/report.md) |
| 🟢 done | `Done_04-20_12-09_pipeline-audit` | Streams A+B+C+D executed + chrome-tested: 8/8 SCs PASS (walk-in toggle, commissions ledger, service commission %, trainer commissions section). Sealed 2026-04-20. | [report](Done_04-20_12-09_pipeline-audit/audit/report.md) |
| 🟡 needs-attention | `04-19_19-31_tier4-new-surfaces` | 8/8 sections, 0 broken refs, NOT STARTED — 2 backend blockers (no `staffId` on `package_instances`; `appointments.list` missing `clientId` filter) | [report](04-19_19-31_tier4-new-surfaces/audit/report.md) |
| 🟡 needs-attention | `04-19_19-30_tier3-quality-bets` | 8/8 sections, 2 broken refs (wrong oRPC keys: `attendance`→`checkIns`, `commissions`→`commissionSplits`; Sentry+TanStack pattern wrong), pre-execution | [report](04-19_19-30_tier3-quality-bets/audit/report.md) |
| 🟡 needs-attention | `04-19_19-29_tier2-structural-cleanup` | 8/8 sections, 0 broken existing refs, 0 missing impact, 1 PM question open (§8.5 audience semantics), not executed — ready to run | [report](04-19_19-29_tier2-structural-cleanup/audit/report.md) |
| 🟡 needs-attention | `Semi-done_04-19_16-40_impersonation` | 8/8 sections, 1 broken ref (phantom `platform-admin.ts` in Phase 6), execution complete — `tenantAdmin.stopImpersonating` still TODO; seed missing credential account | [report](Semi-done_04-19_16-40_impersonation/audit/report.md) |

## How to act on this

- 🔴 **critical** — plan cannot be executed as-is; rewrite before any `/execute`.
- 🟡 **needs-attention** — plan is executable but has gaps; read the report and patch before shipping.
- 🟢 **clean** — ready to hand off.

## Top issues by session

### tier4-new-surfaces — BLOCKING before execution
1. `package_instances` has no `staffId` column — Phase 4E client-side join silently breaks. Add backend filter to `installments.adminOverview` first.
2. `appointments.list` has no `clientId` param — Phase 4F Appointments tab silently ignores the filter. Needs backend addition.
3. `cmdk` and `date-fns` not installed — `bun add cmdk` before Phase 4G; use `Intl.RelativeTimeFormat` instead of `date-fns`.

### tier3-quality-bets — Fix before execution
1. `orpc.attendance.list.key()` → `orpc.checkIns.list.key()` (router is `checkIns`)
2. `orpc.commissions.list.key()` → `orpc.commissionSplits.list.key()`
3. `Sentry.reactRouterV6BrowserTracingIntegration` → `Sentry.browserTracingIntegration()` for TanStack Router
4. `invalidateQueries` fix list incomplete — at least 6 additional files have raw-string invalidations not in §3.6

### tier2-structural-cleanup — Fix before execution (re-audited 2026-04-20 pass 2)
1. **D.1 incomplete** — `branch/view.tsx` also reads/writes `org_${organizationId}_hierarchy_timestamp` (lines 326, 356, 366, 373, 452, 547, 590, 635). Task D.1 must remove this key alongside `_hierarchy`; without it an orphan timestamp key persists after hardening.
2. **A.2 §3.5 note stale** — `announcements.ts` router already has `targetAudience` on line 93 (forwarded at line 125). Update §3.5 to "backend complete; frontend wiring only" so an executing agent doesn't re-do shipped work.
3. Get PM sign-off on §8.5 (audience semantics) before A.2 frontend changes land — backend is already live.

### impersonation (Semi-done) — Fix before production
1. `ImpersonationBanner` calls `admin.stopImpersonating` for both scopes — `tenantAdmin.stopImpersonating` is TODO; `member_sessions.endedAt` never closed on tenant-admin stop
2. `seed-platform-admin.ts` missing credential account upsert — silent login failure on fresh environments
