import { protectedProcedure, publicProcedure } from "../index";
import type { RouterClient } from "@orpc/server";
import { z } from "zod";
import { hierarchyRouter } from "./hierarchy";
import { invitationRouter } from "./invitations";
import { memberRouter } from "./members";
import { appointmentsRouter } from "./appointments";
import { customerProfilesRouter } from "./customer-profiles";
import { notificationPreferencesRouter } from "./notification-preferences";
import { notificationsRouter } from "./notifications";
import { packageInstancesRouter } from "./package-instances";
import { packagesRouter } from "./packages";
import { preferredTimesRouter } from "./preferred-times";
import { serviceCategoriesRouter } from "./service-categories";
import { servicesRouter } from "./services";
import { userActivityLogRouter } from "./user-activity-log";
import { rolesRouter } from "./roles";
import { permissionsRouter } from "./permissions";
import { rolePermissionsRouter } from "./role-permissions";
import { serviceCommissionConfigRouter } from "./service-commission-config";
import { serviceRulesRouter } from "./service-rules";
import { payoutsRouter } from "./payouts";
import { roomsRouter } from "./rooms";
import { salesOrdersRouter } from "./sales-orders";
import { invoicesRouter } from "./invoices";
import { cancelledSalesRouter } from "./cancelled-sales";
import { brandsRouter } from "./brands";
import { productCategoriesRouter } from "./product-categories";
import { suppliersRouter } from "./suppliers";
import { unitsOfMeasureRouter } from "./units-of-measure";
import { productsRouter } from "./products";
import { stockRequestsRouter } from "./stock-requests";
import { transferOrdersRouter } from "./transfer-orders";

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
	packages: packagesRouter,
	packageInstances: packageInstancesRouter,
	preferredTimes: preferredTimesRouter,
	notifications: notificationsRouter,
	notificationPreferences: notificationPreferencesRouter,
	customerProfiles: customerProfilesRouter,
	userActivityLog: userActivityLogRouter,
	roles: rolesRouter,
	permissions: permissionsRouter,
	rolePermissions: rolePermissionsRouter,
	serviceCommissionConfig: serviceCommissionConfigRouter,
	serviceRules: serviceRulesRouter,
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
};

// Auth router type definition for client type inference
// The actual implementation is in apps/server/src/routers/auth.ts
// This dummy implementation is only for type generation
const authRouterType = {
	login: publicProcedure
		.input(z.object({ email: z.string(), password: z.string() }))
		.handler((): {
			accessToken: string;
			refreshToken: string;
			user: { id: string; email: string; name: string; emailVerified: boolean; createdAt: Date };
			organizations: Array<{ id: string; name: string; slug: string; role: string }>;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	userContext: protectedProcedure.handler((): {
		user: { id: string; email: string; name: string; emailVerified: boolean };
		organizations: Array<{
			id: string;
			name: string;
			slug: string;
			role: string;
			hierarchy: {
				nodes: Array<{
					id: string;
					name: string;
					type: string;
					depth: number;
					parentId: string | null;
					createdAt: Date | null;
					updatedAt: Date | null;
				}>;
				member: {
					role: string;
					hierarchyScopeId: string;
					hierarchyScopeName: string;
					accessibleNodeIds: string[];
				} | null;
			};
		}>;
		currentOrganizationId: string | null;
	} => {
		throw new Error("Not implemented - this is only for type inference");
	}),
	verifyEmail: publicProcedure
		.input(z.object({ token: z.string() }))
		.handler((): { message: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Server-specific invitation procedures type definition for client type inference
// The actual implementation is in apps/server/src/routers/invitations.ts
const serverInvitationRouterType = {
	sendEmail: protectedProcedure
		.input(
			z.object({
				invitation: z.object({
					token: z.string(),
					email: z.string().email(),
					role: z.string(),
				}),
				organizationId: z.string().uuid(),
				organizationName: z.string().optional(),
				inviterName: z.string().optional(),
			})
		)
		.handler((): { success: boolean; message: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Admin router type definition for client type inference
// The actual implementation is in apps/server/src/routers/admin.ts
const adminRouterType = {
	listTenants: protectedProcedure
		.input(
			z.object({
				status: z.enum(["active", "suspended"]).optional(),
				search: z.string().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(100).default(50),
			})
		)
		.handler((): {
			data: Array<{
				id: string;
				name: string;
				slug: string;
				status: "active" | "suspended";
				neonBranchId: string;
				subscriptionId: string;
				subscriptionTier: "starter" | "professional" | "enterprise";
				memberCount: number;
				createdAt: Date;
			}>;
			pagination: {
				currentPage: number;
				totalPages: number;
				pageSize: number;
				totalItems: number;
			};
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	getTenant: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler((): {
			id: string;
			name: string;
			slug: string;
			status: "active" | "suspended";
			neonBranchId: string;
			subscriptionId: string;
			subscriptionTier: "starter" | "professional" | "enterprise";
			memberCount: number;
			createdAt: Date;
			ownerUserId?: string;
			ownerEmail?: string;
			hierarchyNodeCount: number;
			subscription?: {
				stripeSubscriptionId: string;
				stripeCustomerId: string;
				tier: string;
				organizationCountLimit: number;
				status: string;
			};
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	suspendTenant: protectedProcedure
		.input(z.object({ id: z.string().uuid(), reason: z.string() }))
		.handler((): {
			id: string;
			name: string;
			slug: string;
			status: "active" | "suspended";
			neonBranchId: string;
			subscriptionId: string;
			subscriptionTier: "starter" | "professional" | "enterprise";
			memberCount: number;
			createdAt: Date;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	unsuspendTenant: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler((): {
			id: string;
			name: string;
			slug: string;
			status: "active" | "suspended";
			neonBranchId: string;
			subscriptionId: string;
			subscriptionTier: "starter" | "professional" | "enterprise";
			memberCount: number;
			createdAt: Date;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	startImpersonation: protectedProcedure
		.input(
			z.object({
				userId: z.string().uuid(),
				organizationId: z.string().uuid().optional(),
			})
		)
		.handler((): {
			impersonationToken: string;
			sessionId: string;
			expiresAt: Date;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	exitImpersonation: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.handler((): { success: boolean } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	getAuditLogs: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid().optional(),
				userId: z.string().uuid().optional(),
				action: z
					.enum([
						"organization.created",
						"organization.suspended",
						"member.invited",
						"member.removed",
						"impersonation.started",
						"impersonation.ended",
					])
					.optional(),
				startDate: z.string().datetime().optional(),
				endDate: z.string().datetime().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(200).default(50),
			})
		)
		.handler((): {
			data: Array<never>;
			pagination: {
				currentPage: number;
				totalPages: number;
				pageSize: number;
				totalItems: number;
			};
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	getStats: protectedProcedure.handler((): {
		totalOrganizations: number;
		activeOrganizations: number;
		suspendedOrganizations: number;
		totalUsers: number;
		totalMembers: number;
		activeSubscriptions: number;
	} => {
		throw new Error("Not implemented - this is only for type inference");
	}),
};

// Full appRouter with auth and server-specific procedures for type inference on the client
export const appRouter = {
	...baseRouter,
	auth: authRouterType,
	// Extend invitations router with server-specific sendEmail procedure type
	invitations: {
		...invitationRouter,
		...serverInvitationRouterType,
	},
	admin: adminRouterType,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
