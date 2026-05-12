# Feature Specification: Multi-Tenant Authentication & Organization Management

**Feature Branch**: `001-implement-multi-tenant`
**Created**: 2025-10-08
**Status**: Draft
**Input**: User description: "Implement multi-tenant authentication and organization management using Better-Auth with Organization and Admin plugins"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Franchise Owner Onboarding & Organization Setup (Priority: P1)

After completing payment through Stripe, a franchise owner creates their account and establishes their organization with an initial hierarchical structure.

**Why this priority**: This is the foundation of the entire platform. Without successful organization creation post-payment, no other features can function. This represents the critical path for tenant provisioning in the B2B2C model.

**Independent Test**: Can be fully tested by completing a Stripe payment transaction, creating a user account, and verifying that one organization is created with at least one branch in the hierarchy. Delivers immediate value by enabling the franchise to begin operations.

**Acceptance Scenarios**:

1. **Given** a franchise owner has completed Stripe payment successfully, **When** they create their account with email and password, **Then** they receive a verification email and can access the organization setup wizard
2. **Given** a verified franchise owner account, **When** they complete the organization setup form (organization name, first country, region, area, and branch), **Then** an organization is created with the complete hierarchy and they are assigned as the organization owner
3. **Given** a payment failure or pending payment status, **When** a user attempts to create an organization, **Then** organization creation is blocked and they receive a message to complete payment first
4. **Given** a franchise owner with an existing organization, **When** they attempt to create a second organization without upgrading their subscription, **Then** creation is blocked with a message to upgrade their subscription plan
5. **Given** a completed organization setup, **When** the franchise owner logs in, **Then** they see their organization dashboard with their hierarchy structure displayed

---

### User Story 2 - Hierarchical Structure Management (Priority: P2)

Franchise administrators expand and manage their organizational hierarchy by adding countries, regions, areas, and branches as their business grows.

**Why this priority**: After initial setup, franchises need to expand their structure to represent their geographical or operational divisions. This enables proper access control and reporting segmentation.

**Independent Test**: Can be fully tested by logging in as an organization owner, adding new hierarchy nodes (country, region, area, branch), and verifying they appear in the structure. Delivers value by allowing organizational growth without platform limitations.

**Acceptance Scenarios**:

1. **Given** an organization owner is logged in, **When** they navigate to the organizational structure page, **Then** they see a tree view of their current hierarchy (Organization → Countries → Regions → Areas → Branches)
2. **Given** an organization owner viewing the hierarchy, **When** they add a new country under the organization, **Then** the country appears in the hierarchy and they can add regions under it
3. **Given** a region with no child areas, **When** an administrator attempts to delete the region, **Then** the deletion succeeds and the region is removed from the hierarchy
4. **Given** a region with existing child areas, **When** an administrator attempts to delete the region, **Then** the deletion is blocked with a message to remove or reassign child areas first
5. **Given** an administrator adding a new branch, **When** they complete the branch details form (name, address, parent area), **Then** the branch is created and trainers can be assigned to it

---

### User Story 3 - Team Member Invitation with Hierarchy Scoping (Priority: P3)

Franchise administrators invite team members (trainers, staff, regional managers) and assign them roles scoped to specific hierarchy levels.

**Why this priority**: Once the structure is in place, franchises need to onboard their team. Hierarchy-scoped roles ensure regional managers only access their regions, and trainers only manage their assigned branches.

**Independent Test**: Can be fully tested by inviting users with different roles (organization admin, regional manager, branch trainer), verifying invitations are sent, users can accept, and their access is correctly scoped to their hierarchy level. Delivers value by enabling team collaboration with proper access boundaries.

**Acceptance Scenarios**:

1. **Given** an organization owner, **When** they invite a user with email "trainer@gym.com" as a Trainer for Branch A, **Then** an invitation email is sent and the invitation appears as pending in the members list
2. **Given** a pending invitation, **When** the invited user clicks the invitation link and creates their account, **Then** they are added as a member with Trainer role scoped to Branch A
3. **Given** a regional manager invitation, **When** the user accepts the invitation, **Then** they can access all branches under their assigned region but cannot access other regions
4. **Given** an organization with 50 members, **When** an administrator views the members list, **Then** they can filter by role, hierarchy level, and search by name or email
5. **Given** an administrator viewing a member's profile, **When** they update the member's role from Trainer to Staff, **Then** the member's permissions update immediately and they receive a notification
6. **Given** an invitation that has not been accepted within 7 days, **When** the expiration time is reached, **Then** the invitation is marked as expired and cannot be accepted
7. **Given** a user invited to multiple branches, **When** they log in, **Then** they can switch their active branch context and see data relevant to the selected branch

---

### User Story 4 - Avantej Admin Control Panel (Priority: P4)

Avantej platform administrators monitor and manage all tenant organizations through a centralized control panel without accessing tenant data.

**Why this priority**: Platform operators need oversight capabilities to manage subscriptions, respond to support requests, and monitor platform health. This is separate from tenant operations and provides B2B SaaS governance.

**Independent Test**: Can be fully tested by logging in as an Avantej admin, viewing tenant lists, checking payment statuses, and performing administrative actions (suspend, audit logs). Delivers value by enabling platform management without manual database access.

**Acceptance Scenarios**:

1. **Given** an Avantej administrator is logged in, **When** they access the admin control panel, **Then** they see a list of all tenant organizations with metadata (name, payment status, member count, created date)
2. **Given** an Avantej admin viewing the tenant list, **When** they search for an organization by name or email domain, **Then** matching organizations are displayed with their current status
3. **Given** an Avantej admin viewing a specific organization, **When** they click on the organization, **Then** they see metadata including database branch ID, subscription tier, hierarchy structure overview, and member count (but not member names or tenant data)
4. **Given** an organization with a payment failure, **When** an Avantej admin views the organization, **Then** they see the payment failure status and can suspend the organization to prevent access
5. **Given** a suspended organization, **When** an Avantej admin resolves the payment issue and unsuspends the organization, **Then** members can log in and access the platform again
6. **Given** an Avantej admin supporting a franchise, **When** they initiate user impersonation for troubleshooting, **Then** they can view the platform as that user and all actions are logged with the admin's identity for audit
7. **Given** an impersonation session, **When** the admin clicks "Exit Impersonation", **Then** they return to the admin control panel and the impersonation session ends
8. **Given** an Avantej admin viewing audit logs, **When** they filter by organization or date range, **Then** they see a chronological list of organization lifecycle events (created, member added, payment received, suspended, etc.)

---

### User Story 5 - Multi-Tenant & Hierarchical Session Context (Priority: P5)

Users with multiple organization memberships (through multiple subscriptions) can switch between organizations, and within an organization, access only their hierarchy-scoped data.

**Why this priority**: Advanced users may manage multiple franchises or have roles in different organizations. Proper context switching ensures they access the correct data without cross-tenant contamination.

**Independent Test**: Can be fully tested by creating a user who is a member of two organizations (each with separate subscriptions), switching between them, and verifying data isolation. Also test hierarchy context switching within one organization. Delivers value by supporting franchise consultants or multi-location owners.

**Acceptance Scenarios**:

1. **Given** a user who is a member of Organization A and Organization B, **When** they log in, **Then** they see an organization switcher displaying both organizations
2. **Given** a user viewing the organization switcher, **When** they select Organization A, **Then** all dashboard data, reports, and members displayed are scoped to Organization A only
3. **Given** a user who is a trainer in Branch X of Organization A, **When** they switch their active branch context to Branch Y (where they also have trainer role), **Then** the booking calendar, client list, and session data updates to show only Branch Y information
4. **Given** a user attempting to switch to a branch where they have no role, **When** they try to access that branch's data, **Then** access is denied and they receive an "Access Denied" message
5. **Given** a regional manager with access to Region 1 (containing Branches A, B, C), **When** they view the member list, **Then** they see only members assigned to Branches A, B, or C and cannot see members in other regions
6. **Given** a user's session with active organization context, **When** the session token expires (after 15 minutes), **Then** they are prompted to re-authenticate and their organization context is preserved after login

---

### Edge Cases

- **Last owner removal**: What happens when attempting to remove the last member with the "Owner" role from an organization? System must prevent this to avoid orphaned organizations.
- **Concurrent hierarchy modifications**: How does the system handle two administrators simultaneously editing the same hierarchy node (e.g., renaming a region)? Updates should be handled with conflict detection or last-write-wins with notification.
- **Deleting hierarchy node with active members**: What happens when deleting a branch that has 10 trainers assigned? System must prevent deletion or require reassignment first.
- **Payment failure during provisioning**: If Stripe payment succeeds but organization creation fails due to database error, how is this reconciled? System must ensure idempotent provisioning with rollback capability.
- **Session expiration during impersonation**: If an admin's session expires while impersonating a user, are they logged out or does the impersonation end gracefully? System should end impersonation and preserve admin session.
- **User invited to multiple hierarchy levels**: If a user is invited as a Trainer for Branch A and a Regional Manager for Region 1 (which contains Branch A), which role takes precedence? System should apply the highest privilege level or allow multi-role assignment.
- **Subscription downgrade with multiple organizations**: If a franchise owner downgrades from a plan allowing 3 organizations to a plan allowing 1 organization, what happens to the extra organizations? System must prevent downgrade until extra organizations are deleted or transferred.
- **Invitation race condition**: If the same email is invited twice concurrently by different admins, how is this handled? System should detect duplicate pending invitations and prevent duplicates or allow one invitation to succeed.
- **Hierarchy depth violation**: If an administrator attempts to add a sixth level below Branch (e.g., "Team" under Branch), is this allowed or blocked? System must enforce the fixed 5-level hierarchy depth.
- **Cross-organization invitation**: Can a user be invited to two different organizations with the same email? System should allow this to support consultants working with multiple franchises.

## Requirements _(mandatory)_

### Functional Requirements

#### Organization Lifecycle

- **FR-001**: System MUST create one organization only after receiving Stripe payment confirmation webhook with successful payment status
- **FR-002**: System MUST enforce a 1:1 relationship between active subscription and organization (one subscription = one organization)
- **FR-003**: System MUST allow franchise owners to create additional organizations only after upgrading to a higher subscription tier that permits multiple organizations
- **FR-004**: System MUST provision a dedicated database branch for each organization as defined in the platform constitution
- **FR-005**: System MUST include organization metadata: name, slug (unique identifier), created date, subscription tier, payment status, active/suspended status
- **FR-006**: System MUST allow Avantej administrators to suspend an organization, immediately blocking all member access
- **FR-007**: System MUST allow Avantej administrators to unsuspend an organization, restoring member access
- **FR-008**: System MUST mark an organization for deletion and execute deletion only after all members are removed or reassigned
- **FR-009**: System MUST delete all organization data (hierarchy, members, invitations) when organization deletion is confirmed

#### Hierarchical Structure

- **FR-010**: System MUST support a fixed 5-level organizational hierarchy: Organization → Country → Region → Area → Branch
- **FR-011**: System MUST allow organization owners to create, update, and delete hierarchy nodes (countries, regions, areas, branches)
- **FR-012**: System MUST prevent deletion of hierarchy nodes that have child nodes (e.g., cannot delete region with existing areas)
- **FR-013**: System MUST prevent deletion of hierarchy nodes that have assigned members (e.g., cannot delete branch with trainers assigned)
- **FR-014**: System MUST allow organization owners to rename hierarchy nodes without affecting member assignments
- **FR-015**: System MUST display the full hierarchy path for each member (e.g., "Organization > USA > West > California > Branch Downtown")
- **FR-016**: System MUST allow organization owners to move hierarchy nodes (e.g., move Branch A from Area 1 to Area 2) with member assignments preserved
- **FR-017**: System MUST require at least one branch to exist under an organization (organizations cannot be empty)
- **FR-018**: System MUST store hierarchy metadata: node name, node type (country/region/area/branch), parent node reference, created date

#### Member Management

- **FR-019**: System MUST allow organization administrators to invite new members by email address
- **FR-020**: System MUST send an invitation email containing a unique invitation link with expiration date
- **FR-021**: System MUST allow invitation creators to specify the invitee's role (Admin, Trainer, Staff, Client) and hierarchy scope (which branch, area, region, or organization-wide)
- **FR-022**: System MUST mark invitations as pending until accepted or expired
- **FR-023**: System MUST expire invitations after 7 days and mark them as expired (invitations cannot be accepted after expiration)
- **FR-024**: System MUST allow administrators to resend pending invitations
- **FR-025**: System MUST allow administrators to revoke pending invitations before they are accepted
- **FR-026**: System MUST allow invited users to accept invitations by clicking the invitation link and completing account creation
- **FR-027**: System MUST allow invited users to decline invitations, marking them as declined
- **FR-028**: System MUST create a member record upon invitation acceptance, linking the user to the organization with specified role and hierarchy scope
- **FR-029**: System MUST allow organization administrators to update member roles (e.g., promote Trainer to Admin)
- **FR-030**: System MUST allow organization administrators to update member hierarchy scope (e.g., move trainer from Branch A to Branch B)
- **FR-031**: System MUST allow organization administrators to remove members from the organization
- **FR-032**: System MUST prevent removal of the last member with the "Owner" or "Admin" role to avoid orphaned organizations
- **FR-033**: System MUST display member list with filters by role, hierarchy level, and search by name or email
- **FR-034**: System MUST allow users to belong to multiple organizations (via separate subscriptions or invitations)
- **FR-035**: System MUST notify members via email when their role or hierarchy scope is updated

#### RBAC with Hierarchical Scoping

- **FR-036**: System MUST enforce four primary roles within tenant organizations: Admin (organization owner), Trainer (service provider), Staff (support/reception), Client (end user)
- **FR-037**: System MUST allow administrators to assign roles at any hierarchy level (organization-wide, country, region, area, or branch)
- **FR-038**: System MUST grant access to a hierarchy level and all descendant levels (e.g., Regional Manager can access all areas and branches under their region)
- **FR-039**: System MUST restrict access to sibling or parent hierarchy nodes (e.g., Branch A trainer cannot access Branch B data)
- **FR-040**: System MUST enforce role-based permissions: Admin (full access), Trainer (manage sessions, clients within scope), Staff (view data, s within scope), Client (view own data only)
- **FR-041**: System MUST validate user role and hierarchy scope on every data access request
- **FR-042**: System MUST apply the highest privilege role when a user has multiple roles in the same organization (e.g., Admin role takes precedence over Trainer role)
- **FR-043**: System MUST allow organization admins to define custom permissions per role (e.g., restrict certain trainers from viewing billing data)

#### Admin Operations (Avantej Platform Control Panel)

- **FR-044**: System MUST provide a separate admin control panel accessible only to Avantej platform administrators
- **FR-045**: System MUST display a list of all tenant organizations with metadata: organization name, database branch ID, subscription tier, payment status, member count, created date, last activity date
- **FR-046**: System MUST allow Avantej admins to search organizations by name, email domain, or subscription tier
- **FR-047**: System MUST allow Avantej admins to filter organizations by status (active, suspended, payment failed)
- **FR-048**: System MUST allow Avantej admins to view organization details including hierarchy structure overview, member count, and subscription details
- **FR-049**: System MUST prevent Avantej admins from accessing tenant data (e.g., member names, client records, session bookings) unless using impersonation
- **FR-050**: System MUST allow Avantej admins to suspend an organization, immediately preventing member login and data access
- **FR-051**: System MUST allow Avantej admins to unsuspend an organization, restoring access
- **FR-052**: System MUST log all admin actions (suspend, unsuspend, impersonation) with admin identity, timestamp, and affected organization
- **FR-053**: System MUST allow Avantej admins to impersonate a user within a tenant organization for support purposes
- **FR-054**: System MUST clearly indicate when an admin is in impersonation mode (e.g., banner or indicator in UI)
- **FR-055**: System MUST log all actions performed during impersonation with both the admin's identity and the impersonated user's identity
- **FR-056**: System MUST allow Avantej admins to exit impersonation, returning to the admin control panel
- **FR-057**: System MUST display audit logs for organization lifecycle events (creation, payment received, member added, suspension, deletion) with timestamp and actor
- **FR-058**: System MUST allow Avantej admins to create new users directly (bypassing invitation) for emergency access restoration

#### Tenant Isolation

- **FR-059**: System MUST enforce strict tenant isolation by scoping all data queries to the active organization context
- **FR-060**: System MUST prevent cross-tenant data access by validating organization context on every API request
- **FR-061**: System MUST store organization context in user session (JWT or session storage) after login
- **FR-062**: System MUST validate that the requested resource (e.g., member, booking, client) belongs to the user's active organization before granting access
- **FR-063**: System MUST prevent users from accessing data in organizations where they are not members
- **FR-064**: System MUST prevent hierarchy scope violations (e.g., Branch A trainer accessing Branch B data within the same organization)
- **FR-065**: System MUST apply hierarchy-scoped query filters automatically based on user's assigned hierarchy level

#### Security & Authentication

- **FR-066**: System MUST require email and password for user account creation
- **FR-067**: System MUST send email verification link upon account creation and require verification before granting organization access
- **FR-068**: System MUST enforce strong password requirements (minimum 8 characters, at least one uppercase, one lowercase, one number, one special character)
- **FR-069**: System MUST issue short-lived JWT tokens (maximum 15 minutes) with organization context and user role encoded
- **FR-070**: System MUST issue secure refresh tokens (HTTP-only cookies) for session renewal
- **FR-071**: System MUST invalidate all user sessions when a user's role or organization membership is revoked
- **FR-072**: System MUST log failed login attempts and implement rate limiting to prevent brute force attacks
- **FR-073**: System MUST allow users to reset their password via email reset link
- **FR-074**: System MUST expire password reset links after 1 hour
- **FR-075**: System MUST log all authentication events (login, logout, password reset, role change) for security audit

#### Payment Integration

- **FR-076**: System MUST listen for Stripe webhook events (payment_intent.succeeded, payment_intent.failed, subscription.created, subscription.deleted)
- **FR-077**: System MUST validate Stripe webhook signatures to prevent spoofing
- **FR-078**: System MUST create organization only after receiving payment_intent.succeeded or subscription.created event
- **FR-079**: System MUST suspend organization access when receiving subscription.past_due or payment_intent.payment_failed events
- **FR-080**: System MUST restore organization access when payment is successfully processed after failure
- **FR-081**: System MUST allow subscription tier upgrades to increase organization count limit
- **FR-082**: System MUST prevent subscription downgrades if current organization count exceeds new tier limit
- **FR-083**: System MUST link each organization to its Stripe subscription ID and customer ID for billing reference

#### Session & Context Management

- **FR-084**: System MUST allow users with multiple organization memberships to view an organization switcher
- **FR-085**: System MUST display all organizations where the user is a member in the organization switcher
- **FR-086**: System MUST allow users to switch active organization context, updating all displayed data to the selected organization
- **FR-087**: System MUST allow users to switch active hierarchy context within an organization (e.g., switch from Branch A to Branch B if they have roles in both)
- **FR-088**: System MUST preserve user's last active organization and hierarchy context across sessions
- **FR-089**: System MUST update session context immediately when user switches organization or hierarchy level
- **FR-090**: System MUST enforce session timeout after 15 minutes of inactivity, requiring re-authentication
- **FR-091**: System MUST preserve organization context after re-authentication (user returns to the same organization they were viewing)

### Key Entities

- **Organization**: Represents a tenant franchise. Attributes: name, slug (unique identifier), database branch ID, subscription tier, payment status (active/suspended/failed), created date, updated date, owner user ID. Relationships: has many Members, has one Hierarchy Root (organization node), linked to one Subscription.

- **Hierarchy Node**: Represents a level in the organizational structure. Attributes: node name, node type (organization/country/region/area/branch), parent node ID (null for root), created date, updated date. Relationships: belongs to Organization, has many child nodes, has many Members scoped to this node.

- **Member**: Represents a user's membership in an organization with a specific role and hierarchy scope. Attributes: user ID, organization ID, role (Admin/Trainer/Staff/Client), hierarchy scope node ID (which branch, area, region, or organization-wide), status (active/suspended), joined date. Relationships: belongs to User, belongs to Organization, scoped to Hierarchy Node.

- **Invitation**: Represents a pending invitation to join an organization. Attributes: email address, organization ID, invited by user ID, role (Admin/Trainer/Staff/Client), hierarchy scope node ID, invitation token (unique), status (pending/accepted/declined/expired), expires at, created date. Relationships: belongs to Organization, created by User, scoped to Hierarchy Node.

- **User**: Represents a platform-wide identity. Attributes: email, hashed password, name, email verified (boolean), created date, last login date. Relationships: has many Members (can belong to multiple organizations), has many sent Invitations.

- **Admin Session**: Represents an Avantej administrator's impersonation session. Attributes: admin user ID, impersonated user ID, organization ID, started at, ended at (null if active), session token. Relationships: belongs to admin User, belongs to impersonated User, scoped to Organization.

- **Subscription**: Represents a Stripe subscription linked to organization count limit. Attributes: Stripe subscription ID, Stripe customer ID, tier (basic/professional/enterprise), organization count limit, status (active/past_due/canceled), created date, updated date. Relationships: has many Organizations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Franchise owners complete organization setup (including account creation, email verification, and first branch creation) in under 5 minutes after successful payment
- **SC-002**: Zero cross-tenant data leakage incidents (100% tenant isolation maintained across all data access operations)
- **SC-003**: Zero cross-hierarchy unauthorized access incidents within tenant organizations (branch-level trainers cannot access other branch data)
- **SC-004**: 95% of member invitations are accepted within 24 hours of being sent
- **SC-005**: Admin operations (view tenant list, suspend organization, view audit logs) complete in under 2 seconds
- **SC-006**: 100% of payment failures prevent organization provisioning (no organizations created without confirmed payment)
- **SC-007**: Users can switch between organization contexts in under 1 second (measured from context selection to updated dashboard display)
- **SC-008**: Support ticket reduction of 60% for access management issues (roles, permissions, invitations) within 3 months of deployment
- **SC-009**: 99% of hierarchy permission checks complete in under 100 milliseconds
- **SC-010**: Session re-authentication completes in under 3 seconds and preserves user's active organization context
- **SC-011**: Admin impersonation sessions are successfully logged with 100% accuracy (admin ID, impersonated user ID, timestamp, duration)
- **SC-012**: Email invitation delivery success rate of 99% (invitations reach recipient inbox within 1 minute)
- **SC-013**: 90% of franchise owners successfully create at least one additional hierarchy node (country, region, area, or branch) within the first week after organization setup
- **SC-014**: Subscription tier upgrades complete within 5 minutes and immediately allow creation of additional organizations

## Assumptions

1. **Default hierarchy depth**: Every organization must have at least one branch (5th level of hierarchy). Organizations cannot exist without branches.

2. **Email verification required**: Users must verify their email address before accepting invitations or accessing organization data. Email verification links expire after 24 hours.

3. **Invitation expiration**: Invitations expire after 7 days by default. Expired invitations cannot be accepted and must be resent as new invitations.

4. **Multiple organization membership**: Users can belong to multiple organizations simultaneously by accepting invitations from different organizations or by subscribing to multiple plans.

5. **Hierarchy depth fixed**: The organizational hierarchy is fixed at 5 levels (Organization → Country → Region → Area → Branch). No deeper nesting is allowed, and no level can be skipped.

6. **Admin impersonation logging**: All actions performed during admin impersonation sessions are logged with both the admin's identity and the impersonated user's identity for complete audit trail.

7. **Session duration**: User sessions expire after 15 minutes of inactivity, requiring re-authentication. Active organization and hierarchy context is preserved after re-authentication.

8. **Payment-to-organization ratio**: The 1:1 relationship between subscription and organization is enforced. Higher subscription tiers (e.g., Professional, Enterprise) may allow multiple organizations per subscription.

9. **Role precedence**: When a user has multiple roles within the same organization (e.g., Admin at organization level and Trainer at branch level), the highest privilege role (Admin) takes precedence.

10. **Invitation uniqueness**: The same email can be invited to the same organization only once. If a previous invitation is pending, new invitations to the same email are blocked until the previous invitation is accepted, declined, or expired.

11. **Hierarchy node naming**: Hierarchy node names (country, region, area, branch) must be unique within their parent scope (e.g., two branches under the same area cannot have the same name, but branches under different areas can share names).

12. **Stripe webhook reliability**: The system assumes Stripe webhooks are delivered reliably. If webhook delivery fails, Stripe retry logic ensures eventual delivery within 3 days.

13. **Email service availability**: The system assumes email service (for invitations, verification, password reset) is available with 99.9% uptime. Failed emails are retried up to 3 times before marking as failed.

14. **Database branch provisioning**: Neon database branch provisioning completes within 30 seconds of organization creation. Provisioning failures trigger automatic rollback of organization creation.

15. **Admin role assignment**: Avantej platform administrators are identified by a predefined list of admin user IDs or by an "Avantej Admin" role flag in the user record. This is separate from organization-level Admin roles.
