/**
 * Services Package
 *
 * Shared business logic services for the Avantej Core platform.
 * These services are reusable across apps/server, apps/web, and apps/native.
 */

// Hierarchy services - for tree traversal and node management
export {
  getDescendantNodeIds,
  getAncestorNodeIds,
  createHierarchyNode,
  updateHierarchyNode,
  deleteHierarchyNode,
  moveHierarchyNode,
  type DeleteHierarchyNodeOptions,
} from "./hierarchy.service";

// Hierarchy validation - for validating hierarchy rules
export {
  validateHierarchyRules,
  validateParentAccess,
  getDepthForType,
  getParentTypeForType,
  type HierarchyNodeType,
  type CreateHierarchyNodeParams,
  type UpdateHierarchyNodeParams,
} from "./hierarchy-validation.service";

// Permission service - for RBAC permission checking
export * from "./permission.service";

// Member services - for member management
export {
  getMembersByHierarchyScope,
  updateMemberHierarchyScope,
  bulkUpdateMemberHierarchyScope,
  getAllOrganizationMembersWithUserDetails,
  createMember,
} from "./member.service";

// Invitation services - for invitation management
export {
  createInvitation,
  getInvitationByToken,
  validateInvitation,
  listInvitations,
  revokeInvitation,
  resendInvitation,
  markExpiredInvitations,
} from "./invitation.service";


