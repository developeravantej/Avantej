# Access Control — Invitations

**Route:** `/_authenticated/dashboard/_layout/access-control/invitations`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/invitations.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read) — stub in `beforeLoad`; enforced server-side.
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** View and manage all organization invitations — see pending/accepted/declined/expired invitations, revoke pending ones, and resend expired or pending ones.
**Produces:** A filterable list of invitations with status badges and action buttons. Status counts shown as inline badges (Pending, Accepted, Expired).
**On success:** Revoke and resend each show a sonner toast and invalidate the invitations query.
**On failure / error states:** Error banner replaces the list if the initial fetch fails. Spinner while loading. Empty list when no invitations match the filter.

---

## 2. How It Works

**Execution flow:**
```
Route (invitations.tsx)
  → component: InvitationsPage (apps/web/src/components/invitations/invitations-page.tsx)

InvitationsPage
  → useQuery(["invitations", orgId, statusFilter])
      → client.invitations.list({ organizationId, status? })
          → invitationRouter.list → listInvitations(tenantDb) → tenantDb.invitations

  handleRevoke(invitationId)
    → confirm() dialog
    → revokeMutation → client.invitations.revoke({ organizationId, invitationId })
        → invitationRouter.revoke → revokeInvitation(tenantDb)

  handleResend(invitationId)
    → resendMutation
        → client.invitations.resend({ organizationId, invitationId })
            → invitationRouter.resend → resendInvitation(tenantDb) [extends expiry]
        → client.invitations.sendEmail({ invitation: { token, email, role }, ... })
            [server-side Resend email]

  CreateInvitationDialog → client.invitations.create(...) + client.invitations.sendEmail(...)
```

**Inputs:** No URL or query params. `statusFilter` state drives the list query (re-fetches on change).

**State management:**
- `statusFilter` — "all" | "pending" | "accepted" | "declined" | "expired"; triggers query re-fetch
- `isCreateDialogOpen` — controls `CreateInvitationDialog` visibility

**Outputs:** `InvitationList` component renders rows. Mutations invalidate `["invitations", orgId]`.
**Side effects:** Resend triggers server-side Resend email. If email fails, the mutation throws and shows an error toast (unlike invite flow in user-assignment which degrades gracefully).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `invitations.list` — list invitations with optional status filter
- `invitations.revoke` — mark invitation as declined/revoked (requires `user_management:delete`)
- `invitations.resend` — extend expiry + re-trigger email (requires `user_management:create`)
- `invitations.create` — create a new invitation (via `CreateInvitationDialog`)
- `invitations.sendEmail` — server-only email trigger (via resend and create flows)

**Uses these components:**
- `InvitationList` — `apps/web/src/components/invitations/invitation-list.tsx` — renders rows with revoke/resend buttons
- `CreateInvitationDialog` — `apps/web/src/components/invitations/create-invitation-dialog.tsx` — sheet/dialog for new invitation
- Shadcn/ui: `Select`, `Badge`, `Button`, `Loader2`

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`
- `useQueryClient` — cache invalidation

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — People → Access Control → "Invitations" (sidebar link is permission-gated: requires `user_management:read`; hidden when the user lacks this permission)

**Navigation: where it goes:** No outbound navigation. Accepted invitations cause the invitee to land at `/accept-invitation?token=...&orgId=...` (separate route).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `invitations` (tenant) | SELECT, UPDATE | `id`, `email`, `role`, `hierarchyScopeId`, `status`, `token`, `expiresAt`, `createdAt` |

**Key types (Invitation shape returned by list):**
```typescript
{
  id: string;
  email: string;
  role: "admin" | "trainer" | "staff" | "client";
  hierarchyScopeId: string;
  status: "pending" | "accepted" | "declined";  // "expired" derived client-side from expiresAt
  expiresAt: Date;
  createdAt: Date;
}
```
Note: the API does not return an "expired" status — `InvitationsPage` derives it client-side by comparing `expiresAt` to `new Date()`.

**Form fields (CreateInvitationDialog):**
| Field | Type | Maps to |
|-------|------|---------|
| email | text | `invitations.create.email` |
| role | Select (SystemRole) | `invitations.create.role` |
| hierarchyScopeId | (passed from parent) | `invitations.create.hierarchyScopeId` |

---

## 5. Tests

**Test files:** None found for this page specifically.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- Resend with email send failure (entire mutation throws; no graceful degradation)
- Status filter "expired" — server does not filter by "expired"; client-side derivation may be inconsistent with server data
- `invitations.list` returns only invitations created by the current member (`invitedBy: context.member.userId`) — users cannot see invitations created by others

---

## 6. Notes

- `invitationRouter.list` filters by `invitedBy: context.member.userId` — admins do NOT see invitations created by other admins. This is likely unintentional for an admin-facing page.
- The "expired" status filter on the frontend sends `status: undefined` to the server (since the enum does not include "expired"), so all invitations are fetched and then filtered client-side.
- `invitations.revoke` sets status to "declined" (reuses the decline status for admin revocations).
- The route file itself (`invitations.tsx`) is thin — all logic lives in `InvitationsPage` component.
