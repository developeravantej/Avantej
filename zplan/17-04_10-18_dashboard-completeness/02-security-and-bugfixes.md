# Security & Bugfixes — Two Tickets

> Workstream shape: **two independent tickets, ticket-sized**.
> Not phased; can merge independently.

---

## Ticket A: Gate the GoHighLevel Integration Page

### Current State

- **Route:** `/_authenticated/go-highlevel-integration` (the dashboard doc's "Section 18d" incorrectly cites `/go-highlevel-integration`).
- **File:** `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx` (~438 lines)
- **Guard:** none. Any authenticated member of any tenant can reach this page.
- **Risk:** exposes webhook setup instructions, connected location mappings, recent sync payloads, and location mapping CRUD to any logged-in user. The page self-describes as a "demo/diagnostic" tool but lives inside the authenticated shell.

### Desired State

Only platform admins (or tenant admins with a specific permission) can access the page. Non-admins get redirected or see a 403 surface.

### Decision Required Before Implementation

Two options:

- **Option A (recommended):** gate via `useIsSystemAdmin()` — platform admin only. Matches the page's "diagnostic" purpose.
- **Option B:** gate via tenant-admin role — each tenant's admin can manage their own GHL link.

Record the decision in `05-open-questions.md` before implementing. Recommendation: **Option A** until GHL becomes a tenant-facing product feature.

### Implementation (Option A)

**File to modify:** `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx`

**Change:**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useIsSystemAdmin } from "@/hooks/usePermissions";

export const Route = createFileRoute("/_authenticated/go-highlevel-integration")({
  beforeLoad: async () => {
    // Use authClient or userContext to check isSystemAdmin synchronously if possible.
    // If async, return a promise that resolves to a redirect when non-admin.
    const isAdmin = await resolveIsSystemAdmin(); // helper to be added to route-guards.ts
    if (!isAdmin) {
      throw redirect({ to: "/dashboard", search: { unauthorized: "ghl" } });
    }
  },
  component: GoHighLevelIntegration,
});
```

Plus an **in-component** soft-gate as defense in depth:

```tsx
const isAdmin = useIsSystemAdmin();
if (!isAdmin) {
  return <UnauthorizedCard feature="GoHighLevel Integration" />;
}
```

### Files Touched

| File | Change |
|------|--------|
| `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx` | Add `beforeLoad` guard + component-level check |
| `apps/web/src/lib/route-guards.ts` | Add `resolveIsSystemAdmin()` helper (or reuse existing) |
| `apps/web/src/hooks/usePermissions.ts` | Verify `useIsSystemAdmin` is exported (already exists per audit) |

### Acceptance

- Non-admin tenant user navigates to `/go-highlevel-integration` → redirected to `/dashboard?unauthorized=ghl`
- Admin navigates → page loads as before
- No server-side data leak: verify the page's raw `fetch()` calls also fail for non-admin (check endpoint auth)

### Out of Scope for This Ticket

- Moving GHL off raw `fetch()` to oRPC — separate refactor
- Building a tenant-facing GHL setup UI — product decision

---

## Ticket B: Fix Invitation Scope — Org-Wide Listing for Admins

### Current State

**File:** `packages/api/src/routers/invitations.ts`

**Lines 506–526:**
```ts
// Check permission (line 506-519)
try {
  await requirePermission(tenantDb, member, "user_management", "read");
} catch (error) {
  throw new ORPCError("FORBIDDEN", ...);
}

// Then filter to only the current user's invitations (line 521-526)
const invitationList = await listInvitations({
  tenantDb: context.tenantDb,
  status: input.status,
  email: input.email,
  invitedBy: context.member.userId, // ← the bug
});
```

The `requirePermission` gate already ensures only users with `user_management:read` reach this code. The subsequent `invitedBy: context.member.userId` filter is redundant at best and destructive in practice — it hides other admins' invitations from a caller who just passed the permission check.

Admin A sees invitations they personally sent; Admin B's invitations are invisible to Admin A.

### Impact

- Audit gap: no admin can see all outstanding invitations for their org
- Duplicate invitations: two admins can invite the same email unaware
- UI consequence: the Invitations page (`/dashboard/access-control/invitations`) displays a partial list

### Desired State

Any caller who passes the existing `requirePermission("user_management", "read")` gate (lines 507–519) sees all invitations in the org. The permission gate is the authority; the downstream filter should not override it.

### Implementation

**File to modify:** `packages/api/src/routers/invitations.ts`

**Change:** remove the `invitedBy` filter on line 525.

```diff
   const invitationList = await listInvitations({
     tenantDb: context.tenantDb,
     status: input.status,
     email: input.email,
-    invitedBy: context.member.userId, // Optionally filter by inviter
   });
```

That's the whole fix — one line deleted. The permission check above already enforces access; the filter was the bug.

**Why not a conditional filter?** The `list` procedure requires `user_management:read` to even reach the filter line. If the user lacks the permission, they get a 403 before the filter runs. So there is no "non-admin fallback" case to preserve — non-admins never called this successfully in the first place.

**If** we later want a "my invitations" view for non-admins, add a separate `listMine` procedure that does not require `user_management:read` and filters by `invitedBy` explicitly.

### Files Touched

| File | Change |
|------|--------|
| `packages/api/src/routers/invitations.ts` | Permission-gated filter in `list` procedure |
| `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/invitations.tsx` | No frontend change — same query |

### Test Plan

- Admin logs in → sees invitations from all admins in their org
- User with `user_management:read` (non-admin role) → sees all
- User without `user_management:read` → receives 403 (unchanged behavior)
- Seed data: one invitation from Admin A, one from Admin B, one from Staff C (where Staff C lacks `user_management:read`)

### Acceptance

- Integration test added: `apps/server/src/tests/integration/invitations-scope.test.ts`
- Manually verified in the dashboard by logging in as two different admins

### Out of Scope for This Ticket

- The client-side "normalize expired" logic documented in Section 14d — unchanged
- Invitation revocation / resend logic — unchanged
- Cross-org invitation visibility — not a feature

---

## Deployment Coupling

Ticket A and Ticket B are independent. Deploy in either order.

- Ticket A is frontend-only (beforeLoad guard + component gate). Safe to merge anytime.
- Ticket B is backend + touches a hot endpoint. Smoke test the Invitations page after merge.
