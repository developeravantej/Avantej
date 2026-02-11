# API Documentation - Avantej Core Platform Server

This document provides a comprehensive overview of all APIs available in the Avantej Core Platform server.

## Table of Contents

1. [API Architecture](#api-architecture)
2. [REST API Routes](#rest-api-routes)
3. [oRPC Procedures](#orpc-procedures)
4. [Better-Auth Routes](#better-auth-routes)
5. [Webhook Endpoints](#webhook-endpoints)
6. [API Access Patterns](#api-access-patterns)
7. [Authentication & Authorization](#authentication--authorization)

---

## API Architecture

The server uses a hybrid approach combining:
- **REST API Routes** (Hono) - For OpenAPI-compliant endpoints
- **oRPC Procedures** - For type-safe RPC calls (used by frontend)
- **Better-Auth Routes** - For authentication flows

### Base URLs

- **Development**: `http://localhost:3000`
- **Production**: Configured via environment variables

### API Endpoints

- REST APIs: `/` (health check), `/auth/*`, `/orgs/*`, `/webhooks/*`
- oRPC APIs: `/rpc/*`
- OpenAPI Reference: `/api-reference/*`
- Better-Auth: `/api/auth/*`

---

## REST API Routes

### Authentication Routes (`/auth/*`)

All authentication routes are defined in `src/routes/auth.routes.ts`.

#### POST `/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "message": "Verification email sent"
}
```

**Errors:**
- `400` - Missing required fields or password too short
- `409` - Email already registered

---

#### POST `/auth/login`

Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "accessToken": "jwt-token",
  "refreshToken": "",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": true,
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "organizations": [
    {
      "id": "uuid",
      "name": "Organization Name",
      "slug": "org-slug",
      "role": "admin"
    }
  ]
}
```

**Errors:**
- `400` - Missing email or password
- `401` - Invalid credentials
- `403` - Email not verified

---

#### POST `/auth/verify-email`

Verify email address via token.

**Request Body:**
```json
{
  "token": "verification-token"
}
```

**Response (200):**
```json
{
  "message": "Email verified successfully"
}
```

**Errors:**
- `400` - Missing token or invalid/expired token

---

#### POST `/auth/reset-password`

Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "If the email exists, a password reset link has been sent"
}
```

**Note:** Always returns 200 to prevent email enumeration.

---

#### POST `/auth/reset-password/confirm`

Confirm password reset with token.

**Request Body:**
```json
{
  "token": "reset-token",
  "newPassword": "newsecurepassword123"
}
```

**Response (200):**
```json
{
  "message": "Password updated successfully"
}
```

**Errors:**
- `400` - Missing token/password or password too short, invalid/expired token

---

#### POST `/auth/logout`

Logout and invalidate session.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

**Errors:**
- `401` - Unauthorized

---

#### POST `/auth/refresh`

Refresh access token using refresh token.

**Headers:**
- `Cookie: better-auth.session_token=<token>` (required)

**Response (200):**
```json
{
  "accessToken": "new-jwt-token"
}
```

**Errors:**
- `401` - Invalid refresh token

---

#### GET `/auth/organizations`

Get current user's organizations.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "organizations": [
    {
      "id": "uuid",
      "name": "Organization Name",
      "slug": "org-slug",
      "role": "admin"
    }
  ]
}
```

**Errors:**
- `401` - Unauthorized
- `500` - Failed to retrieve organizations

---

#### GET `/auth/user-context`

Get current user's complete context: user data, organizations, hierarchy, and permissions.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": true
  },
  "organizations": [
    {
      "id": "uuid",
      "name": "Organization Name",
      "slug": "org-slug",
      "role": "admin",
      "hierarchy": {
        "nodes": [
          {
            "id": "uuid",
            "name": "Node Name",
            "type": "branch",
            "depth": 3,
            "parentId": "uuid",
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z"
          }
        ],
        "member": {
          "role": "admin",
          "hierarchyScopeId": "uuid",
          "hierarchyScopeName": "Organization Name",
          "accessibleNodeIds": ["uuid1", "uuid2"]
        }
      }
    }
  ],
  "currentOrganizationId": "uuid"
}
```

**Errors:**
- `401` - Unauthorized
- `500` - Failed to retrieve user context

---

### Organization Routes (`/orgs/*`)

All organization routes are defined in `src/routes/organizations.routes.ts`.

#### POST `/orgs`

Create new organization (requires active subscription).

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "name": "My Organization",
  "slug": "my-org",
  "subscriptionId": "uuid"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "name": "My Organization",
  "slug": "my-org",
  "neonBranchId": "neon-project-id",
  "subscriptionId": "uuid",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `400` - Missing required fields or invalid slug format
- `401` - Unauthorized
- `403` - Subscription not active or limit reached
- `409` - Slug already taken
- `404` - Subscription not found
- `500` - Failed to create organization

**Note:** This endpoint:
- Provisions a Neon database project
- Runs tenant migrations
- Seeds RBAC data
- Creates default hierarchy node
- Adds user as organization admin

---

#### GET `/orgs/:id`

Get organization details.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "id": "uuid",
  "name": "My Organization",
  "slug": "my-org",
  "neonBranchId": "neon-project-id",
  "subscriptionId": "uuid",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `401` - Unauthorized
- `403` - User not a member of this organization
- `404` - Organization not found

---

#### PATCH `/orgs/:id`

Update organization details (admin only).

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "name": "Updated Name",
  "slug": "updated-slug"
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "name": "Updated Name",
  "slug": "updated-slug",
  "neonBranchId": "neon-project-id",
  "subscriptionId": "uuid",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `400` - Invalid slug format
- `401` - Unauthorized
- `403` - User does not have admin role
- `404` - Organization not found
- `409` - Slug already taken

---

#### DELETE `/orgs/:id`

Delete organization (admin only, cascade deletes all data).

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (204):** No content

**Errors:**
- `401` - Unauthorized
- `403` - User does not have admin role
- `404` - Organization not found

**Note:** Currently only deletes organization record. Tenant database remains but becomes inaccessible.

---

#### GET `/orgs/:id/context`

Get organization context (hierarchy tree, member role, accessible nodes).

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "organization": {
    "id": "uuid",
    "name": "My Organization",
    "slug": "my-org",
    "neonBranchId": "neon-project-id",
    "subscriptionId": "uuid",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "member": {
    "id": "uuid",
    "userId": "uuid",
    "organizationId": "uuid",
    "role": "admin",
    "hierarchyScopeId": "uuid",
    "hierarchyScopeName": "Organization Name",
    "status": "active",
    "joinedAt": "2024-01-01T00:00:00Z"
  },
  "hierarchyTree": [
    {
      "id": "uuid",
      "name": "Organization Name",
      "type": "organization",
      "parentId": null,
      "depth": 0,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "children": []
    }
  ],
  "accessibleNodeIds": ["uuid1", "uuid2"]
}
```

**Errors:**
- `401` - Unauthorized
- `404` - Organization context not found

---

### Hierarchy Routes (`/orgs/:organizationId/hierarchy/*`)

All hierarchy routes are defined in `src/routes/hierarchy.routes.ts`.

#### POST `/orgs/:organizationId/hierarchy/nodes`

Create a new hierarchy node (country, region, area, or branch).

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "type": "branch",
  "name": "Branch Name",
  "code": "BR001",
  "parentId": "uuid"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "name": "Branch Name",
  "type": "branch",
  "depth": 3,
  "parentId": "uuid",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `400` - Missing required fields, invalid type, or validation failed
- `401` - Unauthorized
- `403` - Permission denied
- `404` - Parent node not found
- `500` - Failed to create hierarchy node

**Valid Types:** `country`, `region`, `area`, `branch`

**Required Permission:** `hierarchy_management:create`

---

#### GET `/orgs/:organizationId/hierarchy/nodes`

List all hierarchy nodes in the organization.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "nodes": [
    {
      "id": "uuid",
      "name": "Branch Name",
      "type": "branch",
      "depth": 3,
      "parentId": "uuid",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Errors:**
- `401` - Unauthorized
- `500` - Failed to list hierarchy nodes

**Note:** Returns only nodes accessible by the current user based on their hierarchy scope.

---

### Invitation Routes (`/api/invitations/*`)

All invitation routes are defined in `src/routes/invitations.routes.ts`.

#### POST `/api/invitations/send-email`

Send invitation email via Resend.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "invitation": {
    "token": "invitation-token",
    "email": "invitee@example.com",
    "role": "trainer"
  },
  "organizationId": "uuid",
  "organizationName": "My Organization",
  "inviterName": "John Doe"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Invitation email sent successfully"
}
```

**Errors:**
- `400` - Invalid invitation data or missing organization ID
- `401` - Unauthorized
- `500` - Failed to send invitation email

---

### Webhook Routes (`/webhooks/*`)

All webhook routes are defined in `src/routes/webhooks.routes.ts`.

#### POST `/webhooks/stripe`

Handle Stripe webhook events.

**Headers:**
- `stripe-signature: <signature>` (required)

**Request Body:** Raw Stripe event JSON

**Response (200):**
```json
{
  "received": true
}
```

**Errors:**
- `400` - Missing signature or invalid signature
- `500` - Failed to process webhook

**Handled Events:**
- `checkout.session.completed` - Payment succeeded, provision organization
- `customer.subscription.created` - New subscription created
- `customer.subscription.updated` - Subscription updated
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Invoice payment succeeded
- `invoice.payment_failed` - Invoice payment failed

---

### Root Endpoint

#### GET `/`

Simple health check endpoint that returns "OK".

**Response (200):**
```
OK
```

**Note:** This is a public endpoint that can be used to verify server availability.

---

## oRPC Procedures

oRPC provides type-safe RPC procedures accessible via `/rpc/*`. All procedures are defined in `packages/api/src/routers/` and extended in `apps/server/src/routers/`.

### Base Router Procedures

#### `healthCheck`

Public health check endpoint.

**Input:** None

**Response:**
```typescript
"OK"
```

---

#### `privateData`

Get private data (requires authentication).

**Input:** None

**Response:**
```typescript
{
  message: string;
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
  } | null;
}
```

---

### Auth Router (`auth.*`)

All auth procedures are defined in `apps/server/src/routers/auth.ts`.

#### `auth.login`

Sign in with email and password, returns user context.

**Input:**
```typescript
{
  email: string;
  password: string;
}
```

**Response:**
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: Date;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
}
```

**Errors:**
- `UNAUTHORIZED` - Invalid credentials
- `FORBIDDEN` - Email not verified

---

#### `auth.userContext`

Get current user's complete context (requires authentication).

**Input:** None

**Response:**
```typescript
{
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    hierarchy: {
      nodes: Array<{
        id: string;
        name: string;
        type: string;
        depth: number;
        parentId: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
      }>;
      member: {
        role: string;
        hierarchyScopeId: string;
        hierarchyScopeName: string;
        accessibleNodeIds: string[];
      } | null;
    };
  }>;
  currentOrganizationId: string | null;
}
```

**Errors:**
- `UNAUTHORIZED` - Not authenticated

---

#### `auth.verifyEmail`

Verify email address via token.

**Input:**
```typescript
{
  token: string;
}
```

**Response:**
```typescript
{
  message: string;
}
```

**Errors:**
- `BAD_REQUEST` - Invalid or expired token

---

### Hierarchy Router (`hierarchy.*`)

All hierarchy procedures are defined in `packages/api/src/routers/hierarchy.ts`.

#### `hierarchy.createNode`

Create a hierarchy node (country, region, area, or branch).

**Input:**
```typescript
{
  organizationId: string;
  type: "country" | "region" | "area" | "branch";
  name: string;
  code?: string;
  parentId?: string;
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId: string | null;
  address?: string | null;
  picUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**Required Permission:** `hierarchy_management:create`

---

#### `hierarchy.listNodes`

List all hierarchy nodes in the organization.

**Input:**
```typescript
{
  organizationId: string;
}
```

**Response:**
```typescript
{
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    depth: number;
    parentId: string | null;
    address?: string | null;
    picUserId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}
```

---

#### `hierarchy.getNode`

Get a single hierarchy node by ID.

**Input:**
```typescript
{
  organizationId: string;
  nodeId: string;
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId: string | null;
  address?: string | null;
  picUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**Errors:**
- `NOT_FOUND` - Node not found
- `FORBIDDEN` - User does not have access to this node

---

#### `hierarchy.updateNode`

Update a hierarchy node.

**Input:**
```typescript
{
  organizationId: string;
  nodeId: string;
  name?: string;
  address?: string | null;
  picUserId?: string | null;
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId: string | null;
  address?: string | null;
  picUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**Required Permission:** `hierarchy_management:update`

---

#### `hierarchy.deleteNode`

Delete a hierarchy node (soft delete with automatic child handling).

**Input:**
```typescript
{
  organizationId: string;
  nodeId: string;
  options?: {
    autoDeleteChildren?: boolean; // default: true
    autoReassignMembers?: boolean; // default: true
  };
}
```

**Response:**
```typescript
{
  success: boolean;
}
```

**Required Permission:** `hierarchy_management:delete`

**Note:** By default, automatically:
- Recursively soft-deletes all active child nodes
- Reassigns members to parent node (or org root if no parent)

---

#### `hierarchy.moveNode`

Move a hierarchy node to a new parent.

**Input:**
```typescript
{
  organizationId: string;
  nodeId: string;
  newParentId: string;
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId: string | null;
  address?: string | null;
  picUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**Required Permission:** `hierarchy_management:update`

**Errors:**
- `BAD_REQUEST` - Circular reference, invalid parent type, or depth mismatch

---

#### `hierarchy.getDescendants`

Get all descendant nodes of a given node.

**Input:**
```typescript
{
  organizationId: string;
  nodeId: string;
}
```

**Response:**
```typescript
{
  descendants: Array<{
    id: string;
    name: string;
    type: string;
    depth: number;
    parentId: string | null;
    address?: string | null;
    picUserId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}
```

---

#### `hierarchy.listMembers`

List members assigned to a hierarchy node.

**Input:**
```typescript
{
  organizationId: string;
  hierarchyScopeId: string;
}
```

**Response:**
```typescript
{
  members: Array<{
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  }>;
}
```

**Required Permission:** `user_management:read`

---

#### `hierarchy.reassignMember`

Reassign a member to a new hierarchy scope.

**Input:**
```typescript
{
  organizationId: string;
  memberId: string;
  newHierarchyScopeId: string;
}
```

**Response:**
```typescript
{
  member: {
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  };
}
```

**Required Permission:** `user_management:update`

---

#### `hierarchy.bulkReassignMembers`

Bulk reassign members to a new hierarchy scope.

**Input:**
```typescript
{
  organizationId: string;
  memberIds: string[];
  newHierarchyScopeId: string;
}
```

**Response:**
```typescript
{
  members: Array<{
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  }>;
}
```

**Required Permission:** `user_management:update`

---

#### `hierarchy.listAllMembers`

List all members in the organization with user details.

**Input:**
```typescript
{
  organizationId: string;
  includeInactive?: boolean; // default: false
}
```

**Response:**
```typescript
{
  members: Array<{
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
    user: {
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
    } | null;
  }>;
}
```

**Required Permission:** `user_management:read`

---

### Invitation Router (`invitations.*`)

All invitation procedures are defined in `packages/api/src/routers/invitations.ts` and extended in `apps/server/src/routers/invitations.ts`.

#### `invitations.create`

Create invitation.

**Input:**
```typescript
{
  organizationId: string;
  email: string;
  role: "admin" | "trainer" | "staff" | "client";
  hierarchyScopeId: string;
}
```

**Response:**
```typescript
{
  invitation: {
    id: string;
    email: string;
    role: string;
    hierarchyScopeId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
  };
  organizationId: string;
  organizationName: string;
  inviterName?: string;
}
```

**Required Permission:** `user_management:create`

**Errors:**
- `CONFLICT` - Pending invitation already exists or user already a member

---

#### `invitations.accept`

Accept invitation (public endpoint).

**Input:**
```typescript
{
  token: string;
  organizationId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
  organizationId: string;
}
```

**Errors:**
- `UNAUTHORIZED` - User not logged in
- `FORBIDDEN` - Email mismatch
- `CONFLICT` - User already a member
- `BAD_REQUEST` - Invalid or expired invitation

---

#### `invitations.verifyEmailByToken`

Pre-verify invited email (public endpoint).

**Input:**
```typescript
{
  token: string;
  organizationId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  updated: boolean;
}
```

---

#### `invitations.getByToken`

Get invitation by token (public endpoint).

**Input:**
```typescript
{
  token: string;
  organizationId: string;
}
```

**Response:**
```typescript
{
  invitation: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  };
  isValid: boolean;
  error?: string;
}
```

---

#### `invitations.decline`

Decline invitation (public endpoint).

**Input:**
```typescript
{
  token: string;
  organizationId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  invitation: {
    id: string;
    email: string;
    status: string;
  };
}
```

---

#### `invitations.list`

List invitations in the organization.

**Input:**
```typescript
{
  organizationId: string;
  status?: "pending" | "accepted" | "declined" | "expired";
  email?: string;
}
```

**Response:**
```typescript
{
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }>;
}
```

**Required Permission:** `user_management:read`

---

#### `invitations.revoke`

Revoke invitation.

**Input:**
```typescript
{
  organizationId: string;
  invitationId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  invitation: {
    id: string;
    email: string;
    status: string;
  };
}
```

**Required Permission:** `user_management:delete`

---

#### `invitations.resend`

Resend invitation (extends expiration).

**Input:**
```typescript
{
  organizationId: string;
  invitationId: string;
}
```

**Response:**
```typescript
{
  invitation: {
    id: string;
    email: string;
    role: string;
    hierarchyScopeId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
  };
  organizationId: string;
  organizationName: string;
  inviterName?: string;
}
```

**Required Permission:** `user_management:create`

---

#### `invitations.sendEmail`

Send invitation email via Resend (server-specific).

**Input:**
```typescript
{
  invitation: {
    token: string;
    email: string;
    role: string;
  };
  organizationId: string;
  organizationName?: string;
  inviterName?: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

### Member Router (`members.*`)

All member procedures are defined in `packages/api/src/routers/members.ts`.

#### `members.create`

Create a new member in the organization.

**Input:**
```typescript
{
  organizationId: string;
  email: string;
  role: "admin" | "trainer" | "staff" | "client";
  hierarchyScopeId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  member: {
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  };
}
```

**Required Permission:** `user_management:create`

**Errors:**
- `NOT_FOUND` - User with email not found
- `CONFLICT` - User already a member

---

#### `members.getById`

Get member by ID.

**Input:**
```typescript
{
  organizationId: string;
  memberId: string;
}
```

**Response:**
```typescript
{
  member: {
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  };
  accessibleNodeIds: string[];
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  } | null;
}
```

**Required Permission:** `user_management:read`

---

#### `members.updateRole`

Update member role.

**Input:**
```typescript
{
  organizationId: string;
  memberId: string;
  newRole: "admin" | "trainer" | "staff" | "client";
}
```

**Response:**
```typescript
{
  success: boolean;
  member: {
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  };
}
```

**Required Permission:** `user_management:update`

---

#### `members.suspend`

Suspend member.

**Input:**
```typescript
{
  organizationId: string;
  memberId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  member: {
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  };
}
```

**Required Permission:** `user_management:update`

---

#### `members.reactivate`

Reactivate suspended member.

**Input:**
```typescript
{
  organizationId: string;
  memberId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  member: {
    id: string;
    userId: string;
    role: string;
    hierarchyScopeId: string;
    status: string;
    joinedAt: Date;
  };
}
```

**Required Permission:** `user_management:update`

---

#### `members.remove`

Remove member from organization.

**Input:**
```typescript
{
  organizationId: string;
  memberId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Required Permission:** `user_management:delete`

**Errors:**
- `BAD_REQUEST` - Cannot remove last admin

---

### Admin Router (`admin.*`)

All admin procedures are defined in `apps/server/src/routers/admin.ts`. **All procedures require platform admin access.**

#### `admin.listTenants`

List all organizations with pagination and filters.

**Input:**
```typescript
{
  status?: "active" | "suspended";
  search?: string;
  page?: number; // default: 1
  limit?: number; // default: 50, max: 100
}
```

**Response:**
```typescript
{
  data: Array<{
    id: string;
    name: string;
    slug: string;
    status: "active" | "suspended";
    neonBranchId: string;
    subscriptionId: string;
    subscriptionTier: "starter" | "professional" | "enterprise";
    memberCount: number;
    createdAt: Date;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
  };
}
```

---

#### `admin.getTenant`

Get tenant details with subscription info and member count.

**Input:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  neonBranchId: string;
  subscriptionId: string;
  subscriptionTier: "starter" | "professional" | "enterprise";
  memberCount: number;
  createdAt: Date;
  ownerUserId?: string;
  ownerEmail?: string;
  hierarchyNodeCount: number;
  subscription?: {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    tier: string;
    organizationCountLimit: number;
    status: string;
  };
}
```

---

#### `admin.suspendTenant`

Suspend organization.

**Input:**
```typescript
{
  id: string;
  reason: string;
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  neonBranchId: string;
  subscriptionId: string;
  subscriptionTier: "starter" | "professional" | "enterprise";
  memberCount: number;
  createdAt: Date;
}
```

---

#### `admin.unsuspendTenant`

Restore suspended organization.

**Input:**
```typescript
{
  id: string;
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  neonBranchId: string;
  subscriptionId: string;
  subscriptionTier: "starter" | "professional" | "enterprise";
  memberCount: number;
  createdAt: Date;
}
```

---

#### `admin.startImpersonation`

Start impersonation session.

**Input:**
```typescript
{
  userId: string;
  organizationId?: string;
}
```

**Response:**
```typescript
{
  impersonationToken: string;
  sessionId: string;
  expiresAt: Date;
}
```

**Note:** Impersonation tokens expire after 1 hour.

---

#### `admin.exitImpersonation`

End impersonation session.

**Input:**
```typescript
{
  sessionId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
}
```

---

#### `admin.getAuditLogs`

Get audit logs (stub implementation).

**Input:**
```typescript
{
  organizationId?: string;
  userId?: string;
  action?: "organization.created" | "organization.suspended" | "member.invited" | "member.removed" | "impersonation.started" | "impersonation.ended";
  startDate?: string;
  endDate?: string;
  page?: number; // default: 1
  limit?: number; // default: 50, max: 200
}
```

**Response:**
```typescript
{
  data: Array<never>; // Currently returns empty array
  pagination: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
  };
}
```

**Note:** TODO: Implement audit log system.

---

#### `admin.getStats`

Get platform statistics.

**Input:** None

**Response:**
```typescript
{
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  totalMembers: number;
  activeSubscriptions: number;
}
```

---

## Better-Auth Routes

Better-Auth handles internal authentication routes at `/api/auth/*`. These are managed by Better-Auth library and include:

- `POST /api/auth/sign-in/email` - Internal sign-in
- `POST /api/auth/sign-up/email` - Internal sign-up
- `POST /api/auth/sign-out` - Internal sign-out
- `GET /api/auth/session` - Get session

These routes are used internally by the custom auth routes and oRPC procedures.

---

## API Access Patterns

### REST API Usage

```typescript
// Example: Login
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const data = await response.json();
```

### oRPC Usage

```typescript
import { createClient } from '@orpc/client';
import type { AppRouter } from '@avantej-core/api';

const client = createClient<AppRouter>({
  baseURL: 'http://localhost:3000/rpc'
});

// Type-safe call
const result = await client.hierarchy.listNodes({
  organizationId: 'uuid'
});
```

---

## Authentication & Authorization

### Authentication

- **REST APIs**: Use `Authorization: Bearer <token>` header
- **oRPC Procedures**: Session is automatically extracted from cookies/headers
- **Better-Auth**: Uses HTTP-only cookies for session management

### Authorization

The platform uses a **Role-Based Access Control (RBAC)** system with permissions:

**Roles:**
- `admin` - Organization administrator
- `trainer` - Trainer role
- `staff` - Staff member
- `client` - Client/customer

**Permission Categories:**
- `hierarchy_management` - Create, update, delete hierarchy nodes
- `user_management` - Create, read, update, delete members

**Permission Actions:**
- `create` - Create new resources
- `read` - View resources
- `update` - Modify resources
- `delete` - Remove resources

**Hierarchy Scoping:**
- Members are assigned to a hierarchy scope (node)
- Access is limited to descendant nodes of the assigned scope
- Admins have access to all nodes regardless of scope

---

## Error Codes

### HTTP Status Codes (REST APIs)

- `200` - Success
- `201` - Created
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

### oRPC Error Codes

- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Permission denied
- `NOT_FOUND` - Resource not found
- `BAD_REQUEST` - Invalid input
- `CONFLICT` - Resource conflict
- `INTERNAL_SERVER_ERROR` - Server error

---

## Testing

### Running Tests

```bash
# All tests
cd apps/server
bun run test

# Unit tests only
bun run test:unit

# Integration tests only
bun run test:integration
```

### Test Files

- Unit tests: `src/**/*.test.ts`
- Integration tests: `src/**/*.integration.test.ts`
- Test utilities: `src/tests/`

---

## Additional Resources

- **OpenAPI Documentation**: Available at `/api-reference/*` when server is running
- **Testing Guide**: See `TESTING.md` for detailed testing instructions
- **API Contracts**: See `specs/001-implement-multi-tenant/contracts/` for OpenAPI specifications

---

## Notes

1. **Multi-Tenancy**: Each organization has its own tenant database (Neon project)
2. **Database Encryption**: Connection strings are encrypted in the control panel database
3. **Hierarchy System**: Supports 4-level hierarchy: Organization → Country → Region → Area → Branch
4. **Permission System**: RBAC with hierarchy scoping for fine-grained access control
5. **Email Verification**: Required before login
6. **Subscription Required**: Active subscription required to create organizations

---

**Last Updated:** Generated from codebase analysis
**Version:** 1.0.0
