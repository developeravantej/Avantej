import type { RouterClient } from "@orpc/server";
import { protectedProcedure, publicProcedure } from "../index";
import * as serverRouterTypes from "./_types/server-router-types";
import { analyticsRouter } from "./analytics";
import { categoryBufferOverridesRouter } from "./category-buffer-overrides";
import { announcementsRouter } from "./announcements";
import { appointmentsRouter } from "./appointments";
import { auditLogsRouter } from "./audit-logs";
import { brandsRouter } from "./brands";
import { cancelledSalesRouter } from "./cancelled-sales";
import { coachIntakeRouter } from "./coach-intake";
import { checkInsRouter } from "./check-ins";
import { classSlotsRouter } from "./class-slots";
import { categoryCommissionRouter } from "./category-commission";
import { commissionSplitsRouter } from "./commission-splits";
import { customerDirectoryRouter } from "./customer-directory";
import { customerProfilesRouter } from "./customer-profiles";
import { expensesRouter } from "./expenses";
import { googleCalendarRouter } from "./google-calendar";
import { hierarchyRouter } from "./hierarchy";
import { installmentPlansRouter } from "./installment-plans";
import { installmentsRouter } from "./installments";
import { invitationRouter } from "./invitations";
import { invoicesRouter } from "./invoices";
import { memberProfilesRouter } from "./member-profiles";
import { memberRouter } from "./members";
import { notificationPreferencesRouter } from "./notification-preferences";
import { notificationsRouter } from "./notifications";
import { organizationSettingsRouter } from "./organization-settings";
import { packageInstancesRouter } from "./package-instances";
import { packageInstanceStaffRouter } from "./package-instance-staff";
import { payoutsRouter } from "./payouts";
import { permissionsRouter } from "./permissions";
import { posRouter } from "./pos";
import { preferredTimesRouter } from "./preferred-times";
import { productCategoriesRouter } from "./product-categories";
import { productsRouter } from "./products";
import { promotionsRouter } from "./promotions";
import { goodsReceiptsRouter } from "./goods-receipts";
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
import { transferOrdersRouter } from "./transfer-orders";
import { unitsOfMeasureRouter } from "./units-of-measure";
import { userActivityLogRouter } from "./user-activity-log";
import { waitlistRouter } from "./waitlist";
import { walkInCustomersRouter } from "./walk-in-customers";
// #region Agent 3.1 — membership freeze/resume (Phase 3 — J4)
import { membershipsRouter } from "./memberships";
// #endregion
// #region Agent 3.6 — household linking (Phase 3)
import { householdsRouter } from "./households";
// #endregion
// #region Phase 0 — branch QR onboarding (sales-pipeline-fixes)
import { branchInvitesRouter } from "./branch-invites";
import { onboardingRouter } from "./onboarding";
// #endregion
import { trainersRouter } from "./trainers";

// Base router without auth (auth router is added by server with server-specific dependencies)
export const baseRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
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
	categoryCommission: categoryCommissionRouter,
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
	// #region Agent 3.1 — membership freeze/resume (Phase 3 — J4)
	memberships: membershipsRouter,
	// #endregion
	// #region Agent 3.6 — household linking (Phase 3)
	households: householdsRouter,
	// #endregion
	// #region Phase 0 — branch QR onboarding (sales-pipeline-fixes)
	branchInvites: branchInvitesRouter,
	onboarding: onboardingRouter,
	// #endregion
	trainers: trainersRouter,
};


// Full appRouter with auth and server-specific procedures for type inference on the client
export const appRouter = {
	...baseRouter,
	auth: serverRouterTypes.authRouterType,
	// Extend invitations router with server-specific sendEmail procedure type
	invitations: {
		...invitationRouter,
		...serverRouterTypes.serverInvitationRouterType,
	},
	// Extend customerProfiles router with server-specific softDelete procedure type
	customerProfiles: {
		...customerProfilesRouter,
		...serverRouterTypes.serverCustomerProfilesRouterType,
	},
	admin: serverRouterTypes.adminRouterType,
	tenantAdmin: serverRouterTypes.tenantAdminRouterType,
	ghl: serverRouterTypes.ghlRouterType,
	subscriptions: serverRouterTypes.subscriptionsRouterType,
	stripeConnect: serverRouterTypes.stripeConnectRouterType,
	payments: serverRouterTypes.paymentsRouterType,
	platformAdminPayments: serverRouterTypes.platformAdminPaymentsRouterType,
	platformAdminTenants: {
		...serverRouterTypes.platformAdminTenantsRouterType,
		...serverRouterTypes.platformAdminTenantsUsageTypes,
		...serverRouterTypes.platformAdminTenantsLifecycleTypes,
		...serverRouterTypes.platformAdminTenantsFunnelTypes,
		...serverRouterTypes.platformAdminTenantsCommsTypes,
		...serverRouterTypes.platformAdminTenantsProvisionRouterType,
		...serverRouterTypes.platformAdminTenantsDeletionRouterType,
		notes: serverRouterTypes.platformAdminTenantsNotesRouterType,
		tags: serverRouterTypes.platformAdminTenantsTagsRouterType,
		search: serverRouterTypes.platformAdminTenantsSearchRouterType,
		health: serverRouterTypes.platformAdminTenantsHealthRouterType,
		billing: serverRouterTypes.platformAdminTenantsBillingRouterType,
		members: serverRouterTypes.platformAdminTenantsMembersRouterType,
		featureFlags: serverRouterTypes.platformAdminTenantsFeatureFlagsRouterType,
	},
	platformAdminAudit: serverRouterTypes.platformAdminAuditRouterType,
	platformAdminDashboard: serverRouterTypes.platformAdminDashboardRouterType,
	platformAdminRevenue: serverRouterTypes.platformAdminRevenueRouterType,
	platformAdminComms: serverRouterTypes.platformAdminCommsRouterType,
	platformAdminCoupons: serverRouterTypes.platformAdminCouponsRouterType,
	platformAdminBilling: serverRouterTypes.platformAdminBillingRouterType,
	platformAdminRenewals: serverRouterTypes.platformAdminRenewalsRouterType,
	platformAdminHealth: serverRouterTypes.platformAdminHealthRouterType,
	platformAdminWebhooks: serverRouterTypes.platformAdminWebhooksRouterType,
	platformAdminMigrations: serverRouterTypes.platformAdminMigrationsRouterType,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
