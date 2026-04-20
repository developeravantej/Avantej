# META — Tier 1 Quick Wins

**Plan file**: `plan/plan.md`  
**Created**: 2026-04-19  
**Status**: Ready for implementation  
**Branch**: Customer-app

## Scope summary

5 categories, 5 phases, all frontend-only except Roles wizard save (calls existing backend procedures).

| # | Category | Phase | Files | Risk |
|---|----------|-------|-------|------|
| 1 | Nav link bugs (Reports + Profile) | P1 | `app-sidebar.tsx` | Low |
| 2 | Playwright testMatch | P1 | `playwright.config.ts` | Low |
| 3 | Delete stale docs | P1 | `docs/web-app-feature-status.md` | Low |
| 4 | Sales View action buttons | P2 | `sales/view/columns.tsx`, `sales/view.tsx` | Low |
| 5 | Payment View action buttons | P2 | `payment/view/columns.tsx` | Low |
| 6 | User Assignment role badges | P3 | `user-assignment.tsx` | Low |
| 7 | Bulk actions — disable stubs | P3 | `user-assignment.tsx` | Minimal |
| 8 | Roles wizard save (real API) | P4 | `roles.tsx`, `RoleEditor.tsx` | Medium |
| 9 | Onboarding mock → redirect | P5 | `onboarding.tsx` | Medium |

## Items explicitly excluded

- **Invitations `invitedBy` filter**: already fixed 2026-04-17. Verified: `listInvitations` in `invitation.service.ts` accepts optional `invitedBy` but the router does not pass it → all org invitations returned (correct behavior). No action needed.
- **New API procedures**: `organizations.create` / `organizations.checkNameAvailability` do not exist. Creating them is a Tier 3+ feature. Tier 1 fix is the redirect path only.
- **Bulk action full wiring**: disabled with "coming soon" tooltip. Full batch update requires server-side batch endpoints and optimistic UI — separate feature.

## Pre-implementation checklist (before P4)

- [ ] Read `packages/api/src/routers/role-permissions.ts` `add` input schema — confirm `resource` + `action` field names
- [ ] Read `packages/api/src/routers/roles.ts` `create` input schema — confirm `name` + `description` fields
- [ ] Check if `/subscribe` page reads `sessionStorage.pendingOrgName` (before P5)

## Verification steps (per phase)

- **P1**: Click Reports link → `/dashboard`; click Profile → `/customers`; run `bun playwright test --list` → smoke specs appear; confirm file deleted
- **P2**: Click "View" on sales row → detail page loads with data; click "View" on payment row → correct sales order detail
- **P3**: User assignment page loads → members show role badges; bulk action items show disabled tooltip
- **P4**: Create role → loading → role in list → network tab shows two API call types; open role → permissions pre-populated
- **P5**: Complete onboarding → redirected to `/subscribe`; network tab shows no creation API call

## Key file paths

```
apps/web/src/components/app-sidebar.tsx               (nav links)
playwright.config.ts                                   (testMatch)
docs/web-app-feature-status.md                        (delete)
apps/web/src/components/tables/sales/view/columns.tsx  (sales actions)
apps/web/src/routes/.../sales/view.tsx                 (sales data map)
apps/web/src/components/tables/payment/view/columns.tsx (payment actions)
apps/web/src/routes/.../access-control/user-assignment.tsx (role badges + bulk)
apps/web/src/routes/.../access-control/roles.tsx       (wizard save)
apps/web/src/components/access-control/editors/RoleEditor.tsx (initialPermissions)
apps/web/src/routes/_authenticated/onboarding.tsx      (mock removal)
```
