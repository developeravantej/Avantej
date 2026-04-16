# Access Control — Invitations

**Route:** `/dashboard/access-control/invitations`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/invitations.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Create, list, revoke, and resend email invitations for new organization members.

**Produces:** A filterable list of invitations with status badges (pending / accepted / declined / expired) and per-invitation action buttons. A dialog for creating new invitations.

**On success:**
- Create: toast "Invitation sent to {email}"; list refreshes.
- Revoke: toast "Invitation revoked successfully"; list refreshes.
- Resend: toast "Invitation resent successfully"; list refreshes.

**On failure / error states:**
- API error on load → destructive error card with message.
- Loading → centered `Loader2` spinner.
- No `organizationId` → create button disabled.

---

## 2. How It Works

**Execution flow:**
```
Route → InvitationsPage (component)
  → useUserContext() → organizationId
  → useQuery(client.invitations.list) → invitations[]
  → InvitationList (renders rows with revoke/resend)
  → CreateInvitationDialog (create form)
      → client.invitations.create()
      → client.invitations.sendEmail()   (server-side email)
  → revokeMutation: client.invitations.revoke()
  → resendMutation: client.invitations.resend() + client.invitations.sendEmail()
```

**Inputs:** Status filter dropdown (all / pending / accepted / declined / expired).

**State management:**
- `statusFilter` local state drives query key and API filter.
- TanStack Query (`queryKey: ["invitations", organizationId, statusFilter]`, `staleTime: 30s`).
- Mutations invalidate `["invitations", organizationId]`.

**Outputs:** Filtered invitation list; status count badges.

**Side effects:** `invitations.sendEmail` sends an actual transactional email via Resend (server-side oRPC procedure in `apps/server/src/routers/`).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `invitations.list` — list invitations with optional status filter
- `invitations.create` — create new invitation record in tenant DB
- `invitations.sendEmail` — trigger email delivery (server-only router)
- `invitations.revoke` — mark invitation as revoked
- `invitations.resend` — regenerate token + send new email

**Uses these components:**
- `InvitationsPage` — `apps/web/src/components/invitations/invitations-page.tsx` — full page logic
- `InvitationList` — `apps/web/src/components/invitations/invitation-list.tsx` — list rendering
- `CreateInvitationDialog` — `apps/web/src/components/invitations/create-invitation-dialog.tsx` — create form

**Uses these hooks:**
- `useUserContext` — resolves `organizationId`
- `useQuery`, `useMutation`, `useQueryClient` — data fetching and mutations

**Navigation: who navigates here:**
- App sidebar: "Invitations" under Access Control section
- `user-assignment.tsx`: handles invite inline but directs to this page for management

**Navigation: where it goes:** Stays on page; dialogs are in-place.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `invitations` (tenant) | SELECT | `id`, `email`, `role`, `hierarchyScopeId`, `status`, `expiresAt`, `createdAt`, `token` |
| `invitations` (tenant) | INSERT | `email`, `role`, `hierarchyScopeId`, `organizationId` |
| `invitations` (tenant) | UPDATE | `status = "revoked"` / `token` (resend) |

**Key types:**
```typescript
type Invitation = {
  id: string;
  email: string;
  role: "admin" | "trainer" | "staff" | "client";
  hierarchyScopeId: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expiresAt: Date | string;
  createdAt: Date | string;
};
```

---

## 5. Tests

**Test files:** None found for this route or `InvitationsPage`.

**Not tested (risk areas):**
- Expired status derived client-side from `expiresAt` (not from API `status` field)
- Email send failure — graceful degradation toast vs hard error
- Resend flow with token regeneration

---

## 6. Notes

- "Expired" is a client-side computed status: if `status !== "pending"|"accepted"|"declined"` AND `expiresAt < now()`, the invitation is shown as expired.
- Revoke uses a `window.confirm()` native dialog (not a styled confirmation), which is inconsistent with other pages.
- The `sendEmail` procedure lives in `apps/server/src/routers/` (server-only), not in `packages/api`. Email delivery failures don't block invitation creation — a warning toast is shown instead.
- `hierarchyScopeId` for new invitations defaults to the inviter's own scope (read from `userContext.organizations[].hierarchy.member.hierarchyScopeId`).
