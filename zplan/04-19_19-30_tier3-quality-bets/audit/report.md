# Audit Report — 04-19_19-30_tier3-quality-bets

**Audited:** 2026-04-20  
**Plan status:** Pre-execution (no execute/chrome-test/research/prompts artifacts found)

---

## Step 2 — Structural Completeness

**Score: 8/8** — all required sections are present with substantive content.

| # | Section | Status |
|---|---------|--------|
| 1 | Overview | Present — describes all 6 problem areas with specifics (82 toast files, 51 routes, 8 key patterns, etc.) |
| 2 | Result (Before/After) | Present — comprehensive table per feature area |
| 3 | Technical Architecture | Present — 10 subsections (3.1–3.10) with code samples |
| 4 | User Journeys (with "Where it lives") | Present — 11 journeys (4.1–4.11) with old/new narrative |
| 5 | Phased Implementation | Present — 7 phases each delivering ≥1 journey |
| 6 | Impact & Breakage Analysis | Present — 4 risk areas with mitigations |
| 7 | Cross-Cutting Concerns | Present — env vars table, multi-phase file table, Turborepo pipeline note |
| 8 | Open Questions / Risks | Present — 7 questions (Q1–Q7) |

**Thin areas:**
- Section 4 (User Journeys): "Where it lives" is implicit in journey descriptions but never stated as an explicit sub-header. Minor.
- Section 6 does not list importers of the modified shared files — only risk categories. See Step 4.

---

## Step 3 — Codebase Alignment (Broken References)

### File Paths

All existing source files referenced in the plan exist. All plan-created files (sentry.ts, toast.ts, date.ts, DashboardErrorBoundary.tsx, skeletons/index.tsx, MfaSetupDialog.tsx, useUnsavedGuard.ts, mfa-setup.tsx, mfa-verify.tsx, loading.tsx) are correctly absent — they are to be created by the plan.

### BROKEN — oRPC Key Names in §3.6 Table

The plan's invalidateQueries fix table uses wrong router key names. Actual keys in `packages/api/src/routers/index.ts`:

| Plan says | Actual oRPC key | Note |
|-----------|----------------|------|
| `orpc.attendance.list.key()` | `orpc.checkIns.list.key()` | Router registered as `checkIns` |
| `orpc.attendance.todayBookings.key()` | `orpc.checkIns.listTodaysBookings.key()` | Procedure name also differs |
| `orpc.commissions.list.key()` | `orpc.commissionSplits.list.key()` or `orpc.commissionSplits.listLedger.key()` | Router registered as `commissionSplits` |

Using the plan's names will silently fail to invalidate anything.

### BROKEN — Sentry Router Integration

Plan §3.2 shows `Sentry.reactRouterV6BrowserTracingIntegration` as primary example. TanStack Router is not React Router v6; this integration hooks into React Router's `useLocation`/`useNavigationType` and will not instrument TanStack Router navigation. The plan acknowledges this as an approximation but the code sample is still misleading.

**Recommended fix in plan:** Replace with `Sentry.browserTracingIntegration()` as the default; note that TanStack Router has no first-party Sentry integration.

### Packages Not Yet Installed (expected — plan requires installing)

- `@sentry/react` — not in node_modules
- `rollup-plugin-visualizer` — not installed
- `size-limit` / `@size-limit/preset-app` — not installed

These are correctly described as installation steps in the plan, not pre-existing.

---

## Step 4 — Impact Coverage Gaps

### MISSING IMPACT: Incomplete `invalidateQueries` Offender List (§3.6)

The plan's table lists 6 files but the codebase has raw-string invalidations in additional unlisted files:

| File | Raw key found | Plan mentions? |
|------|--------------|----------------|
| `components/customers/customer-detail-sheet.tsx` | 2 raw-key calls | NO |
| `components/forms/hierarchical-branch-form.tsx` | `["user-context"]` | NO |
| `components/merge-tables/inventory-options-dashboard.tsx` | `["suppliers", organizationId]` (3 calls) + more | Partially (only `["brands"]` listed) |
| `components/merge-tables/unit-of-measure-dashboard.tsx` | multiple raw-key calls | NO |
| `components/invitations/invitations-page.tsx` | `["invitations", organizationId]` (3 calls) | Listed but key pattern not shown |

Phase 3.3 task 3.3.2 says "fix the offenders listed in §3.6" — implementors following the table will miss at least 6 additional files/sites.

### MISSING IMPACT: `auth-client.ts` Already Modified

Section 6 does not flag that `apps/web/src/lib/auth-client.ts` (currently modified on the branch per git status) also needs the `twoFactorClient` plugin for Phase 3.6 (step 3.6.3). This creates a potential conflict or omission if the branch modification and the MFA change are not coordinated.

### Other Modified Files

- `__root.tsx`, `_layout.tsx`, `vite.config.ts`, `main.tsx` — no additional manual importers; auto-consumed by routeTree or build system. Coverage OK.
- `bulk-action-bar.tsx`, `drop-in-form.tsx`, `today-bookings.tsx` — used directly in route pages, no wrappers. Coverage OK.

---

## Step 5 — Execution & Verification State

Session folder (`zplan/04-19_19-30_tier3-quality-bets/`) contains only `plan/plan.md`, `META.md`, and `audit/`.

| Artifact | Status |
|----------|--------|
| `execute/log.md` | MISSING — no execution started |
| `chrome-test/plan.md` | MISSING |
| `chrome-test/results.md` | MISSING |
| `research/brief.md` | MISSING |
| `prompts/` | MISSING |

**Status: Pre-execution.** Plan written; implementation not yet begun. This is expected.

---

## Step 6 — Unresolved Questions

No `TBD`, `???`, `decide later`, or `unresolved` markers in the plan. All 7 open questions in Section 8 have explicit recommendations or deferred-to-implementation notes. One `TODO` reference (§3.3, PostHog comment) is an intentional code placeholder, not a planning gap.

**No blocking unresolved questions.**

---

## Step 7 — Issues Summary

### HIGH — Wrong oRPC Key Names
`orpc.attendance.*` and `orpc.commissions.*` do not exist. Correct keys: `orpc.checkIns.*` and `orpc.commissionSplits.*`. Will produce silently broken invalidation if followed literally.

### MEDIUM — Incomplete Offender List
§3.6 table understates raw-string `invalidateQueries` scope by at least 6 additional files/call sites not mentioned.

### MEDIUM — Sentry Integration Mismatch
`reactRouterV6BrowserTracingIntegration` will not instrument TanStack Router. Plan acknowledges this but the primary code sample uses it.

### LOW — `auth-client.ts` Conflict Risk
Currently modified on branch; Phase 3.6 step 3.6.3 also modifies it. Not flagged in Section 6 impact analysis.

### INFORMATIONAL — Timezone Scope Wider Than Estimated
Plan identifies 3 files for timezone fixes. Audit finds `en-US` without timezone in at least 10 additional files: `calendar/appointment.tsx` (4 occurrences), `dialogs/supplier-details-dialog.tsx`, `forms/service-category-detail-dialog.tsx`, `forms/service-detail-dialog.tsx`, table column formatters in `cancelled-sales`, `package-instances`, `packages`, `payment`, `payouts`, `role`, `sales` columns, and `invitations/invitation-list.tsx`.

### INFORMATIONAL — Route Count Accurate
Plan states "51-dashboard-page route tree." Audit confirms exactly 51 `.tsx` files under `_layout/`. Accurate.

---

## Verdict

**needs-attention — 8/8 sections, 2 broken refs (oRPC key names, Sentry integration pattern), pre-execution**
