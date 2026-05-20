# Pending Approvals

**Route:** `/dashboard/operations/approvals`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/operations/approvals.tsx`
**Platform:** web
**Auth required:** authenticated (admin or trainer role only — server-side `FORBIDDEN` otherwise)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Admin/trainer console for acting on customer-purchased packages that landed in `pending` status (Pattern C: assignment IS approval). Trainers can self-assign; admins can assign any trainer in their accessible branch or reject the package.

**Produces:** A table of pending package_instance rows showing customer name + email, preferred-trainer badge (if any), service name, credits, price, purchased timestamp, and per-row action buttons. Refresh button in header.

**On success:** Assign opens `AssignTrainerDrawer`; reject opens `RejectPackageDialog`. On completion both refetch the list and the row drops off.

**On failure / error states:** `PageLoader` while loading; "Loading organization…" guard when no `organizationId` yet; permission `StatusCallout` if caller is neither admin nor trainer; `StatusCallout error` if `listPending` fails (refetch via Refresh); `EmptyState` "All caught up" when no pending rows.

---

## 2. How It Works

**Execution flow:**
1. Page mounts; `useUserContext()` reads `currentOrganizationId` + caller's `role` and `member.id` from `userContext.organizations[]`
2. Default scope: `"assignable_to_me"` for trainers, `"all"` for admins
3. `useQuery(["packageInstances", "listPending", organizationId, scope])` → `client.packageInstances.listPending({ organizationId, scope, limit: 100 })`
4. Render `Table` of rows; each row shows preferred-trainer badge if `preferredTrainerName`
5. Admin row actions: "Assign Trainer" (opens drawer with `lockTrainer=false`, preselects `preferredTrainerId` if set), "Reject" (opens dialog)
6. Trainer row action: "Assign me" (opens drawer with `lockTrainer=true` + `defaultTrainerMemberId=callerMemberId`); disabled if `callerMemberId` missing
7. Drawer/dialog `onAssigned`/`onRejected` callbacks → `refetch()`

**Inputs:** None from URL. Local: `scope` (initial-state only, not switchable via UI today), `drawerPkg`, `drawerSelfAssign`, `rejectPkg`.

**State management:** TanStack Query for list; `useState` for drawer/dialog open targets; `useMemo` for typed row list.

**Outputs:** Renders table; opens `AssignTrainerDrawer` + `RejectPackageDialog` (both perform their own mutations).

**Side effects:** Cache refetch on assign/reject success.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.packageInstances.listPending({ organizationId, scope, limit })` — RBAC: admin/trainer only; trainer scope auto-filters to caller's `hierarchyScopeId`; admin scope falls back to `accessibleNodeIds`. Enriches rows with customer name/email, service name, preferred trainer name.
- (Indirect via children) `client.packageInstances.assignTrainer` — invoked by `AssignTrainerDrawer`
- (Indirect via children) `client.packageInstances.reject` — invoked by `RejectPackageDialog`

**Uses these components:**
- `AssignTrainerDrawer` — `apps/web/src/components/forms/assign-trainer-drawer.tsx`
- `RejectPackageDialog` — `apps/web/src/components/forms/reject-package-dialog.tsx`
- `Table`, `Badge`, `Button` — shadcn/ui
- `EmptyState`, `PageLoader`, `StatusCallout` — `@/components/ui/*`
- `CheckCircle2`, `Inbox` — lucide-react

**Uses these hooks:**
- `useUserContext()` — `currentOrganizationId`, caller role, caller `member.id` (narrowed via `MemberWithId` unknown cast since `member.id` is not in the `UserContextResponse` type)
- `useQuery()` — pending rows
- `useState`, `useMemo` — UI state

**Navigation: who navigates here:**
- App sidebar — "Approvals" link in Main group (`apps/web/src/components/app-sidebar.tsx:96`) using `ClipboardCheck` icon
- `PendingApprovalsWidget` on `/dashboard` — both the "View all" link and each row card link here (`apps/web/src/components/dashboard/pending-approvals-widget.tsx:85,115,139`)

**Navigation: where it goes:** No outbound page navigation — all interactions are modal/drawer.

---

## 4. Data Shapes

**DB tables touched (server-side via `listPending`):**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `package_instances` (tenant) | SELECT | `id`, `clientId`, `serviceId`, `branchId`, `status` (`'pending'`), `creditsTotal`, `totalPrice`, `preferredTrainerId`, `createdAt` |
| `services` (tenant) | JOIN | `id`, `name`, `branchId` (fallback for row's effective branch) |
| `members` (tenant) | LOOKUP | `userId`, `hierarchyScopeId` (for resolving customer name, preferred trainer name, customer's branch fallback) |
| `user` (control panel) | LOOKUP | `id`, `name`, `email` (for customer + trainer display names) |

**Key types:**
```typescript
type PendingRow = {
  id: string;
  clientId: string | null;
  serviceId: string;
  serviceName: string | null;
  branchId: string | null;
  totalPrice: number | null;          // cents
  creditsTotal: number;
  createdAt: string | Date;
  customerName: string | null;
  customerEmail: string | null;
  preferredTrainerId: string | null;
  preferredTrainerName: string | null;
};

// Input schema (server)
{ organizationId: uuid, branchId?: uuid, scope?: "all" | "assignable_to_me", limit?: 1..200 }
```

---

## 5. Tests

**Test files:** None for this route yet.

**Not tested (risk areas):**
- Trainer self-assign disabled state when `callerMemberId` is null (control-panel user has no `members` row in this tenant)
- Admin vs. trainer initial scope branching
- Drawer/dialog `onAssigned`/`onRejected` refetch timing
- `MemberWithId` narrowing falling back to `null` when server omits `member.id`
- Race: two trainers click "Assign me" simultaneously (server returns the "package was just assigned to another trainer" message — UI relies on the drawer to surface it)

---

## 6. Notes

- Added in commit `2de89f54` (Phase 2+3 of the package-approval-flow branch); polish + widget integration in `4cec398b` (Phase 4).
- `scope` is initialised once from caller role and never updated by the UI — there is no admin toggle today to switch back to "assignable_to_me". Add a tab control if admins need to filter to their own assignable rows.
- `member.id` is sourced via `unknown` cast (`MemberWithId`) because `UserContextResponse.hierarchy.member` only types `role`/`hierarchyScopeId`/etc.; the server happens to include `id`, but the contract widening is intentional.
- Server enforces Pattern C: trainers may only assign themselves (`trainerMemberId === own member.id`); admins may assign any trainer within their accessible branch. UI mirrors this with the `lockTrainer={drawerSelfAssign}` prop on the drawer.
- Empty state copy is "All caught up" — same friendly tone used on dashboard widget.
- No URL search params — drawer/dialog state is purely in-memory; refreshing the page closes them.
