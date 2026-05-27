import type { RouterClient } from "@orpc/server";
import * as serverRouterTypes from "./_types/server-router-types";
import {
	baseRouter,
	customerProfilesRouter,
	invitationRouter,
} from "./base-router";

export { baseRouter } from "./base-router";

// Typed intermediate sub-objects — each small enough for rolldown-plugin-dts
// to serialize individually. Named type aliases prevent TS7056 on appRouter.

const _invitationsRouter = {
	...invitationRouter,
	...serverRouterTypes.serverInvitationRouterType,
};
type _InvitationsRouter = typeof _invitationsRouter;

const _customerProfilesRouter = {
	...customerProfilesRouter,
	...serverRouterTypes.serverCustomerProfilesRouterType,
};
type _CustomerProfilesRouter = typeof _customerProfilesRouter;

const _platformAdminTenantsRouter = {
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
};
type _PlatformAdminTenantsRouter = typeof _platformAdminTenantsRouter;

// AppRouter is declared explicitly so rolldown-plugin-dts never needs to
// infer the merged type of appRouter in full (which would exceed TS7056 limit).
export type AppRouter = typeof baseRouter & {
	auth: typeof serverRouterTypes.authRouterType;
	invitations: _InvitationsRouter;
	customerProfiles: _CustomerProfilesRouter;
	admin: typeof serverRouterTypes.adminRouterType;
	tenantAdmin: typeof serverRouterTypes.tenantAdminRouterType;
	ghl: typeof serverRouterTypes.ghlRouterType;
	subscriptions: typeof serverRouterTypes.subscriptionsRouterType;
	stripeConnect: typeof serverRouterTypes.stripeConnectRouterType;
	partnerStripe: typeof serverRouterTypes.partnerStripeRouterType;
	payments: typeof serverRouterTypes.paymentsRouterType;
	platformAdminPayments: typeof serverRouterTypes.platformAdminPaymentsRouterType;
	platformAdminTenants: _PlatformAdminTenantsRouter;
	platformAdminAudit: typeof serverRouterTypes.platformAdminAuditRouterType;
	platformAdminDashboard: typeof serverRouterTypes.platformAdminDashboardRouterType;
	platformAdminRevenue: typeof serverRouterTypes.platformAdminRevenueRouterType;
	platformAdminComms: typeof serverRouterTypes.platformAdminCommsRouterType;
	platformAdminCoupons: typeof serverRouterTypes.platformAdminCouponsRouterType;
	platformAdminBilling: typeof serverRouterTypes.platformAdminBillingRouterType;
	platformAdminRenewals: typeof serverRouterTypes.platformAdminRenewalsRouterType;
	platformAdminHealth: typeof serverRouterTypes.platformAdminHealthRouterType;
	platformAdminWebhooks: typeof serverRouterTypes.platformAdminWebhooksRouterType;
	platformAdminMigrations: typeof serverRouterTypes.platformAdminMigrationsRouterType;
};

/** Full router for client type inference (server procedures merged at runtime). */
export const appRouter: AppRouter = {
	...baseRouter,
	auth: serverRouterTypes.authRouterType,
	invitations: _invitationsRouter,
	customerProfiles: _customerProfilesRouter,
	admin: serverRouterTypes.adminRouterType,
	tenantAdmin: serverRouterTypes.tenantAdminRouterType,
	ghl: serverRouterTypes.ghlRouterType,
	subscriptions: serverRouterTypes.subscriptionsRouterType,
	stripeConnect: serverRouterTypes.stripeConnectRouterType,
	partnerStripe: serverRouterTypes.partnerStripeRouterType,
	payments: serverRouterTypes.paymentsRouterType,
	platformAdminPayments: serverRouterTypes.platformAdminPaymentsRouterType,
	platformAdminTenants: _platformAdminTenantsRouter,
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

export type AppRouterClient = RouterClient<AppRouter>;
