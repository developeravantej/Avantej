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

// Service category services
export {
  listServiceCategories,
  getServiceCategoryById,
  createServiceCategory,
  updateServiceCategory,
  type ListServiceCategoriesParams,
  type CreateServiceCategoryParams,
  type UpdateServiceCategoryParams,
} from "./service-category.service";

// Service services
export {
  listServices,
  getServiceById,
  createService,
  updateService,
  type ListServicesParams,
  type CreateServiceParams,
  type UpdateServiceParams,
} from "./service.service";

// Appointment services
export {
  listAppointments,
  listAppointmentsForUser,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  type ListAppointmentsParams,
  type ListAppointmentsForUserParams,
  type CreateAppointmentParams,
  type UpdateAppointmentParams,
} from "./appointment.service";

// Package services
export {
  listPackages,
  getPackageById,
  type ListPackagesParams,
} from "./package.service";

// Package instance services
export {
  listPackageInstancesForClient,
  getPackageInstanceById,
  createPackageInstance,
  type ListPackageInstancesForClientParams,
  type CreatePackageInstanceParams,
} from "./package-instance.service";

// Preferred time services
export {
  listPreferredTimes,
  upsertPreferredTimes,
  type PreferredTimeInput,
} from "./preferred-time.service";

// Notification services
export {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type ListNotificationsParams,
} from "./notification.service";

// Notification preference services
export {
  getNotificationPreferences,
  upsertNotificationPreferences,
  type UpsertNotificationPreferencesParams,
} from "./notification-preference.service";

// Customer profile services
export {
  getCustomerProfile,
  upsertCustomerProfile,
  type UpsertCustomerProfileParams,
} from "./customer-profile.service";

// User activity log services
export {
  listUserActivityLog,
  type ListUserActivityLogParams,
} from "./user-activity-log.service";

// Room services
export * from "./rooms.service";

// Sales order services
export * from "./sales-order.service";

// Invoice services
export * from "./invoice.service";

// Brand services
export * from "./brands.service";

// Product category services
export * from "./product-categories.service";

// Supplier services
export * from "./suppliers.service";

// Unit of measure services
export * from "./units-of-measure.service";

// Product services
export * from "./products.service";

// Stock request services
export * from "./stock-requests.service";

// Transfer order services
export * from "./transfer-orders.service";
