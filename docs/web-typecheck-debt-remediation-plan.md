# Web Typecheck Debt Remediation Plan

Last updated: 2026-02-21
Owner: Web Platform (lead) + Frontend engineers
Target branch: `chore/web-typecheck-debt-plan`

## Goal
Make `bun run turbo -F web check-types` pass on `main` by fixing existing baseline TypeScript errors without mixing feature changes.

## Baseline (captured on `origin/main` @ `012bedf`)
Command:
- `bun run turbo -F web check-types`

Result:
- Failed with **77 TypeScript errors** across app and package files.

Top error codes:
- `TS7006` (27): implicit `any` parameters
- `TS2345` (14): invalid navigation/redirect options (missing required route `search`)
- `TS2741` (10): missing required `search` props on router links
- `TS2322` (9): incompatible types in form/invitation flows
- `TS2305` (4): missing exports from `@/types/user-assignment`
- `TS7022`/`TS7024`/`TS7031` (7): circular/self-referential schema typing and implicit binding types

Top affected files:
- `apps/web/src/hooks/useUserAssignment.ts` (17)
- `apps/web/src/routes/index.tsx` (10)
- `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx` (8)
- `apps/web/src/components/forms/login-form.tsx` (5)
- `apps/web/src/components/branch/member-reassignment.tsx` (5)

## Scope
In scope:
- Type corrections and API contract alignment required for `web` typecheck pass.
- Route navigation typing fixes for TanStack Router contract.
- Missing type exports and explicit interface/type additions.
- Minimal refactor only when required to satisfy typings.

Out of scope:
- New product features.
- UI redesign.
- Non-typecheck lint cleanup unrelated to changed files.

## Execution Strategy (Dependency Order)

### Phase 1: Router Contract Corrections (high leverage)
Owner: Frontend engineer
Files (primary):
- `apps/web/src/routes/index.tsx`
- `apps/web/src/lib/route-guards.ts`
- `apps/web/src/components/forms/login-form.tsx`
- `apps/web/src/components/forms/signup-form.tsx`
- `apps/web/src/components/user-menu.tsx`
- `apps/web/src/components/not-found.tsx`
- `apps/web/src/routes/_authenticated.tsx`

Tasks:
- Add required `search` params on `navigate`, `redirect`, and `Link` usages.
- Normalize helper wrappers so route transitions are strongly typed.

Exit criteria:
- `TS2345` and `TS2741` reduced to zero.

### Phase 2: User Assignment Type Contract Fixes
Owner: Frontend engineer
Files (primary):
- `apps/web/src/hooks/useUserAssignment.ts`
- `apps/web/src/types/user-assignment.ts`

Tasks:
- Restore/add missing exported types used by hooks.
- Replace implicit `any` updater parameters (`prev`) with concrete state types.

Exit criteria:
- `TS2305` and local `TS7006` in user-assignment flow reduced to zero.

### Phase 3: Branch/Reassignment and Invitation Typing
Owner: Frontend engineer
Files (primary):
- `apps/web/src/components/branch/member-reassignment.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`
- `apps/web/src/components/invitations/invitation-list.tsx`
- `apps/web/src/components/invitations/invitations-page.tsx`
- `apps/web/src/routes/accept-invitation.tsx`

Tasks:
- Add explicit node/branch types in callbacks.
- Correct invitation API return typing and call signatures.
- Align `Invitation` status typing with actual API values.

Exit criteria:
- Remaining app-level `TS7006`, `TS2554`, `TS2322`, `TS2339` resolved.

### Phase 4: Package Typing Debt Blocking Web Typecheck
Owner: Platform engineer
Files (primary):
- `packages/api/src/routers/hierarchy.ts`
- `packages/db/src/schema/tenant/appointments.ts`
- `packages/db/src/schema/tenant/package-instances.ts`
- `packages/db/src/schema/tenant/payments.ts`
- `packages/auth/src/index.ts`

Tasks:
- Resolve self-referential schema typing errors (`TS7022`, `TS7024`).
- Add explicit binding types where needed (`TS7031`).
- Ensure `cloudflare:workers` types are available to typecheck context or guarded by environment-specific typing strategy.

Exit criteria:
- Package-level errors no longer surface in `web` typecheck.

### Phase 5: Final QA Gate
Owner: QA engineer
Commands:
- `bun run turbo -F web check-types`
- `bun run turbo -F web build`
- `bun run check:oxlint -- <changed-files>`

Release criteria:
- `web check-types` passes fully.
- `web build` passes.
- No new high-severity regressions.

## Risk Register
- Risk: Router search-param changes alter auth redirect behavior.
  - Mitigation: verify login/signup/unauthorized flows manually after Phase 1.
- Risk: Schema typing changes in `packages/db` can cascade.
  - Mitigation: keep changes minimal and run targeted package builds before final gate.
- Risk: Multi-file debt fixes create merge conflicts with active feature branches.
  - Mitigation: land in small batches or rebase daily.

## Delivery Model
Recommended PR execution mode:
1. Keep this branch as umbrella debt stream.
2. Merge by phase in small commits with clear checkpoints.
3. If conflict pressure rises, split into two PRs:
- PR-A: app/router/user-assignment fixes
- PR-B: package typing fixes

## Verification Snapshot Linkage
Baseline log artifact (local):
- `.project/artifacts/web-typecheck-baseline.log`
