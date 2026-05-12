# Audit: 04-19_16-40_impersonation

**Audited:** 2026-04-20 (post-execution re-audit; prior audit was 2026-04-19 18:30 pre-execution)
**Plan file:** plan/plan.md
**Status:** needs-attention

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Structural completeness | 8/8 | All sections present with real content; Appendix D added post-run |
| File refs verified | 27/28 exists; 1 phantom path in Phase 6 files list | `packages/api/src/routers/platform-admin.ts` referenced in Phase 6 but never created |
| Symbol refs verified | All confirmed | `MIGRATION_0025_MEMBER_SESSIONS`, `syncUserRole`, `getPlatformAdmin`, `getFirstActiveOrgForUser`, `tenantAdminRouterType`, `getImpersonationStatus` all present |
| Impact coverage | 2 minor gaps | `_authenticated/user/view.tsx` (covered in Appendix A but not §6 table); `app-layout.tsx` unlisted |
| Unresolved questions | 3 open (OQ4-OQ6 deferred) + 1 new unactioned item | Seed script credential-account gap documented but not fixed |
| Execution | Complete — all 7 phases | execute/log.md present with all phase completion entries |
| Chrome test | Pass — 9/9 checkpoints | 2 bugs found and fixed during run; overall result: pass |
| Plan-vs-impl deviations | 3 noted | Banner TODO, seed gap, wrong sign-in URL |

---

## Findings

### Structural Gaps — None

All 8 required sections are present with substantive content. Appendix A has a grepped call-site list. Appendix D (added post-run 2026-04-20) captures verification notes and bug fixes from the chrome run. Section quality is above minimum.

---

### Broken References

**1 phantom file path — Phase 6 files list (plan line 550):**

```
packages/api/src/routers/platform-admin.ts (modify — classify `type` in status)
```

This file does not exist and was never created. The `getImpersonationStatus` type-classification (`type: 'platform' | 'tenant'`) was implemented inside `apps/server/src/routers/admin.ts` (confirmed at line 508–550 of that file). The Phase 6 files list contains a stale reference that contradicts the plan's own §3 architecture and Phase 2 spec. The prior audit (2026-04-19) had identified `apps/server/src/server.ts` and `apps/server/src/scripts/migrate-tenant.ts` as broken refs; those were resolved by the implementation team selecting correct paths (`apps/server/src/index.ts` and `packages/db/src/migrate-tenant.ts`).

**1 router location discrepancy — documentation misleading but not a code bug:**

Phase 6 lists `packages/api/src/routers/tenant-admin.ts (new)` as a file to create. The actual implementation is in `apps/server/src/routers/tenant-admin.ts` (consistent with server-only procedures requiring Better-Auth). The type stub correctly lives in `packages/api/src/routers/index.ts` as `tenantAdminRouterType`. Not a runtime defect, but the plan text leads future readers to the wrong location.

---

### Missing Impact Coverage

**`apps/web/src/routes/_authenticated/user/view.tsx`** — imports `columns.tsx` (confirmed via grep). The plan's Appendix A notes this consumer and states the button must render null there (`callerIsAdmin: false` via backwards-compat alias). However this route is absent from §6 Impact & Breakage table. The Phase 7 execute agent handled it correctly, but the impact table should record it.

**`apps/web/src/components/app-layout.tsx`** — imports `AppSidebar` from `app-sidebar.tsx`, which the plan modifies (adds conditional links). Not listed anywhere in impact section. Change is additive and cannot break the importer, but it is an unlisted caller.

**`apps/web/src/components/sign-in-form.tsx`, `sign-up-form.tsx`, `user-menu.tsx`, `useAuth.ts`, `route-guards.ts`, `accept-invitation.tsx`, `_authenticated.tsx`** — all import from `auth-client.ts`. The `adminClient()` plugin addition is purely additive and cannot break callers. Not listed in §6. No risk, but incomplete.

---

### Unresolved Questions

Three open questions are explicitly deferred with rationale (OQ4–OQ6 in §8, all acceptable):

- **OQ4** — Prod bootstrap: first super admin must be granted via one-off SQL; seed script is dev-only. Documented, deferred to deployment runbook.
- **OQ5** — Multi-org target pick on platform impersonation: first by `joinedAt`. Deferred enhancement.
- **OQ6** — Banner styling sign-off. Pending design review.

**New unactioned item from Appendix D Bug 1.0 (plan line 787):**

The plan explicitly documents: "In a fresh environment (or after a DB reset/restore), the seed script will succeed but login will silently fail until a credential account with a scrypt-format password is created. Consider extending the seed script to also create/repair the credential account if missing."

This gap was surfaced during the chrome run (Bug 1). The data-layer fix was applied to the dev DB during the run. No code change was made to `apps/server/scripts/seed-platform-admin.ts` to prevent recurrence in future environments. The plan documents the gap but no follow-up task was created.

---

### Execution & Verification State

| Artifact | Status |
|----------|--------|
| `execute/log.md` | Present — all 7 phases documented with completion timestamps |
| `chrome-test/plan.md` | Present |
| `chrome-test/results.md` | Present — overall: **pass**; 9/9 checkpoints green |
| `research/` | Absent — no research phase planned (Better-Auth plugin pre-existing) |
| `prompts/` | Absent — no orchestrator handoff used |

**Chrome run — 2 bugs found and fixed during the run:**

1. **developer.avantej credential account missing / wrong hash algorithm** (Bug 1) — `auth.api` requires scrypt format; dev DB had no credential account. Fixed by manual DB repair during run. Seed script not updated to prevent recurrence.

2. **Tenant admin impersonation blocked by Better-Auth `user.role` check** (Bug 2) — `auth.api.impersonateUser` requires `user.role === 'admin'` (platform-level); tenant admins have `member.role === 'admin'` but `user.role === 'user'`. Fixed in `apps/server/src/routers/tenant-admin.ts` by temporarily elevating `user.role` before the call and restoring in `finally`. This code change is committed to the branch. Plan Phase 6.5 does not document this elevation pattern — future maintainers may not understand its purpose.

**Additional chrome-run finding:** `MIGRATION_0025_MEMBER_SESSIONS` had not been applied to the existing Test Fitness Franchise tenant DB before the run. Fixed by running `apps/server/scripts/run-tenant-migrations.ts`. This validates the risk listed in §8 ("Concurrent deploy: Phase 6 API ships before tenant migration applied to all branches") — it materialized in dev even on a single-branch setup.

---

### Known Plan-vs-Implementation Deviations

1. **`ImpersonationBanner` does not route to `tenantAdmin.stopImpersonating`** — the banner always calls `admin.stopImpersonating` with a `// TODO Phase 6/7` comment at line 18–21 of `apps/web/src/components/impersonation-banner.tsx`. Plan Phase 3 §3.2 specifies: "Stop button calls `admin.stopImpersonating` if `type === 'platform'`, else `tenantAdmin.stopImpersonating`." The tenant path is not wired. Functional consequence: clicking Stop during a tenant-admin session calls the platform stop endpoint, which should still clear the session cookie, but `member_sessions.endedAt` is never updated. Audit trail stays open until the nightly cron (deferred enhancement, Phase 5.3).

2. **Seed script credential gap** — documented in Appendix D Bug 1.0 but not resolved in code.

3. **Wrong sign-in URL in chrome-test/plan.md** — plan references `/sign-in`; actual route is `/login`. Noted in chrome-test/results.md but chrome-test/plan.md was not corrected.

4. **Stale migration insertion point in plan body** — Phase 6.3 / Phase 6 files list and Appendix A (lines 520, 545, 727) state "add migration constant after `MIGRATION_0019_AUDIT_LOGS`". The actual implementation inserted `MIGRATION_0025_MEMBER_SESSIONS` after `MIGRATION_0024_COMMISSION_SPLITS_STATUS` (constants 0022–0024 existed before this feature). The plan text is misleading for the next migration author.

---

## Priority Actions

| Priority | Action |
|----------|--------|
| P1 | Fix `ImpersonationBanner` to call `tenantAdmin.stopImpersonating` when `type === 'tenant'` — without this, `member_sessions.endedAt` is never set on tenant-admin stop |
| P2 | Extend `apps/server/scripts/seed-platform-admin.ts` to upsert a valid scrypt credential account — prevents silent login failure in fresh environments |
| P3 | ~~Add explanatory comment in `apps/server/src/routers/tenant-admin.ts` around the `user.role` elevation block~~ — **DONE** (comment already present at lines 113–116 of that file; adequately explains the elevation pattern) |
| P3 | Fix plan Phase 6 files list: replace phantom `packages/api/src/routers/platform-admin.ts` with `apps/server/src/routers/admin.ts` |
| P4 | Add `apps/web/src/routes/_authenticated/user/view.tsx` and `app-layout.tsx` to §6 impact table |
| P4 | Update `chrome-test/plan.md`: `/sign-in` → `/login` |

---

## Status Rationale

**needs-attention** — The plan is structurally complete (8/8 sections), execution is done (all 7 phases), and chrome testing passed (9/9 checkpoints). Findings that prevent `clean`:

- 1 phantom file reference in Phase 6 files list (`packages/api/src/routers/platform-admin.ts`)
- `ImpersonationBanner` tenant stop routing is a TODO — `member_sessions.endedAt` audit trail is broken for tenant-admin sessions (P1)
- Seed script credential gap documented but unresolved in code (P2)
- 2 minor impact table omissions

None are critical blockers preventing merge, but P1 (audit trail gap) should be resolved before the branch ships to production.
