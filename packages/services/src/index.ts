/**
 * Services Package
 *
 * Shared business logic services for the Avantej Core platform.
 * These services are reusable across apps/server, apps/web, and apps/native.
 */

// Analytics services
export * from "./analytics.service";
// Scheduled reports services
export {
	computeNextRunAt,
	createScheduledReport,
	type CreateScheduledReportParams,
	deleteScheduledReport,
	listDueScheduledReports,
	listScheduledReports,
	markScheduledReportFailed,
	markScheduledReportSent,
	type ScheduledReportFormat,
	type ScheduledReportFrequency,
	type ScheduledReportRow,
	type ScheduledReportWindow,
	toggleScheduledReportActive,
} from "./scheduled-reports.service";
// Category buffer override services
export {
	listCategoryBufferOverridesForMember,
	upsertCategoryBufferOverride,
	type CategoryOverrideRow,
} from "./category-buffer-overrides.service";
// Announcement services
export * from "./announcements.service";
// Appointment services
export {
	type AppointmentHistoryQueryOpts,
	type CreateAppointmentParams,
	createAppointment,
	getAppointmentById,
	getAppointmentStatusHistory,
	type ListAppointmentsForUserParams,
	type ListAppointmentsParams,
	listAppointments,
	listAppointmentsForUser,
	resolveMemberIdFromUserId,
	type UpdateAppointmentParams,
	updateAppointment,
} from "./appointment.service";
// Recurrence services
export {
	type AppointmentWithOccurrence,
	expandRecurrenceRule,
	isVirtualId,
	listAppointmentsWithRecurrence,
	makeVirtualId,
	MAX_VIRTUAL_OCCURRENCES,
	parseVirtualId,
} from "./recurrence.service";
// Audit log services
export {
	type AuditRowEnriched,
	type AuditSeverity,
	type ExportAuditCsvParams,
	type ExportAuditCsvResult,
	type ListAuditParams,
	deriveSeverity,
	exportAuditCsv,
	getActionSeverity,
	listAudit,
	listCustomerLogs,
	type CustomerLogEntry,
	type ListCustomerLogsParams,
	type WriteAuditParams,
	writeAudit,
} from "./audit-log.service";
// Customer name snapshot services
export {
	propagateCustomerNameForward,
	refreshTenantCustomerNameSnapshots,
	runCustomerNameRefresh,
	scrubCustomerNameSnapshots,
} from "./customer-name-snapshot.service";
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
	calculateOriginationCommission,
	type CalculateOriginationParams,
	distributeInstallmentOriginationCommission,
	type DistributeInstallmentOriginationParams,
	scaleInstallmentCommission,
} from "./commission-calculator.service";
// Commission pipeline sub-modules (gather / plan / persist)
export {
	type CommissionContext,
	type MemberSnapshot,
	type RateTable,
	type ConditionalRateTable,
	type LoadCommissionContextInput,
	loadCommissionContext,
} from "./commission/context";
export {
	type PlanInput,
	type PlannedSplit,
	type SkipReason,
	type SkipReasonCode,
	type SplitPlan,
	planSplits,
} from "./commission/plan";
export {
	type PersistInput,
	type CommissionSplitRow,
	persistSplits,
} from "./commission/persist";
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
	// Flaw #13 — pending review
	listPendingReview,
	resolvePendingReview,
} from "./commission-splits.service";
// Customer directory services
export {
	type CustomerDetail,
	type CustomerDirectoryRow,
	type CustomerDirectoryStats,
	getCustomerDetail,
	getCustomerStats,
	listCustomerDirectory,
} from "./customer-directory.service";
// Lead attribution (GHL primary staff → commission slot 0)
export {
	enrichPosItemTrainerAssignments,
	getLeadAttributionForCustomer,
	mergeLeadAttributionIntoStaffAssignments,
	resolveMemberUserId,
	writePackageInstanceLeadStaff,
	type LeadAttribution,
	type StaffAssignment,
} from "./lead-attribution.service";
// Customer profile services
export {
	adjustCreditPoints,
	applyCreditPointDeltaTx,
	type CreditPointMutationParams,
	type CreditPointMutationResult,
	getCustomerProfile,
	redeemCreditPoints,
	restoreCustomerProfile,
	softDeleteCustomerProfile,
	type UpsertCustomerProfileParams,
	upsertCustomerProfile,
} from "./customer-profile.service";
// Expense services
export * from "./expenses.service";
// GHL staff sync services
export {
	type DispatchProfileSyncArgs,
	type DispatchStaffSyncArgs,
	dispatchProfileSync,
	dispatchStaffSync,
	type StaffSyncOperation,
	type StaffSyncResult,
	type StaffSyncSkipReason,
	type SyncStaffOrchestrator,
} from "./ghl-staff-sync.service";
// Email domain & log services (control-panel persistence)
export * from "./email-domain.service";
// Notification routing helpers (pure — no DB/env)
export * from "./notification-routing";
export * from "./notification-route.service";
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
	HierarchyDeleteBlockedError,
	HierarchyNodeNotFoundError,
	listNodesWithStats,
	moveHierarchyNode,
	type NodeWithStats,
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
export {
	assertBranchAccessible,
	BranchAccessDeniedError,
	isBranchAccessDeniedError,
	resolveScopeNodeIds,
} from "./hierarchy-scope";
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
	listUpcomingInstallments,
	exportUpcomingInstallmentsCsv,
	resolveUpcomingWindow,
	type UpcomingInstallmentRow,
	type UpcomingInstallmentsParams,
	type UpcomingWindowBounds,
	getGracePeriodDaysForPackage,
	getInstallmentsByPackageInstance,
	getSuggestedRefund,
	adjustCredits,
	type AdjustCreditsParams,
	processRefund,
	rescheduleInstallment,
	setPackageOverdraft,
	syncPackagePaymentStatus,
	waiveInstallment,
	resetCreditsOverride,
	type SuggestedRefundInput,
	type SuggestedRefundResult,
	unlockPackage,
	getPackageInstallmentState,
	type PackageInstallmentState,
} from "./installment.service";
// Installment plan services
export * from "./installment-plan.service";
// Invitation services - for invitation management
export {
	checkSoftDeletedCustomerBlock,
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
// Package agreement + e-signature (UAT §2)
export * from "./agreement.service";
// Offline payment-proof metadata (UAT §7)
export * from "./payment-proof.service";
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
// Member stats services
export {
	getMembersNewToday,
	type NewMemberEntry,
	type NewTodayResult,
} from "./member-stats.service";
// Member profile services
export * from "./member-profile.service";
// Notification services
export {
	getUnreadCount,
	type ListNotificationsParams,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	notifyAdminsOfCancelledOrderPayment,
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
	type CancelPackageInstanceParams,
	cancelPackageInstance,
	type CreatePackageInstanceParams,
	createPackageInstance,
	expireOverduePackageInstances,
	type ExtendPackageInstanceParams,
	extendPackageInstance,
	type FreezePackageInstanceParams,
	freezePackageInstance,
	getPackageInstanceById,
	getPackageInstanceStatusHistory,
	type ListPackageInstancesForClientParams,
	listPackageInstancesForClient,
	markCompleteIfFinal,
	type PackageInstanceHistoryQueryOpts,
	togglePackagePin,
	type UnfreezePackageInstanceParams,
	unfreezePackageInstance,
	type UpdatePackageInstanceParams,
	updatePackageInstance,
} from "./package-instance.service";
// Package instance staff services
export {
	type AssignPackageInstanceStaffParams,
	assignPackageInstanceStaff,
	listPackageInstanceStaff,
	type PackageInstanceStaffRow,
	removePackageInstanceStaff,
	type ReplacePackageInstanceStaffParams,
	replacePackageInstanceStaff,
} from "./package-instance-staff.service";
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
// Schedule proposal service
export {
	proposeSchedule,
	coverageForPreferredTimes,
	type ProposedSlot,
	type ProposedSlotStatus,
	type ProposeScheduleParams,
	type ProposeScheduleResult,
	type PreferredTimeCoverage,
	type CoverageResult,
} from "./schedule-proposal.service";
// Product category services
export * from "./product-categories.service";
// Product services
export * from "./products.service";
// Payment status history service
export {
	type PaymentHistoryQueryOpts,
	getPaymentStatusHistory,
} from "./payments.service";
// Pure money arithmetic helpers (no DB) — discount / tax / premium
export * from "./money-math";
// Promotion services
export * from "./promotions.service";
// Purchase order services
export * from "./purchase-orders.service";
// Refunds services (tracking-pages P5)
export {
	type ApproveRefundParams,
	approveRefund,
	// 1.6 — bulk approve
	type BulkApproveItem,
	type BulkApproveResult,
	bulkApproveRefunds,
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
// Cancelled sales services
export {
	type CancelledSaleRow,
	type CancelledSaleCsvRow,
	type ExportCancelledSalesCsvParams,
	type LineItemRow,
	type ListCancelledSalesParams,
	listCancelledSales,
	getCancelledSaleById,
	exportCancelledSalesCsv,
} from "./cancelled-sales.service";
// Service services
export {
	type CreateServiceParams,
	createService,
	duplicateService,
	getServiceById,
	type ListServicesParams,
	listServices,
	type ServiceWithCategory,
	type ServiceWithTrainerTiers,
	type UpdateServiceParams,
	updateService,
	type RevenueShareByCategoryRow,
	revenueShareByCategory,
	type AvgSessionsSoldPerMonthResult,
	avgSessionsSoldPerMonth,
	listServicesWithTrainerTiers,
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
	type AddTrainerAvailabilityExceptionParams,
	addTrainerAvailabilityException,
	type AvailabilitySlot,
	type ComputedDayAvailability,
	computeAvailableSlots,
	createTrainerAvailability,
	deleteTrainerAvailabilityException,
	deleteTrainerAvailabilitySlot,
	getTrainerConflicts,
	getTrainerUtilisation,
	type ConflictEntry,
	type ConflictReason,
	type TrainerAvailabilityExceptionKind,
	type TrainerAvailabilityKind,
	type TrainerUtilisationEntry,
	listCoachIntakeAvailability,
	listTrainerAvailability,
	listTrainerAvailabilityByBranch,
	listTrainerAvailabilityExceptions,
	type TrainerAvailabilityByBranchRow,
	updateTrainerAvailability,
	upsertTrainerAvailability,
} from "./trainer-availability.service";
// Trainer tier services
export {
	assignTierToMember,
	type CreateTrainerTierResult,
	createTrainerTier,
	deactivateTrainerTier,
	deleteTrainerTier,
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

// #region Phase 7.5 — DB error helpers
export * from "./lib/pg-error";
export * from "./lib/fk-guard";
// #endregion

// #region Plan F.1.5 (Agent H) — tenant health score + risk flags
export {
	computeHealthScore,
	type HealthScoreInput,
	type HealthScoreResult,
	type RiskFlag,
} from "./health-score";
// #endregion

// #region Phase 0 — branch QR onboarding (sales-pipeline-fixes)
export {
	type BranchInviteRow,
	type BranchInviteValidationError,
	type CreateBranchInviteParams,
	type ValidateBranchInviteResult,
	createBranchInvite,
	incrementBranchInviteUses,
	listBranchInvites,
	revokeBranchInvite,
	validateBranchInvite,
} from "./branch-invite.service";
export {
	type GetInviteContextParams,
	type InviteContextResult,
	type RedeemInviteParams,
	type RedeemInviteResult,
	getInviteContext,
	redeemBranchInvite,
} from "./onboarding.service";
// #endregion

// Member context helper — shared member + accessibleNodeIds resolution
export {
	type MemberContextResult,
	resolveMemberContext,
} from "./member-context";

// Commission tracks config service (Phase 3 — Task #23)
export {
	deactivateTrack,
	type CommissionTrackWithDetails,
	listTracksForCategory,
	setCoachSlots,
	type SetCoachSlotsInput,
	setTrackRates,
	type SetTrackRatesInput,
	upsertTrack,
	type UpsertTrackInput,
} from "./commission-tracks.service";

// Push notification tokens (native app) — restore barrel export lost in the
// origin/main merge so the pushTokens router can resolve these.
export {
	type RegisterPushTokenParams,
	registerPushToken,
	unregisterPushToken,
	getPushTokensForUser,
} from "./push-token.service";

// Commission incentive thresholds (UAT §12 — 3b)
export {
	computeIncentiveBonusCents,
	monthlyPeriodKey,
	createIncentive,
	type CreateIncentiveInput,
	listIncentives,
	deactivateIncentive,
	listIncentiveAwards,
	evaluateIncentivesForPeriod,
	type EvaluateIncentivesParams,
	type EvaluateIncentivesResult,
	type IncentiveRuleRow,
	type IncentiveAwardRow,
} from "./commission-incentive.service";
