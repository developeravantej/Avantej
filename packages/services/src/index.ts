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
  deactivateMember,
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

// Package instance services
export {
  listPackageInstancesForClient,
  getPackageInstanceById,
  createPackageInstance,
  updatePackageInstance,
  type ListPackageInstancesForClientParams,
  type CreatePackageInstanceParams,
  type UpdatePackageInstanceParams,
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

// Expense services
export * from "./expenses.service";

// Announcement services
export * from "./announcements.service";

// Class slot services
export * from "./class-slots.service";

// Member profile services
export * from "./member-profile.service";

// Waitlist services
export * from "./waitlist.service";

// Commission split services
export * from "./commission-splits.service";

// Purchase order services
export * from "./purchase-orders.service";

// Promotion services
export * from "./promotions.service";

// Walk-in customer services
export * from "./walk-in-customers.service";

// Tax rate services
export * from "./tax-rates.service";

// Analytics services
export * from "./analytics.service";

// Buffer time services
export {
	resolveBufferTime,
	checkAppointmentBufferConflict,
	type CheckBufferConflictParams,
} from "./buffer-time.service";

// Trainer availability services
export {
	listTrainerAvailability,
	upsertTrainerAvailability,
	deleteTrainerAvailabilitySlot,
	type AvailabilitySlot,
} from "./trainer-availability.service";

// Installment service - for installment-based credit unlocking
export {
	DEFAULT_GRACE_PERIOD_DAYS,
	getGracePeriodDaysForPackage,
	calculateCreditsUnlocked,
	calculateInstallmentAmounts,
	calculateSuggestedRefund,
	createInstallmentSchedule,
	confirmInstallmentPayment,
	evaluateAndLockIfOverdue,
	unlockPackage,
	processRefund,
	getInstallmentsByPackageInstance,
	getAdminInstallmentOverview,
	getSuggestedRefund,
	type CreateInstallmentScheduleParams,
	type ConfirmInstallmentPaymentParams,
	type AdminInstallmentOverviewParams,
	type AdminInstallmentOverviewItem,
	type SuggestedRefundInput,
	type SuggestedRefundResult,
} from "./installment.service";

// Organization settings service
export {
	getSetting,
	upsertSetting,
} from "./organization-settings.service";

// Google Calendar services
export * from "./google-calendar.service";
export * from "./google-calendar-sync.service";
