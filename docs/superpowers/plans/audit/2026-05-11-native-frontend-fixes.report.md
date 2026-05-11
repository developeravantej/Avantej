# Audit: 2026-05-11-native-frontend-fixes

**Audited:** 2026-05-11
**Plan file:** docs/superpowers/plans/2026-05-11-native-frontend-fixes.md
**Status:** needs-attention

## Scorecard

| Check | Result |
|-------|--------|
| Structural completeness | 8/8 sections present (Goal, Architecture, Tech Stack, Scope, File Index, Phased Tasks, Verification, Summary) |
| File path refs | 17/17 EXIST |
| Symbol refs | 15/15 found in codebase |
| Broken references | 0 |
| Missing impact | 1 critical (Task 10 — serviceType enum) |
| Unresolved questions | 0 (no TBD/TODO markers) |
| Execution state | not started (plan written today, no execute log) |
| Self-contradictions | 2 minor (Task 1, Task 17) |
| False-positive tasks left in plan | 3 (Task 8, Task 11, Task 18 — kept as documentation only) |

## Findings

### Critical impact gap — Task 10 (serviceType enum)

Plan says: drop `"semi-private"` (hyphenated) from `BookingFlowState.serviceType` union; replace single book-workout.tsx conversion with `"semi_private"`.

Reality — hyphenated form is consumed across multiple files:

| File:line | Usage |
|---|---|
| `apps/native/app/(app)/dashboard/book-workout/review.tsx:71-74` | Casts `state.serviceType` to `"semi-private"` for downstream API call |
| `apps/native/app/(app)/dashboard/bookings/[id].tsx:178, 187` | Reads `appointment.type === "semi-private"` from server response |
| `apps/native/app/(app)/dashboard/bookings/index.tsx:307, 462` | Reads `booking.type === "semi-private"` from server response |
| `apps/native/app/(app)/dashboard/explore/[id].tsx:24` | Display helper handles both forms |

The hyphenated form is the **appointments API output shape**. The underscored form is the **services API output shape**. They are two different server contracts. Task 10 conflates them — flipping `BookingFlowState` to underscore-only will break `review.tsx:73-74` which sends hyphenated form to the booking API.

**Fix the plan:**
- Either drop Task 10 (the divergence is intentional — keep the conversion at `book-workout.tsx:109-110`).
- Or expand Task 10 to audit `appointments.create` server input contract first; only unify if the server actually accepts both forms.

### Self-contradictions

**Task 1** — Problem statement says `useIsomorphicLayoutEffect` "is declared after it is used" but then concedes "Works today because RootLayout is only invoked after module evaluation completes." That is how every module-level `const` works. The "fix" is cosmetic reordering, not a bug fix. Either:
- Drop Task 1 entirely, or
- Reframe as "code clarity: hoist for readability."

**Task 17** — Step instructs "Replace line 88" then immediately says "Leave the packageInstances `any` cast alone for this task — it's a different API and out of scope." Delete the contradictory "Replace line 88" sub-block; keep only the two service-related replacements.

### False-positive tasks left in plan

Tasks 8, 11, 18 are documented "no fix needed" with verification steps but no commit. Recommend either:
- Remove them from the task list entirely and consolidate notes into the "Excluded findings" summary at the bottom, or
- Tag them clearly as `[SKIP — false positive]` in section headers so an executor doesn't burn cycles re-verifying.

Current shape risks an executor running `bun check-types` three times for nothing.

### Task 6 line drift risk

Plan modifies `apps/native/contexts/organization-context.tsx:95-103` (the effect) but leaves `fetchUserContext` callback at 67-93 intact. After the patch, that callback is only exposed via `context.refetch` and no longer used internally. Two divergent fetch paths now exist (the inline effect + the standalone callback) that can drift apart over time.

Mitigation: add a Step 5 to Task 6 that extracts a shared `loadContext` helper called by both the effect and the `refetch` callback. Otherwise document explicitly that the two paths must stay in sync.

### Domain logic warnings

None — this is a non-NCT codebase; the audit skill's NCT-specific checks (task completion gate, SLA, Electric sync) do not apply. The frontend-only scope is honored throughout (no schema, no API, no server edits).

### Execution & verification gaps

- Plan written 2026-05-11; no execution log exists. Expected.
- Manual smoke test in Task 19 specifies the buy-package flow only — does not include the booking flow even though Task 10 touches `book-workout.tsx`. Add a booking smoke test if Task 10 stays in scope.

## Priority Actions

1. **Resolve Task 10 first.** Decide whether `appointments` and `services` server contracts share one enum form. If not, drop Task 10 entirely. If yes, expand Task 10 to cover `review.tsx`, `bookings/[id].tsx`, `bookings/index.tsx`, and `explore/[id].tsx` consumers.
2. **Drop or reframe Task 1.** Current problem statement contradicts itself.
3. **Fix Task 17 contradiction.** Delete the "Replace line 88" sub-block.
4. **Consolidate false-positive tasks** (8, 11, 18) — move into the excluded-findings summary; don't leave as standalone tasks.
5. **Add `loadContext` helper to Task 6** to avoid divergent fetch paths, OR document the dual-path explicitly.
6. **Extend smoke test in Task 19** to cover the book-workout flow if Task 10 ships.

## Status rationale

**needs-attention** — 0 broken refs and structural completeness OK, but Task 10's impact analysis is materially wrong (would break 4 downstream files) and two tasks contain internal contradictions. Plan is executable but not safely as-written.
