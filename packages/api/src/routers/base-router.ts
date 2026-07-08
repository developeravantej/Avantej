import { protectedProcedure, publicProcedure } from "../index";
import { analyticsRouter } from "./analytics";
import { announcementsRouter } from "./announcements";
import { appointmentsRouter } from "./appointments";
import { auditLogsRouter } from "./audit-logs";
import { branchInvitesRouter } from "./branch-invites";
import { brandsRouter } from "./brands";
import { cancelledSalesRouter } from "./cancelled-sales";
import { categoryBufferOverridesRouter } from "./category-buffer-overrides";
import { categoryCommissionRouter } from "./category-commission";
import { checkInsRouter } from "./check-ins";
import { commissionCycleRouter } from "./commission-cycle";
import { classSlotsRouter } from "./class-slots";
import { coachIntakeRouter } from "./coach-intake";
import { commissionSplitsRouter } from "./commission-splits";
import { commissionTracksRouter } from "./commission-tracks";
import { commissionIncentivesRouter } from "./commission-incentives";
import { pushTokensRouter } from "./push-tokens";
import { customerDirectoryRouter } from "./customer-directory";
import { customerProfilesRouter } from "./customer-profiles";
import { dataExportRouter } from "./data-export";
import { dataImportRouter } from "./data-import";
import { expensesRouter } from "./expenses";
import { goodsReceiptsRouter } from "./goods-receipts";
import { googleCalendarRouter } from "./google-calendar";
import { hierarchyRouter } from "./hierarchy";
import { householdsRouter } from "./households";
import { installmentPlansRouter } from "./installment-plans";
import { installmentsRouter } from "./installments";
import { invitationRouter } from "./invitations";
import { invoicesRouter } from "./invoices";
import { memberProfilesRouter } from "./member-profiles";
import { memberRouter } from "./members";
import { membershipsRouter } from "./memberships";
import { notificationPreferencesRouter } from "./notification-preferences";
import { notificationsRouter } from "./notifications";
import { onboardingRouter } from "./onboarding";
import { organizationSettingsRouter } from "./organization-settings";
import { packageInstanceStaffRouter } from "./package-instance-staff";
import { packageInstancesRouter } from "./package-instances";
import { payrollPeriodsRouter } from "./payroll-periods";
import { payoutsRouter } from "./payouts";
import { permissionsRouter } from "./permissions";
import { posRouter } from "./pos";
import { preferredTimesRouter } from "./preferred-times";
import { productCategoriesRouter } from "./product-categories";
import { productsRouter } from "./products";
import { promotionsRouter } from "./promotions";
import { purchaseOrdersRouter } from "./purchase-orders";
import { refundsRouter } from "./refunds";
import { registrationRouter } from "./registration";
import { reportsRouter } from "./reports";
import { rolePermissionsRouter } from "./role-permissions";
import { rolesRouter } from "./roles";
import { roomsRouter } from "./rooms";
import { salesOrdersRouter } from "./sales-orders";
import { scheduledReportsRouter } from "./scheduled-reports";
import { serviceCategoriesRouter } from "./service-categories";
import { serviceCategoryConfigRouter } from "./service-category-config";
import { serviceMembersRouter } from "./service-members";
import { servicesRouter } from "./services";
import { stockRequestsRouter } from "./stock-requests";
import { suppliersRouter } from "./suppliers";
import { taxRatesRouter } from "./tax-rates";
import { trainerAvailabilityRouter } from "./trainer-availability";
import { trainerTiersRouter } from "./trainer-tiers";
import { trainersRouter } from "./trainers";
import { ghlSyncRouter } from "./ghl-sync";
import { transferOrdersRouter } from "./transfer-orders";
import { unitsOfMeasureRouter } from "./units-of-measure";
import { userActivityLogRouter } from "./user-activity-log";
import { waitlistRouter } from "./waitlist";
import { walkInCustomersRouter } from "./walk-in-customers";

export { customerProfilesRouter, invitationRouter };

// The two inline procedures are named so BaseRouter can reference them by
// `typeof` (an anonymous handler expression has no nameable type).
const healthCheck = publicProcedure.handler(() => "OK");
const privateData = protectedProcedure.handler(({ context }) => ({
	message: "This is private",
	user: context.session?.user,
}));

/**
 * Explicit type for `baseRouter`. Every field is a `typeof` reference to an
 * already-named router, so the emitted `.d.ts` stays a list of short references
 * instead of one giant inferred object literal. A bare `export const baseRouter
 * = {…}` forces rolldown-plugin-dts to materialize that literal in full, which
 * trips TS7056 ("inferred type exceeds the maximum length the compiler will
 * serialize"). This mirrors the appRouter/AppRouter treatment in ./index.ts —
 * and giving `typeof baseRouter` a nameable shape is also what lets AppRouter
 * expose these routers (e.g. dataImport) to the web client instead of `any`.
 */
export type BaseRouter = {
	healthCheck: typeof healthCheck;
	privateData: typeof privateData;
	hierarchy: typeof hierarchyRouter;
	invitations: typeof invitationRouter;
	members: typeof memberRouter;
	serviceCategories: typeof serviceCategoriesRouter;
	services: typeof servicesRouter;
	appointments: typeof appointmentsRouter;
	packageInstances: typeof packageInstancesRouter;
	packageInstanceStaff: typeof packageInstanceStaffRouter;
	preferredTimes: typeof preferredTimesRouter;
	notifications: typeof notificationsRouter;
	notificationPreferences: typeof notificationPreferencesRouter;
	customerProfiles: typeof customerProfilesRouter;
	userActivityLog: typeof userActivityLogRouter;
	roles: typeof rolesRouter;
	permissions: typeof permissionsRouter;
	rolePermissions: typeof rolePermissionsRouter;
	serviceCategoryConfig: typeof serviceCategoryConfigRouter;
	payouts: typeof payoutsRouter;
	rooms: typeof roomsRouter;
	salesOrders: typeof salesOrdersRouter;
	invoices: typeof invoicesRouter;
	cancelledSales: typeof cancelledSalesRouter;
	brands: typeof brandsRouter;
	productCategories: typeof productCategoriesRouter;
	suppliers: typeof suppliersRouter;
	unitsOfMeasure: typeof unitsOfMeasureRouter;
	products: typeof productsRouter;
	stockRequests: typeof stockRequestsRouter;
	transferOrders: typeof transferOrdersRouter;
	expenses: typeof expensesRouter;
	announcements: typeof announcementsRouter;
	classSlots: typeof classSlotsRouter;
	memberProfiles: typeof memberProfilesRouter;
	waitlist: typeof waitlistRouter;
	commissionSplits: typeof commissionSplitsRouter;
	commissionTracks: typeof commissionTracksRouter;
	commissionIncentives: typeof commissionIncentivesRouter;
	pushTokens: typeof pushTokensRouter;
	categoryCommission: typeof categoryCommissionRouter;
	commissionCycle: typeof commissionCycleRouter;
	purchaseOrders: typeof purchaseOrdersRouter;
	goodsReceipts: typeof goodsReceiptsRouter;
	promotions: typeof promotionsRouter;
	walkInCustomers: typeof walkInCustomersRouter;
	taxRates: typeof taxRatesRouter;
	analytics: typeof analyticsRouter;
	scheduledReports: typeof scheduledReportsRouter;
	registration: typeof registrationRouter;
	coachIntake: typeof coachIntakeRouter;
	trainerAvailability: typeof trainerAvailabilityRouter;
	trainerTiers: typeof trainerTiersRouter;
	serviceMembers: typeof serviceMembersRouter;
	categoryBufferOverrides: typeof categoryBufferOverridesRouter;
	installments: typeof installmentsRouter;
	installmentPlans: typeof installmentPlansRouter;
	organizationSettings: typeof organizationSettingsRouter;
	googleCalendar: typeof googleCalendarRouter;
	customerDirectory: typeof customerDirectoryRouter;
	auditLogs: typeof auditLogsRouter;
	checkIns: typeof checkInsRouter;
	pos: typeof posRouter;
	refunds: typeof refundsRouter;
	reports: typeof reportsRouter;
	memberships: typeof membershipsRouter;
	households: typeof householdsRouter;
	branchInvites: typeof branchInvitesRouter;
	onboarding: typeof onboardingRouter;
	trainers: typeof trainersRouter;
	ghlSync: typeof ghlSyncRouter;
	payrollPeriods: typeof payrollPeriodsRouter;
	dataImport: typeof dataImportRouter;
	dataExport: typeof dataExportRouter;
};

/** Tenant-scoped routers merged into appRouter (Plan D.2.1). */
export const baseRouter = {
	healthCheck,
	privateData,
	hierarchy: hierarchyRouter,
	invitations: invitationRouter,
	members: memberRouter,
	serviceCategories: serviceCategoriesRouter,
	services: servicesRouter,
	appointments: appointmentsRouter,
	packageInstances: packageInstancesRouter,
	packageInstanceStaff: packageInstanceStaffRouter,
	preferredTimes: preferredTimesRouter,
	notifications: notificationsRouter,
	notificationPreferences: notificationPreferencesRouter,
	customerProfiles: customerProfilesRouter,
	userActivityLog: userActivityLogRouter,
	roles: rolesRouter,
	permissions: permissionsRouter,
	rolePermissions: rolePermissionsRouter,
	serviceCategoryConfig: serviceCategoryConfigRouter,
	payouts: payoutsRouter,
	rooms: roomsRouter,
	salesOrders: salesOrdersRouter,
	invoices: invoicesRouter,
	cancelledSales: cancelledSalesRouter,
	brands: brandsRouter,
	productCategories: productCategoriesRouter,
	suppliers: suppliersRouter,
	unitsOfMeasure: unitsOfMeasureRouter,
	products: productsRouter,
	stockRequests: stockRequestsRouter,
	transferOrders: transferOrdersRouter,
	expenses: expensesRouter,
	announcements: announcementsRouter,
	classSlots: classSlotsRouter,
	memberProfiles: memberProfilesRouter,
	waitlist: waitlistRouter,
	commissionSplits: commissionSplitsRouter,
	commissionTracks: commissionTracksRouter,
	commissionIncentives: commissionIncentivesRouter,
	pushTokens: pushTokensRouter,
	categoryCommission: categoryCommissionRouter,
	commissionCycle: commissionCycleRouter,
	purchaseOrders: purchaseOrdersRouter,
	goodsReceipts: goodsReceiptsRouter,
	promotions: promotionsRouter,
	walkInCustomers: walkInCustomersRouter,
	taxRates: taxRatesRouter,
	analytics: analyticsRouter,
	scheduledReports: scheduledReportsRouter,
	registration: registrationRouter,
	coachIntake: coachIntakeRouter,
	trainerAvailability: trainerAvailabilityRouter,
	trainerTiers: trainerTiersRouter,
	serviceMembers: serviceMembersRouter,
	categoryBufferOverrides: categoryBufferOverridesRouter,
	installments: installmentsRouter,
	installmentPlans: installmentPlansRouter,
	organizationSettings: organizationSettingsRouter,
	googleCalendar: googleCalendarRouter,
	customerDirectory: customerDirectoryRouter,
	auditLogs: auditLogsRouter,
	checkIns: checkInsRouter,
	pos: posRouter,
	refunds: refundsRouter,
	reports: reportsRouter,
	memberships: membershipsRouter,
	households: householdsRouter,
	branchInvites: branchInvitesRouter,
	onboarding: onboardingRouter,
	trainers: trainersRouter,
	ghlSync: ghlSyncRouter,
	payrollPeriods: payrollPeriodsRouter,
	dataImport: dataImportRouter,
	dataExport: dataExportRouter,
	// Asserted (not annotated `: BaseRouter`) for the same reason appRouter is:
	// structurally re-verifying this giant oRPC literal on a cold build exceeds
	// TS's instantiation depth. Each field is `typeof`-derived from the very
	// value assigned, so the assertion is tautologically correct. See ./index.ts.
} as unknown as BaseRouter;
