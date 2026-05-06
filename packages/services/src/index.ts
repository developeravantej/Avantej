/**
 * Services Package
 *
 * Shared business logic services for the Avantej Core platform.
 * These services are reusable across apps/server, apps/web, and apps/native.
 */

// Analytics services
export * from "./analytics.service";
// Announcement services
export * from "./announcements.service";
// Appointment services
export {
	type CreateAppointmentParams,
	createAppointment,
	getAppointmentById,
	type ListAppointmentsForUserParams,
	type ListAppointmentsParams,
	listAppointments,
	listAppointmentsForUser,
	type UpdateAppointmentParams,
	updateAppointment,
} from "./appointment.service";
// Audit log services
export {
	type AuditRowEnriched,
	type ListAuditParams,
	listAudit,
	type WriteAuditParams,
	writeAudit,
} from "./audit-log.service";
// Brand services
export * from "./brands.service";
// Buffer time services
export {
	type CheckBufferConflictParams,
	checkAppointmentBufferConflict,
	resolveBufferTime,
} from "./buffer-time.service";
// Category commission services
export {
	deleteCategoryCommissionConfig,
	getCategoryCommissionConfig,
	type getCategoryCommissionConfigResult,
	upsertCategoryCommissionConfig,
} from "./category-commission.service";
// Check-ins (attendance) services
export {
	type CheckIn,
	type CheckInInput,
	type CheckInRowEnriched,
	deleteCheckIn,
	type ListCheckInsParams,
	listCheckIns,
	listTodaysBookings,
	recordCheckIn,
	resolveClientDisplayName,
	type TodaysBookingRow,
} from "./check-ins.service";
// Class slot services
export * from "./class-slots.service";
// Commission calculator services
export {
	calculateCommissionForAppointment,
	calculateCommissionForPos,
} from "./commission-calculator.service";
// Commission split services
export {
	approveCommissionSplits,
	type CommissionLedgerResult,
	type CommissionLedgerRow,
	type CommissionSplit,
	type CreateManualAdjustmentParams,
	type CreateSplitParams,
	createCommissionSplit,
	createManualAdjustment,
	getCommissionsByAppointment,
	getMyCommissions,
	type LiabilitySummaryParams,
	type LiabilitySummaryResult,
	type LiabilitySummaryTrainer,
	liabilitySummary,
	type ListCommissionLedgerParams,
	listCommissionLedger,
	listCommissionSplits,
	type MarkPaidBatchParams,
	type MarkPaidBatchResult,
	markPaidBatch,
	type MarkPaidParams,
	markCommissionSplitsPaid,
	voidCommissionSplit,
	voidCommissionSplitsForSalesOrder,
	// Agent 2.5 — J5 commission audit
	getLatestConfigVersionForCategory,
	getOrCreatePayoutBatch,
	attachPayoutsToBatch,
	type GetOrCreatePayoutBatchParams,
} from "./commission-splits.service";
// Customer directory services
export {
	type CustomerDetail,
	type CustomerDirectoryRow,
	getCustomerDetail,
	listCustomerDirectory,
} from "./customer-directory.service";
// Customer profile services
export {
	getCustomerProfile,
	type UpsertCustomerProfileParams,
	upsertCustomerProfile,
} from "./customer-profile.service";
// Expense services
export * from "./expenses.service";
// Google Calendar services
export * from "./google-calendar.service";
export * from "./google-calendar-sync.service";
// Hierarchy services - for tree traversal and node management
export {
	createHierarchyNode,
	type DeleteHierarchyNodeOptions,
	deleteHierarchyNode,
	getAncestorNodeIds,
	getDescendantNodeIds,
	moveHierarchyNode,
	updateHierarchyNode,
} from "./hierarchy.service";
// Hierarchy validation - for validating hierarchy rules
export {
	type CreateHierarchyNodeParams,
	getDepthForType,
	getParentTypeForType,
	type HierarchyNodeType,
	type UpdateHierarchyNodeParams,
	validateHierarchyRules,
	validateParentAccess,
} from "./hierarchy-validation.service";
// Installment service - for installment-based credit unlocking
export {
	type AdminInstallmentOverviewItem,
	type AdminInstallmentOverviewParams,
	type ConfirmInstallmentPaymentParams,
	type CreateInstallmentScheduleParams,
	calculateCreditsUnlocked,
	calculateInstallmentAmounts,
	calculateSuggestedRefund,
	confirmInstallmentPayment,
	createInstallmentSchedule,
	DEFAULT_GRACE_PERIOD_DAYS,
	evaluateAndLockIfOverdue,
	getAdminInstallmentOverview,
	getGracePeriodDaysForPackage,
	getInstallmentsByPackageInstance,
	getSuggestedRefund,
	adjustCredits,
	type AdjustCreditsParams,
	processRefund,
	setPackageOverdraft,
	type SuggestedRefundInput,
	type SuggestedRefundResult,
	unlockPackage,
} from "./installment.service";
// Installment plan services
export * from "./installment-plan.service";
// Invitation services - for invitation management
export {
	createInvitation,
	getInvitationByToken,
	listInvitations,
	markExpiredInvitations,
	resendInvitation,
	revokeInvitation,
	validateInvitation,
} from "./invitation.service";
// Invoice services
export * from "./invoice.service";
// Memberships service - expiring memberships widget and related queries
export * from "./memberships.service";
// Member services - for member management
export {
	bulkUpdateMemberHierarchyScope,
	createMember,
	deactivateMember,
	getAllOrganizationMembersWithUserDetails,
	getMembersByHierarchyScope,
	updateMemberHierarchyScope,
} from "./member.service";
// Member profile services
export * from "./member-profile.service";
// Notification services
export {
	getUnreadCount,
	type ListNotificationsParams,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
} from "./notification.service";
// Notification preference services
export {
	getNotificationPreferences,
	type UpsertNotificationPreferencesParams,
	upsertNotificationPreferences,
} from "./notification-preference.service";
// Organization settings service
export {
	getSetting,
	upsertSetting,
} from "./organization-settings.service";
// Package instance services
export {
	type CreatePackageInstanceParams,
	createPackageInstance,
	getPackageInstanceById,
	type ListPackageInstancesForClientParams,
	listPackageInstancesForClient,
	type UpdatePackageInstanceParams,
	updatePackageInstance,
} from "./package-instance.service";
// Permission service - for RBAC permission checking
export * from "./permission.service";
// POS services (tracking-pages P4)
export {
	type PosCustomerResult,
	type PosLineItem,
	type RecordPosSaleInput,
	type RecordPosSaleResult,
	recordPosSale,
	type SearchPosCustomersParams,
	searchPosCustomers,
} from "./pos.service";
// Preferred time services
export {
	listPreferredTimes,
	type PreferredTimeInput,
	upsertPreferredTimes,
} from "./preferred-time.service";
// Product category services
export * from "./product-categories.service";
// Product services
export * from "./products.service";
// Promotion services
export * from "./promotions.service";
// Purchase order services
export * from "./purchase-orders.service";
// Refunds services (tracking-pages P5)
export {
	type ApproveRefundParams,
	approveRefund,
	computeRemainingRefundable,
	// Agent 2.8 — J5 partial-package refund
	type CreatePartialRefundParams,
	type CreatePartialRefundResult,
	createPartialRefund,
	getRefundById,
	type ListRefundsParams,
	listRefunds,
	type ProcessRefundParams,
	processRefund as processRefundLedger,
	type Refund,
	type RefundRowEnriched,
	type RejectRefundParams,
	type RequestRefundInput,
	rejectRefund,
	requestRefund,
} from "./refunds.service";
// Room services
export * from "./rooms.service";
// Sales order services
export * from "./sales-order.service";
// Service services
export {
	type CreateServiceParams,
	createService,
	getServiceById,
	type ListServicesParams,
	listServices,
	type UpdateServiceParams,
	updateService,
} from "./service.service";
// Service category services
export {
	type CreateServiceCategoryParams,
	createServiceCategory,
	getServiceCategoryById,
	type ListServiceCategoriesParams,
	listServiceCategories,
	type UpdateServiceCategoryParams,
	updateServiceCategory,
} from "./service-category.service";
// Stock request services
export * from "./stock-requests.service";
// Supplier services
export * from "./suppliers.service";
// Tax rate services
export * from "./tax-rates.service";
// Tenant admin services
export * from "./tenant-admin.service";
// Coach intake services
export {
	claimIntakeSlot,
	type CoachIntakeByBranchRow,
	computeOpenIntakeSlots,
	type IntakeSlot,
	listCoachIntakeByBranch,
	listCoachIntakeSlots,
	listIntakeExceptions,
	type OpenIntakeDay,
	unclaimIntakeSlot,
	upsertCoachIntakeSlots,
} from "./coach-intake.service";
// Trainer availability services
export {
	type AvailabilitySlot,
	type ComputedDayAvailability,
	computeAvailableSlots,
	deleteTrainerAvailabilitySlot,
	listTrainerAvailability,
	listTrainerAvailabilityByBranch,
	type TrainerAvailabilityByBranchRow,
	upsertTrainerAvailability,
} from "./trainer-availability.service";
// Trainer tier services
export {
	assignTierToMember,
	type CreateTrainerTierResult,
	createTrainerTier,
	deactivateTrainerTier,
	getConfigsMissingRateForTier,
	listTrainerTiers,
	type MissingRateCategory,
	type ReactivateTrainerTierResult,
	reactivateTrainerTier,
	updateTrainerTier,
} from "./trainer-tier.service";
// Transfer order services
export * from "./transfer-orders.service";
// Unit of measure services
export * from "./units-of-measure.service";
// User activity log services
export {
	type ListUserActivityLogParams,
	listUserActivityLog,
} from "./user-activity-log.service";
// Waitlist services
export * from "./waitlist.service";

// #region Agent 2.7 — status history helper (Phase 2 Wave 3a)
export * from "./status-history.helper";
// #endregion

// #region Agent 2.2 — branch pricing (Phase 2 Wave 3b — J2)
export * from "./pricing.service";
// #endregion

// #region Agent 2.3 — tax-rate snapshot resolver (Phase 2 Wave 3b — J2)
export {
	type ResolvedTaxRate,
	resolveTaxRate,
} from "./tax.service";
// #endregion

// #region Agent 2.11 — goods-receipt 3-way match (schema-relationship-fixes §8.5)
export * from "./goods-receipt.service";
// #endregion

// #region Agent 3.5 — walk-in payment → package conversion (schema-relationship-fixes §5 Phase 3)
export * from "./walk-in.service";
// #endregion

// #region Agent 3.1 — membership freeze/resume (Phase 3 — J4)
export * from "./membership.service";
// #endregion
