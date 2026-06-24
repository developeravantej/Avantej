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

/** Tenant-scoped routers merged into appRouter (Plan D.2.1). */
export const baseRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	privateData: protectedProcedure.handler(({ context }) => ({
		message: "This is private",
		user: context.session?.user,
	})),
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
	memberships: membershipsRouter,
	households: householdsRouter,
	branchInvites: branchInvitesRouter,
	onboarding: onboardingRouter,
	trainers: trainersRouter,
	ghlSync: ghlSyncRouter,
};
