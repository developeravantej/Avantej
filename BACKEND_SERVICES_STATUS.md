# Backend Services Implementation Status

> Last Updated: December 17, 2025  
> This document tracks the implementation status of backend services and API endpoints for the Avantej Core platform.

---

## 📊 Summary

- **Total Service Categories**: 8 categories
- **Fully Implemented**: 1 category (12.5%)
- **Partially Implemented**: 2 categories (25%)
- **Not Started**: 5 categories (62.5%)

---

## ✅ 1. Hierarchy Management

**Status**: ✅ **Fully Implemented**

### Service Functions (`packages/services/src/hierarchy.service.ts`)
- [x] `getDescendantNodeIds` - Get all descendant nodes using recursive CTE
- [x] `getAncestorNodeIds` - Get all ancestor nodes using recursive CTE
- [x] `createHierarchyNode` - Create country/region/area/branch
- [x] `updateHierarchyNode` - Update node name/address/picUserId
- [x] `deleteHierarchyNode` - Hard delete with cascading children and member reassignment
- [x] `moveHierarchyNode` - Move node to different parent

### Validation Functions (`packages/services/src/hierarchy-validation.service.ts`)
- [x] `validateHierarchyRules` - Validate hierarchy constraints (depth, uniqueness, etc.)
- [x] `validateParentAccess` - Check parent access permissions
- [x] `getDepthForType` - Get depth for node type
- [x] `getParentTypeForType` - Get parent type for node type

### API Endpoints (`packages/api/src/routers/hierarchy.ts`)
- [x] `hierarchy.createNode` - Create hierarchy node endpoint
- [x] `hierarchy.listNodes` - List all nodes (filtered by accessible nodes)
- [x] `hierarchy.updateNode` - Update node endpoint
- [x] `hierarchy.deleteNode` - Delete node endpoint
- [x] `hierarchy.moveNode` - Move node endpoint

**Notes**: Complete CRUD operations with validation, permission checks, and hierarchy traversal.

---

## ⚠️ 2. Member Management

**Status**: ⚠️ **Partially Implemented** (60%)

### Service Functions (`packages/services/src/member.service.ts`)
- [x] `getMembersByHierarchyScope` - Get members assigned to a hierarchy node
- [x] `updateMemberHierarchyScope` - Update single member's hierarchy scope
- [x] `bulkUpdateMemberHierarchyScope` - Bulk update member hierarchy scopes
- [x] `getAllOrganizationMembersWithUserDetails` - Get all members with user details from control panel
- [ ] `createMember` - Create new member (exists in `packages/db/src/services/membership.service.ts` but not exposed)
- [ ] `updateMemberRole` - Update member role (exists in `packages/db/src/services/membership.service.ts` but not exposed)
- [ ] `suspendMember` - Suspend/activate member
- [ ] `deleteMember` - Remove member from organization
- [ ] `getMemberById` - Get member details by ID
- [ ] `getMemberByUserId` - Get member by user ID

### API Endpoints (`packages/api/src/routers/hierarchy.ts`)
- [x] `hierarchy.listMembers` - List members by hierarchy scope
- [x] `hierarchy.reassignMember` - Reassign single member to new scope
- [x] `hierarchy.bulkReassignMembers` - Bulk reassign members
- [x] `hierarchy.listAllMembers` - List all org members with user details
- [ ] `members.create` - Create member endpoint
- [ ] `members.updateRole` - Update member role endpoint
- [ ] `members.suspend` - Suspend/activate member endpoint
- [ ] `members.delete` - Delete member endpoint
- [ ] `members.getById` - Get member by ID endpoint

**Notes**: 
- Member scope management is complete
- Full CRUD operations need to be exposed as services and API endpoints
- Some functions exist in `packages/db/src/services/membership.service.ts` but need to be moved to `packages/services`

---

## ✅ 3. Invitations Management

**Status**: ✅ **Fully Implemented** (90%)

### Service Functions (`packages/services/src/invitation.service.ts`)
- [x] `createInvitation` - Create invitation with unique token
- [x] `getInvitationByToken` - Get invitation details by token
- [x] `validateInvitation` - Validate invitation status and expiration
- [x] `listInvitations` - List invitations (filtered by status/email/inviter)
- [x] `revokeInvitation` - Revoke pending invitation (marks as declined)
- [x] `resendInvitation` - Resend expired/pending invitation (extends expiration)
- [x] `markExpiredInvitations` - Mark expired invitations (cron job utility)
- [ ] `declineInvitation` - Decline invitation (separate from revoke)

### API Endpoints (`packages/api/src/routers/invitations.ts`)
- [x] `invitations.create` - Create invitation endpoint (returns token for email construction)
- [x] `invitations.accept` - Accept invitation endpoint (public, requires auth)
- [x] `invitations.getByToken` - Get invitation by token endpoint (public)
- [x] `invitations.list` - List invitations endpoint
- [x] `invitations.revoke` - Revoke invitation endpoint
- [x] `invitations.resend` - Resend invitation endpoint (returns token for email construction)

**Schema**: `packages/db/src/schema/tenant/invitations.ts` ✅ (exists)

**Notes**: 
- ✅ Service functions implemented with token generation and expiration logic
- ✅ API endpoints implemented with permission checks
- ⚠️ Email sending handled at server level (not in packages/api to avoid dependency on apps/server)
- ✅ Invitation links include `token` and `orgId` for tenant routing: `https://app.com/accept-invitation?token={token}&orgId={orgId}`
- ✅ Integration with Resend API via `apps/server/src/lib/email.ts`
- ✅ Invitation acceptance creates member via `MembershipService.createMember()`
- ⚠️ Server-side wrapper needed to send emails after `invitations.create` and `invitations.resend` (returns token for link construction)

---

## ⚠️ 4. Roles & Permissions (RBAC)

**Status**: ⚠️ **Partially Implemented** (30%)

### Service Functions (`packages/services/src/permission.service.ts`)
- [x] `hasPermission` - Check if member has permission
- [x] `requirePermission` - Require permission or throw error
- [x] `checkHierarchyPermission` - Convenience function for hierarchy permissions

### Service Functions (To Be Created)
- [ ] `createRole` - Create custom role
- [ ] `updateRole` - Update role details/priority
- [ ] `deleteRole` - Delete custom role (system roles protected)
- [ ] `listRoles` - List all roles
- [ ] `getRoleById` - Get role details
- [ ] `assignPermissionToRole` - Assign permission to role
- [ ] `removePermissionFromRole` - Remove permission from role
- [ ] `getRolePermissions` - Get all permissions for a role
- [ ] `createPermission` - Create custom permission
- [ ] `updatePermission` - Update permission details
- [ ] `deletePermission` - Delete permission
- [ ] `listPermissions` - List all permissions

### API Endpoints (To Be Created)
- [ ] `roles.create` - Create role endpoint
- [ ] `roles.update` - Update role endpoint
- [ ] `roles.delete` - Delete role endpoint
- [ ] `roles.list` - List roles endpoint
- [ ] `roles.getById` - Get role endpoint
- [ ] `roles.assignPermission` - Assign permission endpoint
- [ ] `roles.removePermission` - Remove permission endpoint
- [ ] `permissions.create` - Create permission endpoint
- [ ] `permissions.update` - Update permission endpoint
- [ ] `permissions.delete` - Delete permission endpoint
- [ ] `permissions.list` - List permissions endpoint

**Schemas**: 
- `packages/db/src/schema/tenant/roles.ts` ✅ (exists)
- `packages/db/src/schema/tenant/permissions.ts` ✅ (exists)
- `packages/db/src/schema/tenant/role-permissions.ts` ✅ (exists)

**Notes**: 
- Permission checking is implemented
- RBAC CRUD operations need to be implemented
- Seed data exists in `packages/db/src/seed-rbac.ts`

---

## ❌ 5. Services Management

**Status**: ❌ **Not Implemented**

### Service Functions (To Be Created)
- [ ] `createService` - Create service
- [ ] `updateService` - Update service details
- [ ] `deleteService` - Delete service
- [ ] `listServices` - List services (filtered by category/scope)
- [ ] `getServiceById` - Get service details
- [ ] `createServiceCategory` - Create service category
- [ ] `updateServiceCategory` - Update category
- [ ] `deleteServiceCategory` - Delete category
- [ ] `listServiceCategories` - List categories
- [ ] `createServiceRule` - Create service rule
- [ ] `updateServiceRule` - Update rule
- [ ] `deleteServiceRule` - Delete rule
- [ ] `configureServiceCommission` - Configure commission settings
- [ ] `getServiceCommission` - Get commission configuration

### API Endpoints (To Be Created)
- [ ] `services.create` - Create service endpoint
- [ ] `services.update` - Update service endpoint
- [ ] `services.delete` - Delete service endpoint
- [ ] `services.list` - List services endpoint
- [ ] `services.getById` - Get service endpoint
- [ ] `services.categories.create` - Create category endpoint
- [ ] `services.categories.update` - Update category endpoint
- [ ] `services.categories.delete` - Delete category endpoint
- [ ] `services.categories.list` - List categories endpoint
- [ ] `services.rules.create` - Create rule endpoint
- [ ] `services.rules.update` - Update rule endpoint
- [ ] `services.rules.delete` - Delete rule endpoint
- [ ] `services.commission.configure` - Configure commission endpoint
- [ ] `services.commission.get` - Get commission config endpoint

**Schemas**: 
- `packages/db/src/schema/tenant/services.ts` ✅ (exists)
- `packages/db/src/schema/tenant/service-categories.ts` ✅ (exists)
- `packages/db/src/schema/tenant/service-rules.ts` ✅ (exists)
- `packages/db/src/schema/tenant/service-commission-config.ts` ✅ (exists)

**Notes**: All schemas exist but no service functions or API endpoints implemented.

---

## ❌ 6. Packages Management

**Status**: ❌ **Not Implemented**

### Service Functions (To Be Created)
- [ ] `createPackage` - Create service package
- [ ] `updatePackage` - Update package details
- [ ] `deletePackage` - Delete package
- [ ] `listPackages` - List packages
- [ ] `getPackageById` - Get package details
- [ ] `assignPackageToMember` - Assign package to member/client
- [ ] `unassignPackageFromMember` - Remove package assignment
- [ ] `getMemberPackages` - Get packages assigned to member
- [ ] `getPackageMembers` - Get members assigned to package

### API Endpoints (To Be Created)
- [ ] `packages.create` - Create package endpoint
- [ ] `packages.update` - Update package endpoint
- [ ] `packages.delete` - Delete package endpoint
- [ ] `packages.list` - List packages endpoint
- [ ] `packages.getById` - Get package endpoint
- [ ] `packages.assign` - Assign package to member endpoint
- [ ] `packages.unassign` - Unassign package endpoint
- [ ] `packages.getMemberPackages` - Get member's packages endpoint
- [ ] `packages.getPackageMembers` - Get package's members endpoint

**Schemas**: 
- `packages/db/src/schema/tenant/packages.ts` ✅ (exists)
- `packages/db/src/schema/tenant/package-assignments.ts` ✅ (exists)

**Notes**: Schemas exist but no service functions or API endpoints implemented.

---

## ❌ 7. Appointments Management

**Status**: ❌ **Not Implemented**

### Service Functions (To Be Created)
- [ ] `createAppointment` - Create appointment
- [ ] `updateAppointment` - Update appointment details
- [ ] `cancelAppointment` - Cancel appointment
- [ ] `completeAppointment` - Mark appointment as completed
- [ ] `listAppointments` - List appointments (filtered by date/staff/client)
- [ ] `getAppointmentById` - Get appointment details
- [ ] `assignStaffToAppointment` - Assign staff member
- [ ] `assignClientToAppointment` - Assign client
- [ ] `getAppointmentsByDateRange` - Get appointments in date range
- [ ] `getAppointmentsByStaff` - Get appointments for staff member
- [ ] `getAppointmentsByClient` - Get appointments for client

### API Endpoints (To Be Created)
- [ ] `appointments.create` - Create appointment endpoint
- [ ] `appointments.update` - Update appointment endpoint
- [ ] `appointments.cancel` - Cancel appointment endpoint
- [ ] `appointments.complete` - Complete appointment endpoint
- [ ] `appointments.list` - List appointments endpoint
- [ ] `appointments.getById` - Get appointment endpoint
- [ ] `appointments.assignStaff` - Assign staff endpoint
- [ ] `appointments.assignClient` - Assign client endpoint
- [ ] `appointments.getByDateRange` - Get by date range endpoint
- [ ] `appointments.getByStaff` - Get by staff endpoint
- [ ] `appointments.getByClient` - Get by client endpoint

**Schemas**: 
- `packages/db/src/schema/tenant/appointments.ts` ✅ (exists)
- `packages/db/src/schema/tenant/appointment-staff.ts` ✅ (exists)
- `packages/db/src/schema/tenant/appointment-clients.ts` ✅ (exists)

**Notes**: Schemas exist but no service functions or API endpoints implemented.

---

## ❌ 8. Payments & Payouts

**Status**: ❌ **Not Implemented**

### Service Functions (To Be Created)
- [ ] `createPayment` - Create payment record
- [ ] `processPayment` - Process payment (Stripe integration)
- [ ] `refundPayment` - Refund payment
- [ ] `listPayments` - List payments (filtered by date/client/service)
- [ ] `getPaymentById` - Get payment details
- [ ] `createPayout` - Create payout record
- [ ] `processPayout` - Process payout to partner/staff
- [ ] `listPayouts` - List payouts
- [ ] `calculateCommissionSplit` - Calculate commission splits
- [ ] `createCommissionSplit` - Create commission split record
- [ ] `configurePartnerStripeAccount` - Configure Stripe account for partner
- [ ] `getPartnerStripeAccount` - Get partner Stripe account

### API Endpoints (To Be Created)
- [ ] `payments.create` - Create payment endpoint
- [ ] `payments.process` - Process payment endpoint (Stripe webhook)
- [ ] `payments.refund` - Refund payment endpoint
- [ ] `payments.list` - List payments endpoint
- [ ] `payments.getById` - Get payment endpoint
- [ ] `payouts.create` - Create payout endpoint
- [ ] `payouts.process` - Process payout endpoint
- [ ] `payouts.list` - List payouts endpoint
- [ ] `commissions.calculate` - Calculate commission endpoint
- [ ] `commissions.split` - Create split endpoint
- [ ] `partners.stripe.configure` - Configure Stripe account endpoint
- [ ] `partners.stripe.get` - Get Stripe account endpoint

**Schemas**: 
- `packages/db/src/schema/tenant/payments.ts` ✅ (exists)
- `packages/db/src/schema/tenant/payouts.ts` ✅ (exists)
- `packages/db/src/schema/tenant/commission-splits.ts` ✅ (exists)
- `packages/db/src/schema/tenant/partner-stripe-accounts.ts` ✅ (exists)

**Notes**: 
- All schemas exist but no service functions or API endpoints implemented
- Requires Stripe integration
- Commission calculation logic needed

---

## 📝 Implementation Priority Recommendations

### 🔴 High Priority (Core Functionality)
1. **Invitations Management** - Required for onboarding new members
2. **Full Member Management** - Complete CRUD operations
3. **Roles & Permissions Management** - RBAC administration

### 🟡 Medium Priority (Business Operations)
4. **Services Management** - Core business offering
5. **Packages Management** - Service bundling
6. **Appointments Management** - Booking system

### 🟢 Lower Priority (Financial)
7. **Payments & Payouts** - Payment processing and commissions

---

## 🔗 Related Files

### Service Files
- `packages/services/src/hierarchy.service.ts` ✅
- `packages/services/src/hierarchy-validation.service.ts` ✅
- `packages/services/src/member.service.ts` ⚠️ (partial)
- `packages/services/src/permission.service.ts` ⚠️ (partial)

### API Router Files
- `packages/api/src/routers/hierarchy.ts` ✅
- `packages/api/src/routers/index.ts` (needs new routers)

### Database Service Files (Legacy)
- `packages/db/src/services/membership.service.ts` (needs migration to `packages/services`)

---

## 📌 Notes

- All database schemas are defined and migrated
- Permission checking infrastructure is in place
- Hierarchy management is fully functional
- Member scope management is complete
- Need to expose existing functions in `packages/db/src/services/membership.service.ts` as reusable services
- Consider creating separate router files for each domain (invitations, services, packages, appointments, payments)

---

## 🎯 Next Steps

1. **Complete Member Management**
   - Move functions from `packages/db/src/services/membership.service.ts` to `packages/services/src/member.service.ts`
   - Create `packages/api/src/routers/members.ts` router
   - Add API endpoints for member CRUD operations

2. **Implement Invitations**
   - Create `packages/services/src/invitation.service.ts`
   - Create `packages/api/src/routers/invitations.ts` router
   - Integrate with email service

3. **Complete RBAC**
   - Create `packages/services/src/role.service.ts`
   - Create `packages/services/src/permission-management.service.ts`
   - Create `packages/api/src/routers/roles.ts` and `permissions.ts` routers

