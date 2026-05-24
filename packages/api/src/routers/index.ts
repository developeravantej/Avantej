import type { RouterClient } from "@orpc/server";
import * as serverRouterTypes from "./_types/server-router-types";
import {
	baseRouter,
	customerProfilesRouter,
	invitationRouter,
} from "./base-router";

export { baseRouter } from "./base-router";

/** Full router for client type inference (server procedures merged at runtime). */
export const appRouter = {
	...baseRouter,
	auth: serverRouterTypes.authRouterType,
	invitations: {
		...invitationRouter,
		...serverRouterTypes.serverInvitationRouterType,
	},
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
