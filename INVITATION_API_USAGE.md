# Invitation API Usage Guide

This document explains how to use the Invitation API endpoints and integrate them with email sending via Resend.

## Overview

The Invitation API is fully implemented and ready to use. Invitations are stored in tenant databases and include:
- Unique token for invitation links
- Email address of invitee
- Role assignment (admin, trainer, staff, client)
- Hierarchy scope (which branch/area/region/country they'll be assigned to)
- Expiration date (7 days from creation)

## API Endpoints

All endpoints are available via oRPC at `/rpc`:

### 1. Create Invitation

```typescript
// Frontend/Client Usage
import { client } from "@/utils/orpc";

const result = await client.invitations.create({
  organizationId: "org-uuid-123",
  email: "trainer@example.com",
  role: "trainer",
  hierarchyScopeId: "branch-uuid-456",
});

// Result includes:
// - invitation.token (for constructing email link)
// - invitation.id
// - organizationId
// - organizationName
// - inviterName
```

**Important**: This endpoint returns the invitation token but does NOT send the email. You must send the email separately.

### 2. Send Invitation Email (Server-Side)

After creating an invitation, send the email using Resend:

```typescript
// Server-side wrapper (apps/server/src/routes/invitations.routes.ts)
import { sendInvitationEmail } from "@/lib/email";
import { client } from "@avantej-core/api/client"; // Or use direct API call

export async function createAndSendInvitation(params: {
  organizationId: string;
  email: string;
  role: string;
  hierarchyScopeId: string;
  context: Context; // Hono context
}) {
  // 1. Create invitation via API
  const result = await client.invitations.create({
    organizationId: params.organizationId,
    email: params.email,
    role: params.role,
    hierarchyScopeId: params.hierarchyScopeId,
  });

  // 2. Construct invitation link with token and orgId
  const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const invitationLink = `${baseURL}/accept-invitation?token=${result.invitation.token}&orgId=${result.organizationId}`;

  // 3. Send email via Resend
  await sendInvitationEmail(
    result.invitation.email,
    invitationLink,
    result.organizationName,
    result.inviterName,
    result.invitation.role
  );

  return result;
}
```

### 3. Accept Invitation

```typescript
// Public endpoint - user may not be logged in yet
const result = await client.invitations.accept({
  token: "invitation-token-from-email",
  organizationId: "org-uuid-123",
});

// If user is not logged in, returns UNAUTHORIZED error
// Frontend should redirect to: /signup?invitationToken={token}&orgId={orgId}
```

### 4. Get Invitation by Token

```typescript
// Public endpoint - check invitation status before accepting
const result = await client.invitations.getByToken({
  token: "invitation-token",
  organizationId: "org-uuid-123",
});

// Returns:
// - invitation details (email, role, status, expiresAt)
// - isValid: boolean
// - error: string (if invalid)
```

### 5. List Invitations

```typescript
// Protected endpoint - requires user_management.read permission
const result = await client.invitations.list({
  organizationId: "org-uuid-123",
  status: "pending", // optional: "pending" | "accepted" | "declined" | "expired"
  email: "user@example.com", // optional: filter by email
});

// Returns array of invitations (without tokens for security)
```

### 6. Revoke Invitation

```typescript
// Protected endpoint - requires user_management.delete permission
const result = await client.invitations.revoke({
  organizationId: "org-uuid-123",
  invitationId: "invitation-uuid",
});
```

### 7. Resend Invitation

```typescript
// Protected endpoint - requires user_management.create permission
const result = await client.invitations.resend({
  organizationId: "org-uuid-123",
  invitationId: "invitation-uuid",
});

// Returns updated invitation with new token and expiration
// You must send the email separately (same as create)
```

## Invitation Link Structure

Invitation links must include both `token` and `orgId` for proper tenant routing:

```
https://yourapp.com/accept-invitation?token={invitationToken}&orgId={organizationId}
```

**Why both parameters?**
- `token`: Identifies the specific invitation in the tenant database
- `orgId`: Routes the request to the correct tenant database (each franchisee has their own DB)

## Complete Flow Example

### Step 1: Admin Creates and Sends Invitation

```typescript
// Server-side route handler
app.post("/api/invitations/create-and-send", authMiddleware, tenantMiddleware, async (c) => {
  const { email, role, hierarchyScopeId } = await c.req.json();
  const organizationId = c.get("organizationId");
  
  // Create invitation
  const invitationResult = await client.invitations.create({
    organizationId,
    email,
    role,
    hierarchyScopeId,
  });
  
  // Construct link
  const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const invitationLink = `${baseURL}/accept-invitation?token=${invitationResult.invitation.token}&orgId=${organizationId}`;
  
  // Send email
  await sendInvitationEmail(
    email,
    invitationLink,
    invitationResult.organizationName,
    invitationResult.inviterName,
    role
  );
  
  return c.json({ success: true, invitationId: invitationResult.invitation.id });
});
```

### Step 2: User Receives Email and Clicks Link

The email contains a link like:
```
https://yourapp.com/accept-invitation?token=abc123xyz&orgId=org-uuid-123
```

### Step 3: Frontend Handles Invitation Acceptance

```typescript
// apps/web/src/routes/accept-invitation.tsx
export function AcceptInvitationPage() {
  const { token, orgId } = useSearch();
  const { data: session } = authClient.useSession();
  
  // If not logged in, redirect to signup with invitation params
  if (!session) {
    navigate({
      to: "/signup",
      search: { invitationToken: token, orgId },
    });
    return null;
  }
  
  // If logged in, accept invitation
  const acceptMutation = useMutation({
    mutationFn: async () => {
      return await client.invitations.accept({
        token,
        organizationId: orgId,
      });
    },
    onSuccess: () => {
      toast.success("Successfully joined organization!");
      navigate({ to: `/dashboard/${orgId}` });
    },
  });
  
  useEffect(() => {
    if (session && token && orgId) {
      acceptMutation.mutate();
    }
  }, [session, token, orgId]);
  
  return <Loader />;
}
```

### Step 4: Backend Creates Member

When `invitations.accept` is called:
1. Validates invitation (status, expiration, email match)
2. Checks if user is already a member
3. Creates member record via `MembershipService.createMember()`:
   - Inserts into `control_panel.organization_members`
   - Inserts into `tenant.members`
   - Updates `tenant.invitations.status` to "accepted"

## Security Considerations

1. **Token Uniqueness**: Tokens are unique per tenant (stored in tenant DB)
2. **Email Verification**: User's email must match invitation email
3. **Expiration**: 7-day expiry enforced
4. **Status Check**: Only "pending" invitations can be accepted
5. **Organization Routing**: `orgId` ensures correct tenant database access
6. **Permission Checks**: Creating/listing/revoking invitations requires `user_management` permissions

## Environment Variables

Required for email sending:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourapp.com
RESEND_FROM_NAME=Your App Name
BETTER_AUTH_URL=https://yourapp.com
```

## Notes

- Email sending is handled at the server level (not in `packages/api`) to avoid dependency on `apps/server`
- The invitation API returns tokens for link construction, allowing flexibility in email templates
- Invitation acceptance automatically creates member records via `MembershipService`
- Invitations are tenant-specific (stored in each franchisee's database)

