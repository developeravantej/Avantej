# Audit: 04-19_19-29_tier2-structural-cleanup

**Audited:** 2026-04-20 (pass 5 — fresh re-audit after pass 4 apply)
**Plan file:** plan/plan.md
**Status:** needs-attention

---

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 |
| Broken references (existing files) | 0 |
| New files (expected absent pre-execution) | 4 |
| Broken type references (file vs. folder) | 1 (Untitled — see §2, fixed this pass) |
| Missing impact callers | 0 critical |
| Unresolved questions | 4 active (§8.4 closed; §8.5 is A.2 blocker) |
| Execution state | not started |

---

## Findings

### 1. Structural completeness — 8/8

All 8 required sections present with substantive content:

| Section | Status |
|---------|--------|
| §1 Overview | PRESENT |
| §2 Result (Before/After) | PRESENT — 3 user-role tables |
| §3 Technical Architecture | PRESENT — 14 sub-sections with code samples |
| §4 User Journeys | PRESENT — 11 journeys each with "Where it lives" |
| §5 Phased Implementation | PRESENT — 4 phases A-D, each delivers >=1 journey |
| §6 Impact & Breakage | PRESENT — callers listed per change with grep commands |
| §7 Cross-Cutting Concerns | PRESENT — error handling, testing, migration, rollback |
| §8 Open Questions | PRESENT — 5 items (§8.4 resolved in-plan) |

---

### 2. Broken references

#### Files the plan will CREATE (expected absent — not broken)

| File | Created by |
|------|-----------|
| packages/db/src/migrations/tenant/0008_expenses_currency_myr.sql | Task A.1 |
| apps/web/src/components/ui/branch-combobox.tsx | Task B.1 |
| apps/web/src/components/ui/pagination-bar.tsx | Task B.5 |
| apps/web/src/components/ui/error-state.tsx | §7 Phase A |

#### Existing files — 0 broken

All 30 existing-file paths verified on disk. Key symbols confirmed present:

- `getUnreadCount`: packages/api/src/routers/notifications.ts:50
- `listNodes`: packages/api/src/routers/hierarchy.ts:188
- `requirePermission`: apps/web/src/lib/route-guards.ts:85
- `installments` + `installmentPlans`: packages/api/src/routers/index.ts:111-112
- `payouts.list`: packages/api/src/routers/payouts.ts:22 — flat array, no offset (before-state)
- `expenses.currency`: packages/db/src/schema/tenant/expenses.ts:21 default "usd" (before-state)
- announcements `targetAudience`: announcements.ts:93 forwarded at :125 — backend complete as plan notes
- `getMyCommissions`: packages/api/src/routers/commission-splits.ts — present
- `docs/TENANT_MIGRATION_WORKFLOW.md` — present
- `packages/db/src/migrate-tenant.ts` — present
- `zplan/AUDIT.md` — present
- `apps/server/src/tests/unit/services/announcements.test.ts` — present
- `apps/web/src/components/payroll-widget.tsx` — present (confirmed: uses `data.map()` directly; will break post B.6 without update)

#### `role/view.tsx` — confirmed non-existent (expected per §8.4 resolution)

`apps/web/src/routes/_authenticated/role/view.tsx` does not exist on disk — matches plan's §8.4 RESOLVED note. No action needed.

#### D.5 — `apps/server/src/Untitled` is a file, not a folder (minor factual error — fixed this pass)

The plan's §3.13 (line 346) and Task D.5 referred to `apps/server/src/Untitled/` with a trailing slash, implying a directory. On disk it is a **plain text file** (junk notes/chat transcript). §1 Overview correctly said `apps/server/src/Untitled` with no slash.
- **Auto-fix applied (pass 5):** Removed the trailing slash from §3.13 and Task D.5. `rm apps/server/src/Untitled` is the correct deletion command.

#### D.6 cross-reference — fixed by pass 4

`zplan/Semi-done_04-19_16-40_impersonation/` path in D.6 was corrected in pass 4. Confirmed correct in current plan.md.

---

### 3. Missing impact callers — 0 critical

All 5 files touching `user_organizations` / `org_*_hierarchy` confirmed and listed in §3.7 + D.1:
- `useUserContext.ts` — writes both keys
- `sign-in-form.tsx` — writes both keys on every sign-in
- `useAuth.ts` — removes keys on sign-out/org-switch
- `hierarchical-branch-form.tsx` — removes hierarchy key after branch mutations
- `branch/view.tsx` — reads/writes both `_hierarchy` and `_hierarchy_timestamp`

`payroll-widget.tsx:16` uses `data.map()` directly — will break post B.6. Listed at Task B.6 and §6. No gap.

`apps/server/src/tests/unit/services/announcements.test.ts` listed at Task A.2. No gap.

---

### 4. Unresolved questions

| # | Question | Status |
|---|----------|--------|
| §8.1 | File upload story (R2 vs third-party) | Deferred to Tier 3 |
| §8.2 | Cold load UX after localStorage removal | Acceptable trade-off; no action needed |
| §8.3 | Payouts total count display | Deferred to Tier 3 |
| §8.4 | Role view legacy route | RESOLVED in-plan |
| §8.5 | Announcements audience filter semantics | ACTIVE BLOCKER for A.2 — PM sign-off needed |

§8.5 blocks A.2 only. Phases A.1, A.3-A.5, B, C, D can proceed immediately.

---

### 5. Execution and verification gaps

- No `execute/log.md` — plan has not been executed
- No `chrome-test/` folder — browser verification not planned or run
- No `prompts/` folder — no handoff prompts generated
- `audit/applied.md` present — five cumulative apply passes (passes 1–5)

---

### 6. Implementation state (codebase snapshot, 2026-04-20)

No tasks have been executed — codebase is in the before-state throughout:

| Task | Current codebase state |
|------|----------------------|
| A.1 expenses currency | `expenses.currency` defaults to "usd" |
| A.4 commissions gate | `commissions/my.tsx` has no `beforeLoad` |
| A.5 customers permission | `customers.tsx` still uses `requirePermission("user_management:read")` |
| B.6 payouts pagination | `payouts.ts` has no `offset` param; returns flat array |
| D.1 localStorage hardening | `useUserContext.ts` + `sign-in-form.tsx` still write both sensitive keys |
| D.2 legacy route deletion | All 4 legacy routes still exist on disk |
| D.4 root junk cleanup | 3 .md files still at repo root (plan correctly scoped to these 3) |
| D.5 Untitled cleanup | `apps/server/src/Untitled` file still exists |
| D.6 AUDIT.md entry | `Semi-done_` folder absent from AUDIT.md (path in plan.md now correct) |

---

## Priority Actions

1. **Get PM sign-off on §8.5 before starting A.2** — all other phases unblocked immediately.

2. **Fix the `_hierarchy_timestamp` cleanup filter before executing D.1** — the TODO (audit) comment in the D.1 useUserContext.ts snippet marks the specific filter line. Also ensure `useAuth.ts` sign-out removes timestamp keys (TODO comment present there too).

3. **Run `/execute` or `/execute-pro`** — Phases A (A.1, A.3, A.4, A.5), B, C, D are unblocked. A.2 waits on §8.5.

4. **After execution, run `/chrome-run`** against §1 success criteria.

---

## Status rationale

**needs-attention**: 8/8 structurally complete, 0 broken refs to existing files. One minor factual error fixed this pass (Untitled is a file not a folder — trailing slash removed in §3.13 and D.5). Prior passes fixed critical D.1 impact gaps. Two pre-execution items remain: (a) `_hierarchy_timestamp` cleanup gap in D.1 snippet (TODO comment visible to executor); (b) PM sign-off needed for §8.5 (A.2 only). Plan not yet executed.
