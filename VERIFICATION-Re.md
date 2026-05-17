# Plan F.4 — Agent Re — Renewals Calendar — VERIFICATION

Branch: `plan-f-4-ops` (HEAD started at `e6e5662 docs(plan-f): F.3.5 ADR-0034 tier change + coupons + runbook`).

## Files created

- `apps/server/src/routers/platform-admin-renewals.ts`
- `apps/server/src/routers/platform-admin-renewals.test.ts`
- `apps/web/src/components/platform-admin/renewals-calendar-grid.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/renewals.tsx`
- `apps/web/e2e/tests/ship/plan-f-4/Re-renewals.spec.ts`
- `verification/plan-f-4/Re-renewals.webm` (Playwright video, ~186 KB)

## Files patched (surgical)

- `apps/server/src/index.ts` — added `platformAdminRenewalsRouter` import + top-level mount `platformAdminRenewals: platformAdminRenewalsRouter`.
- `packages/api/src/routers/index.ts` — added `platformAdminRenewalsRouterType` type stub (mirrors `platformAdminRevenueRouterType` style) + mounted at top-level of `appRouter`.
- `apps/web/src/routeTree.gen.ts` — regenerated automatically by Vite/TanStack Router plugin on dev start (13 occurrences of `renewals` confirmed).

No new schema, no new migration. Pure read-only DB queries against `subscriptions` + `organizations`.

## Symbols (match spec verbatim)

- `export const platformAdminRenewalsRouter = { ... }` ✓
- Type stub: `platformAdminRenewalsRouterType` ✓
- Top-level mount key: `platformAdminRenewals: platformAdminRenewalsRouter` ✓
- Component: `RenewalsCalendarGrid` ✓
- Helper exported for testing: `getISOWeekStart(date: Date): Date`

## API design — `platformAdminRenewals.getCalendar`

| Aspect | Detail |
| ------ | ------ |
| Gate | `requirePlatformAdmin` middleware (mirrors `platformAdminRevenue`). Any role (super_admin, support, billing) — read-only. |
| Input | `{ daysAhead: int.min(7).max(180).default(90) }` |
| Queries | 2 SELECTs: (1) upcoming renewals in `[now, now+N days]` with `status IN ('active','trialing','past_due','unpaid')`, (2) all past_due/unpaid orgs (regardless of period_end) ordered by `currentPeriodEnd ASC` (oldest first). |
| Bucketing | ISO week, Monday 00:00 UTC start. Weeks are pre-seeded across the full window so empty weeks render as "No renewals this week" rather than disappear. |
| MRR | Derived from `subscriptions.tier × TIER_PRICES_USD_CENTS` (same placeholder source as `platformAdminRevenue`). |
| Audit | None (read-only, per spec). |

### Response shape

```ts
{
  weeks: Array<{
    weekStartISO: string;   // Monday 00:00 UTC
    weekEndISO: string;
    renewals: Array<{
      orgId, orgName, tier, mrrCents,
      currentPeriodEnd, status,
      cancelAtPeriodEnd, daysUntil
    }>;
    totalMrrAtRiskCents: number;   // sum of cancelAtPeriodEnd renewals
    totalMrrPassingCents: number;  // sum of normal renewals
  }>;
  pastDue: Array<{
    orgId, orgName, tier, mrrCents, currentPeriodEnd, status
  }>;
  summary: {
    totalRenewalsInWindow,
    totalMrrAtRiskCents,
    totalMrrPassingCents,
    pastDueCount
  };
}
```

### Week-bucketing approach

- `getISOWeekStart(date)` converts any `Date` into the Monday 00:00 UTC of its ISO week (Sunday treated as part of the prior week — diff = `dow === 0 ? -6 : 1 - dow`).
- For the contiguous-bucket invariant: walk `firstWeekStart` (= `getISOWeekStart(now)`) by 7 days at a time until past `windowEnd`, seeding an empty bucket per week. Then assign each renewal row to its bucket by hash key (`weekStart.toISOString()`).
- `summary.totalMrrPassingCents === Σ week.totalMrrPassingCents` and likewise for at-risk — asserted in both the unit and e2e tests.

## Unit test (bun)

```
$ cd apps/server && bun test src/routers/platform-admin-renewals.test.ts

bun test v1.3.3 (274e01c7)

 4 pass
 0 fail
 47 expect() calls
Ran 4 tests across 1 file. [3.29s]
```

Test seeds 5 subs:
- sub 1: active, +3 days, basic tier (passing).
- sub 2: active, +10 days, professional, `cancelAtPeriodEnd=true` (at-risk).
- sub 3: trialing, +25 days, enterprise (passing).
- sub 4: past_due, -5 days, basic (past-due, oldest).
- sub 5: unpaid, -2 days, professional (past-due).

Assertions cover:
1. `getISOWeekStart` returns Monday 00:00 UTC for Sunday, Wednesday, and Monday-at-23:59 inputs.
2. Per-week invariant `passSum/riskSum` matches `totalMrrPassingCents/totalMrrAtRiskCents`; summary totals equal Σ across weeks.
3. Past-due ordering: ORG(4) (-5d) precedes ORG(5) (-2d); global non-decreasing ordering.
4. `daysAhead=30` produces ≤ weeks of `daysAhead=90`.

## Playwright e2e

```
$ cd apps/web && bun playwright test e2e/tests/ship/plan-f-4/Re-renewals.spec.ts --grep @ship-f-4

  1 passed (8.4s)
```

### Scenarios exercised (all PASS within a single test)

1. **getCalendar default** — returns `{ weeks: [...], pastDue: [...], summary: {...} }` with ≥13 seeded weeks for the 90-day window.
2. **Custom 30-day window** — `narrow.weeks.length <= cal.weeks.length` and `>= 4`.
3. **MRR math invariant** — per-week pass-sum == `totalMrrPassingCents`, risk-sum == `totalMrrAtRiskCents`; summary totals == Σ across weeks.
4. **Past-due ordering** — if 2+ entries, asserts non-decreasing `currentPeriodEnd`; `pastDueCount === pastDue.length`.
5. **RBAC** — admin temporarily demoted to `support` role; `getCalendar` still returns 200 (read-only).
6. **UI render** — `/dashboard/platform-admin/renewals` heading visible; KPI row + all 4 KPI test-ids present; calendar grid OR its empty-state placeholder visible.

Console-error capture is wired (logs `[browser-console-error]`).

## Video

- Path: `verification/plan-f-4/Re-renewals.webm`
- Size: ~186 KB
- Forced via `test.use({ video: "on" })`. Captures login → RPC traffic → renewals page render.

## Deviations from spec

1. **Pre-seeded empty weeks.** Spec said "Empty arrays valid in dev" for `weeks`. I went one step further: the handler pre-seeds every Monday-bucket in the window (even with zero renewals) so the UI renders a contiguous timeline. Each empty bucket carries `renewals: []` and shows "No renewals this week". This matches the spec's UI requirement ("Empty state per week: 'No renewals this week'") which would otherwise be unreachable without this seeding.
2. **Past-due query scope.** Spec said `pastDue` SELECT WHERE `status IN ('past_due','unpaid')`. I did exactly that — no `current_period_end` filter — so past-due rows surface regardless of period-end date (which is what the "needs attention" semantics demand).
3. **`status` chip on calendar rows.** Beyond the spec's "cancel at period end" warning chip, I also render a red status chip for `past_due`/`unpaid` rows that nonetheless appear in the calendar (they have a future `currentPeriodEnd` AND past_due status — e.g. a payment-retry sub). This is additive and doesn't change the API.

## Pre-existing issues encountered (not caused by F.4)

- **`bun check-types`** still fails on pre-existing files: `saas-subscription.service.integration.test.ts`, `webhook-dedupe.service.integration.test.ts`, `tests/integration/org.test.ts`. Zero errors in my new files.
- **`getTenantDetail` 500** — known. The renewals page links to `/dashboard/platform-admin/tenants/$id` but doesn't depend on that page rendering successfully.
- **`E2E_SUPER_ADMIN_EMAIL=developer.avantej@gmail.com` not in dev DB** — same observation as prior agents. The e2e fall-back path (`signUpUser` flow) works correctly; ran without those env vars.

## How to re-run

Unit:

```bash
cd apps/server && bun test src/routers/platform-admin-renewals.test.ts
```

E2E:

```bash
cd apps/web && bun playwright test e2e/tests/ship/plan-f-4/Re-renewals.spec.ts --grep @ship-f-4
```

(Optionally set `E2E_SUPER_ADMIN_EMAIL` + `E2E_SUPER_ADMIN_PASSWORD` for a pre-existing super-admin.)
