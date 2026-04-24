# Scalability Audit — Web Modularity Refactor

Client-only refactor; most of the 10-point perf checklist is correctly N/A. Findings focus on the 3 items with real perf/correctness surface: the mutation wrapper, the codemod, and the mega-file splits.

## HIGH — `invalidate: string[]` prefix semantics mismatch actual query-key shapes

Plan §3.1 + Open Question 2 declares `invalidate?: string[]` "prefixes." Ground truth in `apps/web/src`:

- oRPC-generated keys: `orpc.members.list.key()`, `orpc.roles.list.key()` — tuples whose first element is NOT a plain string like `"members"`. oRPC generates structured keys (see `apps/web/src/hooks/useRoles.ts:25`, `useUserAssignment.ts:24`).
- Hand-rolled arrays: `["customer-profile", organizationId]`, `["announcements", organizationId]` (`routes/.../customers.tsx:113`, `announcements/view.tsx:164`).

A string-prefix API (`invalidate: ["sales"]`) cannot express either form. Passing `["sales"]` to `invalidateQueries({ queryKey: ["sales"] })` will NOT match oRPC-shaped keys at all — a silent miss, not an over-invalidation. The plan's own §6 risk line "must mirror existing manual invalidateQueries keys exactly per call site" contradicts the string-prefix proposal.

Fix: type `invalidate` as `QueryKey[] | ((…) => QueryKey[])` (full tuple), and allow passing `orpc.xxx.list.key()` directly. TanStack v5 prefix matching (confirmed: `@tanstack/react-query@^5.85.5` in `apps/web/package.json:38`; no `exact: true` usage anywhere in repo) already handles prefix semantics once the key is a proper tuple.

## HIGH — Default-invalidate behaviour undefined; risk of `invalidateQueries()` nuking everything

`apps/web/src/utils/orpc.ts:14` already calls `queryClient.invalidateQueries()` (no args = invalidate ALL queries) on session events. If `useApiMutation` treats missing `invalidate` the same way (forgets to guard), every unannotated mutation will refetch every query on the page. Plan §3.1 behaviour bullets do not specify the `undefined` branch. Task 1.4's §7 bullet only forbids `invalidateQueries([])`, not the 0-arg form.

Fix: spec must say "if `invalidate` is undefined, invalidate NOTHING" and add a unit test asserting `queryClient.invalidateQueries` is not called when the option is omitted.

## MEDIUM — Phase 4 codemod regex too narrow

§8 Risks scopes the `/100`, `*100` codemod to variables named `price|amount|cents|rm`. Real money-bearing names in this codebase include `total`, `subtotal`, `discount`, `tax`, `fee`, `refund`, `balance`, `commission`, `payout`, `deposit`, `installment`, `credit`. Narrow regex will silently leave float math in place while the plan's success-criteria grep (`\b(price|amount)\s*/\s*100`) reports "done." 

Fix: broaden the allow-list OR invert the approach — grep all `/ 100`/`* 100` sites, manually triage, exclude known non-money (pagination, progress bars, percentages displayed as `x/100`). Plan already commits to "manual review of every diff hunk" — make that mandatory, not advisory.

## LOW — Mega-file split re-render verification is hand-wavy

§6 breakage-table says "verify with React DevTools profiler before declaring done" — no threshold, no baseline capture, no regression test. For `EnhancedPermissionMatrix` (grid of role × resource × action toggles) a state-move into a reducer hook can easily regress to O(cells) re-renders per toggle.

Fix: capture a pre-split profiler trace (commit counts for one toggle / one form submit) as baseline in `plan/baselines/`, require post-split trace to be ≤ baseline. Cheap and mechanical.

## LOW — Benchmark step for wrapper overhead unspecified

§7 point 10 says "benchmark render cost on a form with 5 mutations before/after" — no tool, no threshold. As written it's skippable.

Fix: specify React Profiler commit count + wall time on a named form (e.g. `add-appointment-modal`), threshold ≤ +1 commit and ≤ +2ms. Or drop the benchmark — `useApiMutation` is a thin wrapper over `useMutation` and the overhead claim is low-risk.

## INFO — TanStack v5 prefix semantics confirmed

`@tanstack/react-query@^5.85.5` (`apps/web/package.json:38`). `invalidateQueries({ queryKey })` is prefix-match by default unless `exact: true`. Repo-wide grep for `invalidateQueries.*exact` → 0 hits. Prefix assumption is sound *once the key-shape issue above is fixed*.

## INFO — Grep success-criteria are fine at this repo size

`apps/web/src` is small enough that the plan's grep-based checks (`grep -c "toast.error"`, `grep -rE "/ 100"`) will complete in under a second. No concern.
