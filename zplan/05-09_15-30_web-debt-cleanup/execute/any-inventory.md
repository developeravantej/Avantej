# `as any` Inventory — Phase 2

**Generated:** 2026-05-09
**Total (source files, excl. routeTree.gen.ts + __tests__):** ~90 instances in ~25 files

## SKIP — Auto-generated (do NOT modify)
- `routeTree.gen.ts` — ~80 `as any`, emitted by TanStack Router Vite plugin. Will be regenerated on next build.

## SKIP — Test files (Phase 3 scope)
- `__tests__/components/enhanced-permission-matrix.test.tsx` — JSDOM polyfills, acceptable.

## Agent A — Hooks, permissions, suppressions

| File | Line(s) | Type | Fix |
|------|---------|------|-----|
| `hooks/useAuth.ts` | 88 | B | `as any[]` → `as FlattenedPermission[]` |
| `hooks/useAuth.ts` | 112, 136 | B | `catch (error: any)` → `catch (error: unknown)` + instanceof |
| `lib/auth-debug.ts` | 11 | B | `decoded?: any` → `decoded?: Record<string, unknown>` |
| `lib/auth-debug.ts` | 20 | B | return type `any` → `Record<string, unknown> | null` |
| `hooks/usePermissions.ts` | 38–57 | B | Remove fake async (Task 2.5) |
| `go-highlevel-integration.tsx` | 245 | suppression | Wrap refresh in useCallback, then remove suppression |
| `usePermissionMatrixState.ts` | 153 | suppression | KEEP — add explanatory comment |
| `customer-profile-panel.tsx` | 247 | suppression | KEEP — add explanatory comment |
| `lib/api.ts` | 28, 32 | C | `_params: any`, `Promise<any>` — deprecated methods, already throw; type as `unknown` |

## Agent B — RBAC/financial client casts

| File | Line(s) | Type | Fix |
|------|---------|------|-----|
| `attendance/check-ins-log.tsx` | 102 | A | Try removing `(client as any)` — `checkIns` IS in appRouter |
| `attendance/drop-in-form.tsx` | 55, 84 | A | Try removing `(client as any)` |
| `attendance/today-bookings.tsx` | 222, 262 | A | Try removing `(client as any)` |
| `attendance/today-bookings.tsx` | 268 | B | `(result: any)` → `(result: unknown)` or proper type |
| `attendance/view.tsx` | 130, 153 | A | Try removing `(client as any)` |
| `refunds/view.tsx` | 192, 337 | B | `(auditData as any)?.rows` → narrow with type |
| `refunds/view.tsx` | 465, 476, 497, 513 | A | Try removing `(client as any)` — `refunds` IS in appRouter |
| `refunds/request-refund-dialog.tsx` | 114 | A | Try removing `(client as any)` |
| `refunds/process-refund-dialog.tsx` | 84 | A | Try removing `(client as any)` |
| `subscribe.tsx` | 132 | B | `.then((tokenData: any)` → `(tokenData: unknown)` + narrow |
| `routes/index.tsx` | 61 | B | `icon: any` → `icon: LucideIcon` or `React.ElementType` |

## Agent C — Response-shape casts

| File | Line(s) | Type | Fix |
|------|---------|------|-----|
| `branch/view.tsx` | 220, 231, 239, 253 | B | `(branch as any).picUserId/code/address` — extend branch type |
| `branch/view.tsx` | 354, 697 | B | `catch (apiError/error: any)` → `unknown` + narrow |
| `branch/view.tsx` | 548 | B | `(branch: any) =>` callback → proper type |
| `branch/view.tsx` | 741–743 | B | `.filter((b: any)` → inline type annotation |
| `pending-approvals-widget.tsx` | 51 | B | `(currentOrg as any)?.role` → extend UserOrg type |
| `operations/approvals.tsx` | 74–75 | B | `(currentOrg as any)?.role/hierarchy.member.id` |
| `access-control/roles-tab.tsx` | 195 | A | `(member as any).role` → add role to member type |
| `access-control/roles-tab.tsx` | 648 | C | `onValueChange={(value: any)` → proper union type |
| `access-control/members-tab.tsx` | 692–694 | A | `(memberRaw as any)?.role/roleId/hierarchyScopeId` |
| `trainers/availability.tsx` | 192 | B | `(currentOrg as any)?.hierarchy?.member?.id` |
| `sales/$id.tsx` | 266, 270 | B | `(order as any).cancelledAmount` — extend order type |
| `sales/view.tsx` | 240 | C | `(status || undefined) as any` → proper union cast |

## Agent D — Misc casts

| File | Line(s) | Type | Fix |
|------|---------|------|-----|
| `app-sidebar.tsx` | 269 | A | `session?.user as any` — try removing (inferAdditionalFields) |
| `appointment-list.tsx` | 912 | B | `(appt as any).client?.userId` → discriminated union |
| `appointment.tsx` | 315 | B | `(appointment: any)` param → use Appointment type |
| `appointment.tsx` | 393 | suppression | KEEP — add explanatory comment |
| `members-tab.tsx` | 527 | suppression | KEEP — add explanatory comment (owned by Agent C) |
| `category-commission-form.tsx` | 84, 89, 97, 106, 112, 123, 200, 411, 542 | A/B | Derive types from existingConfig shape |
| `hierarchical-branch-form.tsx` | 61, 148, 152, 159, 182, 204, 207, 214, 237, 240, 247, 395 | B | `catch (error: any)` → `unknown`; filter callbacks → explicit types |
| `commission/all-tab.tsx` | 285, 286, 348, 349, 620 | B | `(membersData as any[])`, `(data as any)?.rows/totals` |
| `commission/liability-tab.tsx` | 498 | B | `.map((cat: any)` → proper type |
| `commission/mine-tab.tsx` | 86 | B | `(data as any)?.splits` |
| `trainer-tiers-page.tsx` | 60, 61, 84, 85 | B | `(result as any).missingRateCategories` |
| `payroll-widget.tsx` | 16, 34 | B | `.map((payout: any)` |
| `team-dashboard.tsx` | 16, 30, 34, 67, 69, 106 | C | `[key: string]: any` index sig; `.map((team/key: any)` |
| `assign-trainer-drawer.tsx` | 75, 155 | B | `(members as any[])`, `.map((t: any)` |
| `signup-form.tsx` | 143 | B | `catch (error: any)` → `unknown` |
| `invitations/create-invitation-dialog.tsx` | 204 | C | `value as any` → proper role union cast |
| `invitations/invitations-page.tsx` | 38 | C | `statusFilter as any` → proper status union |
| `TestDataDialog.tsx` | 111 | B | `(appointment: any)` → Appointment type |
| `tables/service/view/data-table.tsx` | 114, 116 | B | `(editServiceData as any)` → extend type |
| `types/auth.ts` | 150 | B | `data?: any` → `data?: unknown` |
| `types/auth.ts` | 165, 171 | C | type guard params — acceptable (keep, they're guard functions) |
| `useApiMutation.ts` | 69, 87 | C | `(onSuccess as any)`, `(onError as any)` — callback type narrowing |
