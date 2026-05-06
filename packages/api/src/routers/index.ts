import type { RouterClient } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { analyticsRouter } from "./analytics";
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
	registration: registrationRouter,
	coachIntake: coachIntakeRouter,
	trainerAvailability: trainerAvailabilityRouter,
	trainerTiers: trainerTiersRouter,
	serviceMembers: serviceMembersRouter,
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
};

// Auth router type definition for client type inference
// The actual implementation is in apps/server/src/routers/auth.ts
// This dummy implementation is only for type generation
const authRouterType = {
	login: publicProcedure
		.input(z.object({ email: z.string(), password: z.string() }))
		.handler(
			(): {
				accessToken: string;
				refreshToken: string;
				user: {
					id: string;
					email: string;
					name: string;
					firstName: string;
					lastName: string;
					emailVerified: boolean;
					createdAt: Date;
				};
				organizations: Array<{
					id: string;
					name: string;
					slug: string;
					role: string;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	userContext: protectedProcedure.handler(
		(): {
			user: {
				id: string;
				email: string;
				name: string;
				firstName: string;
				lastName: string;
				emailVerified: boolean;
			};
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
						id: string;
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
		},
	),
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
			}),
		)
		.handler((): { success: boolean; message: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Admin router type definition for client type inference
// The actual implementation is in apps/server/src/routers/admin.ts
const adminRouterType = {
	// ── New Phase 2 procedures ─────────────────────────────────────────────────

	/** Returns platform admin status for the current caller. Safe for any authenticated user. */
	me: protectedProcedure.handler(
		(): { isPlatformAdmin: false; role: null } | { isPlatformAdmin: true; role: "super_admin" | "support" | "billing" } => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),

	/** Paginated, searchable user list — any platform admin role. */
	listUsers: protectedProcedure
		.input(
			z.object({
				search: z.string().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(
			(): {
				data: Array<{
					id: string;
					email: string;
					firstName: string;
					lastName: string;
					name: string;
					lastLoginAt: Date | null;
					isPlatformAdmin: boolean;
					platformAdminRole: string | null;
				}>;
				pagination: {
					currentPage: number;
					totalPages: number;
					pageSize: number;
					totalItems: number;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	/** List all platform_admins rows — super_admin only. */
	listAdmins: protectedProcedure.handler(
		(): Array<{
			userId: string;
			email: string | null;
			name: string | null;
			role: "super_admin" | "support" | "billing";
			grantedAt: Date;
			grantedByEmail: string | null;
		}> => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),

	/** Start impersonating a user — super_admin / support only. */
	impersonateUser: protectedProcedure
		.input(z.object({ userId: z.string() }))
		.handler(
			(): {
				success: true;
				redirectTo: string;
				impersonatedUserId: string;
				organizationId: string | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	/** Stop an active impersonation session. Callable while impersonating. */
	stopImpersonating: protectedProcedure.handler(
		(): { success: true; redirectTo: string } => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),

	/** Return impersonation status for the current session. */
	getImpersonationStatus: protectedProcedure.handler(
		():
			| { isImpersonating: false }
			| {
					isImpersonating: true;
					type: "platform" | "tenant";
					adminUser: { id: string; email: string | null; name: string | null };
					impersonatedUser: { id: string; email: string; name: string };
			  } => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),

	/** Grant platform admin role to a user — super_admin only. */
	grantPlatformAdmin: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
				role: z.enum(["super_admin", "support", "billing"]),
			}),
		)
		.handler((): { success: true; role: "super_admin" | "support" | "billing" } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	/** Revoke platform admin role — super_admin only. Cannot revoke own role. */
	revokePlatformAdmin: protectedProcedure
		.input(z.object({ userId: z.string() }))
		.handler((): { success: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	// ── Existing procedures (unchanged) ────────────────────────────────────────

	listTenants: protectedProcedure
		.input(
			z.object({
				status: z.enum(["active", "suspended"]).optional(),
				search: z.string().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(
			(): {
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
			},
		),
	getTenant: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(
			(): {
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
			},
		),
	suspendTenant: protectedProcedure
		.input(z.object({ id: z.string().uuid(), reason: z.string() }))
		.handler(
			(): {
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
			},
		),
	unsuspendTenant: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(
			(): {
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
			},
		),
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
			}),
		)
		.handler(
			(): {
				data: Array<never>;
				pagination: {
					currentPage: number;
					totalPages: number;
					pageSize: number;
					totalItems: number;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getStats: protectedProcedure.handler(
		(): {
			totalOrganizations: number;
			activeOrganizations: number;
			suspendedOrganizations: number;
			totalUsers: number;
			totalMembers: number;
			activeSubscriptions: number;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
};

// Tenant admin router type definition for client type inference.
// The actual implementation is in apps/server/src/routers/tenant-admin.ts
// (server-only: imports getBetterAuth which is not available in packages/api).
const tenantAdminRouterType = {
	/** Impersonate a staff member in the caller's own organization. */
	impersonateMember: protectedProcedure
		.input(z.object({ targetMemberId: z.string().uuid(), organizationId: z.string().uuid() }))
		.handler(
			(): {
				success: true;
				redirectTo: string;
				impersonatedUserId: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	/** Stop an active tenant-admin impersonation session. */
	stopImpersonating: protectedProcedure.handler(
		(): { success: true; redirectTo: string } => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
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
	tenantAdmin: tenantAdminRouterType,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
