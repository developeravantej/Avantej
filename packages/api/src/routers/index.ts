import type { RouterClient } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
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
	// Server override of base accept — adds post-acceptance GHL sync for clients.
	accept: protectedProcedure
		.input(
			z.object({
				token: z.string(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(
			(): { success: boolean; message: string; organizationId: string } => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	// Atomic sign-up + accept + GHL sync (public — token+email match = auth proof).
	acceptWithSignup: publicProcedure
		.input(
			z.object({
				token: z.string().min(1),
				organizationId: z.string().uuid(),
				email: z.string().email(),
				password: z.string().min(8),
				firstName: z.string().min(1),
				lastName: z.string().min(1),
				phone: z.string().trim().min(1).optional(),
			}),
		)
		.handler(
			(): {
				success: boolean;
				message: string;
				organizationId: string;
				userId: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
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
	stopImpersonating: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): { success: true; redirectTo: string } => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Server-side customerProfiles overrides type definition for client type inference.
// The actual implementation is in apps/server/src/routers/customer-profiles.ts
// (server-only: imports fireCustomerSync which requires server-only GHL deps).
const serverCustomerProfilesRouterType = {
	softDelete: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
			}),
		)
		.handler((): { ok: boolean; profileId: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	restore: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
			}),
		)
		.handler((): Promise<{ ok: boolean; profileId: string }> => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	retryGhlSync: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				ghlSync:
					| {
							status: "synced" | "skipped" | "error";
							ghlContactId?: string;
							error?: string;
							reason?: string;
					  };
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Subscriptions router type definition for client type inference.
// The actual implementation is in apps/server/src/routers/subscriptions.ts
// (server-only: uses Stripe SDK, Neon control panel DB).
const subscriptionsRouterType = {
	createCheckoutSession: protectedProcedure
		.input(
			z.object({
				tier: z.enum(["basic", "professional", "enterprise"]),
				organizationId: z.string().uuid(),
			}),
		)
		.handler((): { checkoutUrl: string; sessionId: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	getStatus: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				status: "active" | "past_due" | "trialing" | "none" | string;
				tier: string | null;
				currentPeriodEnd: Date | null;
				pastDueAt: Date | null;
				gracePeriodEndsAt: Date | null;
				trialEndsAt: Date | null;
				decision?: string;
				banner?: string | null;
				blockedReason?: string | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	billingPortal: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler((): { portalUrl: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Payments router type definition for client type inference.
// Real impl in apps/server/src/routers/payments.ts (uses Stripe SDK + tenant DB).
const paymentsRouterType = {
	createPaymentIntent: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				clientSecret: string;
				paymentIntentId: string;
				stripeAccountId: string;
				amount: number;
				currency: string;
				applicationFeeAmount: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	sendPaymentLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
				regenerate: z.boolean().optional(),
			}),
		)
		.handler(
			(): {
				paymentLinkId: string;
				paymentLinkUrl: string;
				amount: number;
				currency: string;
				applicationFeeAmount: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	getPaymentStatus: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				id: string;
				paymentStatus: string;
				stripePaymentIntentId: string | null;
				stripePaymentLinkId: string | null;
				paymentLinkUrl: string | null;
				currency: string;
				sessionTotal: number | null;
				applicationFeeAmount: number | null;
				paidAt: Date | null;
				paymentFailureReason: string | null;
				paymentMethodType: string | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	refund: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
				reason: z
					.enum(["duplicate", "fraudulent", "requested_by_customer"])
					.optional(),
			}),
		)
		.handler(
			(): {
				refundId: string;
				status: string;
				amount: number;
				currency: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	// Card-on-file (Plan B Phase 3d)
	createSetupIntent: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				clientSecret: string;
				setupIntentId: string;
				stripeAccountId: string;
				stripeCustomerId: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	listSavedCards: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				cards: Array<{
					id: string;
					brand: string;
					last4: string;
					expMonth: number;
					expYear: number;
					isDefault: boolean;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	chargeSavedCard: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
				appointmentId: z.string().uuid().nullable().optional(),
				paymentMethodId: z.string().min(1).nullable().optional(),
				amount: z.number().int().positive(),
				currency: z.string().min(3).max(3).default("MYR"),
				description: z.string().optional(),
			}),
		)
		.handler(
			(): {
				paymentIntentId: string;
				status: string;
				amount: number;
				currency: string;
				applicationFeeAmount: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	// POS online checkout (Plan B Phase 3c.1)
	createSalesOrderPaymentLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid(),
				regenerate: z.boolean().optional(),
			}),
		)
		.handler(
			(): {
				paymentLinkId: string;
				paymentLinkUrl: string;
				paymentId: string;
				amount: number;
				currency: string;
				applicationFeeAmount: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	// Package purchase (Plan B Phase 3c)
	purchasePackage: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
				clientId: z.string().min(1).nullable().optional(),
				walkInCustomerId: z.string().uuid().nullable().optional(),
				creditsTotal: z.number().int().positive(),
				totalPrice: z.number().int().positive(),
				currency: z.string().min(3).max(3).default("MYR"),
				validityDays: z.number().int().positive().default(180),
				remark: z.string().optional(),
			}),
		)
		.handler(
			(): {
				packageInstanceId: string;
				paymentLinkId: string;
				paymentLinkUrl: string;
				amount: number;
				currency: string;
				applicationFeeAmount: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Stripe Connect router type definition for client type inference.
// Real impl in apps/server/src/routers/stripe-connect.ts (uses Stripe SDK).
const stripeConnectRouterType = {
	createOnboardingUrl: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				countryCode: z
					.string()
					.length(2)
					.regex(/^[A-Za-z]{2}$/)
					.optional(),
			}),
		)
		.handler((): { onboardingUrl: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	getAccountStatus: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				connected: boolean;
				accountId: string | null;
				chargesEnabled: boolean;
				payoutsEnabled: boolean;
				detailsSubmitted: boolean;
				status: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	// Phase 4.3 — list all Connect accounts for an org (one per country).
	listCountryAccounts: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				accounts: Array<{
					countryCode: string;
					currency: string;
					stripeAccountId: string | null;
					chargesEnabled: boolean;
					payoutsEnabled: boolean;
					detailsSubmitted: boolean;
					status: string;
					onboardingCompletedAt: Date | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Payments router types (Plan C C.4).
const platformAdminPaymentsRouterType = {
	overview: protectedProcedure.handler(
		(): {
			applicationFeesThisMonth: number;
			saasRevenueThisMonth: number;
			drift: { critical: number; warn: number; info: number };
			openDisputes: number;
			stuckOnboardings: number;
			lastReconciliation: {
				id: string;
				startedAt: Date;
				completedAt: Date | null;
				status: string;
				driftCount: number;
				error: string | null;
			} | null;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
	listDrift: protectedProcedure
		.input(
			z.object({
				severity: z.enum(["info", "warn", "critical"]).optional(),
				resolved: z.boolean().optional(),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(
			(): {
				drift: Array<{
					id: string;
					runId: string;
					organizationId: string | null;
					stripeAccountId: string | null;
					resourceType: string;
					resourceId: string;
					severity: string;
					driftKind: string;
					stripeValue: unknown;
					dbValue: unknown;
					detectedAt: Date;
					resolvedAt: Date | null;
					resolvedBy: string | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	markDriftResolved: protectedProcedure
		.input(z.object({ driftId: z.string().uuid() }))
		.handler((): { resolved: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	listDisputes: protectedProcedure
		.input(
			z.object({
				status: z.string().optional(),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(
			(): {
				disputes: Array<{
					id: string;
					organizationId: string;
					stripeAccountId: string;
					disputeId: string;
					status: string;
					amount: number;
					currency: string;
					reason: string | null;
					deadlineAt: Date | null;
					handledAt: Date | null;
					handledBy: string | null;
					createdAt: Date;
					updatedAt: Date;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	markDisputeHandled: protectedProcedure
		.input(z.object({ disputeId: z.string() }))
		.handler((): { handled: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	listStuckOnboardings: protectedProcedure.handler(
		(): {
			stuck: Array<{
				organizationId: string;
				countryCode: string;
				stripeAccountId: string | null;
				status: string;
				detailsSubmitted: boolean;
				connectAccountUpdatedAt: Date | null;
				orgName: string;
				orgSlug: string;
			}>;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
	runReconciliationNow: protectedProcedure.handler(
		(): {
			runId: string;
			acctsScanned: number;
			resourcesExamined: number;
			driftFound: number;
			criticalCount: number;
			warnCount: number;
			infoCount: number;
			durationMs: number;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
	runWebhookBackfillNow: protectedProcedure.handler(
		(): {
			acctsScanned: number;
			eventsExamined: number;
			replayed: number;
			alreadyProcessed: number;
			errors: number;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
};

// Platform Admin — Audit router types (Plan E E.6).
const platformAdminAuditRouterType = {
	listAdminActions: protectedProcedure
		.input(
			z.object({
				actionType: z.string().optional(),
				adminUserId: z.string().optional(),
				targetOrganizationId: z.string().uuid().optional(),
				since: z.string().datetime().optional(),
				until: z.string().datetime().optional(),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(200).default(50),
			}),
		)
		.handler(
			(): {
				total: number;
				page: number;
				limit: number;
				actions: Array<{
					id: string;
					actionType: string;
					actorUserId: string | null;
					actorEmail: string | null;
					actorName: string | null;
					targetOrganizationId: string | null;
					targetOrgName: string | null;
					targetOrgSlug: string | null;
					targetUserId: string | null;
					metadata: unknown;
					adminSessionId: string | null;
					createdAt: Date;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	listActionTypes: protectedProcedure.handler(
		(): { actionTypes: string[] } => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
};

// Platform Admin — Tenants router types (Plan E E.1).
const platformAdminTenantsRouterType = {
	listTenants: protectedProcedure
		.input(
			z.object({
				search: z.string().trim().optional(),
				paymentStatus: z.string().optional(),
				countryCode: z.string().length(2).optional(),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(
			(): {
				total: number;
				page: number;
				limit: number;
				tenants: Array<{
					id: string;
					name: string;
					slug: string;
					countryCode: string | null;
					paymentStatus: string;
					trialEndsAt: Date | null;
					createdAt: Date;
					ownerEmail: string | null;
					ownerName: string | null;
					subTier: string | null;
					subStatus: string | null;
					connectAccounts: { total: number; chargesEnabled: number };
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getTenantDetail: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				organization: {
					id: string;
					name: string;
					slug: string;
					countryCode: string | null;
					neonProjectId: string;
					subscriptionId: string | null;
					ownerUserId: string | null;
					trialEndsAt: Date | null;
					paymentStatus: string;
					schemaVersion: string | null;
					ghlSyncModel: string | null;
					ghlProvisionedAt: Date | null;
					createdAt: Date;
					updatedAt: Date;
				};
				owner: {
					id: string;
					email: string;
					name: string;
					createdAt: Date;
				} | null;
				subscription: {
					id: string;
					stripeSubscriptionId: string;
					stripeCustomerId: string;
					stripePriceId: string;
					tier: string;
					organizationCountLimit: number;
					applicationFeeBps: number;
					currency: string;
					status: string;
					pastDueAt: Date | null;
					gracePeriodEndsAt: Date | null;
					trialEndsAt: Date | null;
					currentPeriodStart: Date | null;
					currentPeriodEnd: Date | null;
					cancelAtPeriodEnd: boolean;
					canceledAt: Date | null;
					createdAt: Date;
					updatedAt: Date;
				} | null;
				connectAccounts: Array<{
					id: string;
					organizationId: string;
					countryCode: string;
					stripeAccountId: string | null;
					stripeConnectStatus: string;
					stripeConnectAccountType: string;
					chargesEnabled: boolean;
					payoutsEnabled: boolean;
					detailsSubmitted: boolean;
					currency: string;
					stripeConnectOnboardingCompletedAt: Date | null;
					connectAccountUpdatedAt: Date | null;
					createdAt: Date;
					updatedAt: Date;
				}>;
				lastPayment: {
					occurredAt: Date;
					eventKind: string;
					amount: number;
					applicationFee: number;
					currency: string;
				} | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Comms types (Plan E E.5).
const platformAdminTenantsCommsTypes = {
	sendTenantDirectMessage: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				subject: z.string().trim().min(3).max(200),
				message: z.string().trim().min(3).max(5000),
			}),
		)
		.handler(
			(): {
				ok: true;
				deliveries: { email: boolean; inApp: boolean };
				errors: string[];
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	createTenantAnnouncement: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				title: z.string().trim().min(3).max(200),
				message: z.string().trim().min(3).max(5000),
				priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
				targetAudience: z.enum(["all", "staff", "clients"]).default("all"),
			}),
		)
		.handler((): { ok: true; announcementId: string | null } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	// Plan F.2.5 — Agent B bulk DM / announcement
	bulkSendDirectMessage: protectedProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(100),
				subject: z.string().trim().min(1).max(500),
				bodyMarkdown: z.string().trim().min(1).max(20000),
				templateId: z.string().uuid().optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				succeeded: number;
				failed: Array<{ orgId: string; error: string }>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	bulkSendAnnouncement: protectedProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(100),
				title: z.string().trim().min(1).max(200),
				bodyMarkdown: z.string().trim().min(1).max(20000),
				priority: z
					.enum(["low", "normal", "high", "urgent"])
					.default("normal"),
				targetAudience: z
					.enum(["all", "staff", "clients"])
					.default("all"),
				templateId: z.string().uuid().optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				succeeded: number;
				failed: Array<{ orgId: string; error: string }>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Funnel types (Plan E E.4).
const platformAdminTenantsFunnelTypes = {
	getTenantFunnel: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				organizationId: string;
				milestones: Array<{
					id:
						| "email_verified"
						| "hierarchy_seeded"
						| "first_member"
						| "first_customer"
						| "ghl_connected"
						| "first_appointment"
						| "first_payment";
					label: string;
					reached: boolean;
					reachedAt: Date | null;
				}>;
				stuckAt: string | null;
				completed: number;
				total: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Lifecycle types (Plan E E.3).
const platformAdminTenantsLifecycleTypes = {
	suspendTenant: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler((): { ok: true; paymentStatus: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	resumeTenant: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler((): { ok: true; paymentStatus: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	forceCancelTenant: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				reason: z.string().trim().min(3).max(500),
				cancelStripeSubscription: z.boolean().default(true),
			}),
		)
		.handler((): { ok: true; stripeSubCanceled: string | null } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	issueTenantCredit: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				amountMinor: z.number().int().positive().max(10_000_000),
				currency: z.string().length(3),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler((): { ok: true; stripeBalanceTxId: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	reTrialTenant: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				extendDays: z.number().int().positive().max(180),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler((): { ok: true; trialEndsAt: Date | null } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Platform Admin — Tenant Usage types (Plan E E.2).
const platformAdminTenantsUsageTypes = {
	getTenantUsageHistory: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				days: z.number().int().positive().max(180).default(30),
			}),
		)
		.handler(
			(): {
				snapshots: Array<{
					id: string;
					organizationId: string;
					snapshotDate: string;
					memberCount: number;
					customerCount: number;
					apptCount30d: number;
					salesTotal30dMinor: number;
					salesCurrency: string;
					storageBytes: number;
					ghlActive: boolean;
					createdAt: Date | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	runTenantUsageSnapshotsNow: protectedProcedure.handler(
		(): {
			snapshotDate: string;
			orgsScanned: number;
			written: number;
			errors: number;
			durationMs: number;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
};

// Platform Admin — Tenant Provisioning types (Plan E E.7).
const platformAdminTenantsProvisionRouterType = {
	provisionTenant: protectedProcedure
		.input(
			z.object({
				name: z.string().trim().min(2).max(120),
				slug: z
					.string()
					.trim()
					.min(3)
					.max(64)
					.regex(/^[a-z0-9-]+$/),
				country: z.enum(["MY", "SG", "TH"]),
				ownerEmail: z.string().email().max(254),
				ownerName: z.string().trim().max(120).optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				organizationId: string;
				slug: string;
				neonProjectId: string;
				invitationToken: string;
				invitationLink: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Notes types (Plan F.1).
const platformAdminTenantsNotesRouterType = {
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				notes: Array<{
					id: string;
					organizationId: string;
					authorUserId: string;
					body: string;
					isPinned: boolean;
					createdAt: Date | null;
					updatedAt: Date | null;
					authorEmail: string | null;
					authorName: string | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				body: z.string().min(1).max(5000),
				isPinned: z.boolean().default(false),
			}),
		)
		.handler((): { ok: true; noteId: string | null } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				body: z.string().min(1).max(5000).optional(),
				isPinned: z.boolean().optional(),
			}),
		)
		.handler((): { ok: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler((): { ok: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Platform Admin — Tenant Tags + Bulk Ops types (Plan F.1).
const platformAdminTenantsTagsRouterType = {
	list: protectedProcedure
		.input(z.object({ search: z.string().trim().optional() }).default({}))
		.handler(
			(): {
				tags: Array<{ label: string; color: string | null; orgCount: number }>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	listForOrg: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				tags: Array<{
					id: string;
					label: string;
					color: string | null;
					createdAt: Date | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	add: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				label: z.string().trim().min(1).max(50),
				color: z.string().trim().max(32).optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				tag: { id: string; label: string; color: string | null } | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	remove: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				label: z.string().trim().min(1).max(50),
			}),
		)
		.handler((): { ok: true; removed: number } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	bulkAdd: protectedProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(100),
				label: z.string().trim().min(1).max(50),
				color: z.string().trim().max(32).optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				attempted: number;
				inserted: number;
				skipped: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	bulkRemove: protectedProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(100),
				label: z.string().trim().min(1).max(50),
			}),
		)
		.handler((): { ok: true; attempted: number; removed: number } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	bulkSuspend: protectedProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(100),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler(
			(): {
				ok: true;
				attempted: number;
				suspended: number;
				failures: Array<{ organizationId: string; error: string }>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Cross-Tenant Search types (Plan F.1 — Agent S).
const platformAdminTenantsSearchRouterType = {
	search: protectedProcedure
		.input(
			z.object({
				query: z.string().min(1).max(200),
				limit: z.number().int().min(1).max(20).default(10),
			}),
		)
		.handler(
			(): {
				results: Array<{
					orgId: string;
					orgName: string;
					slug: string;
					matchType: "id" | "name" | "slug" | "email";
					matchedField?: string;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Health (Plan F.1.5 — Agent H). Exported for downstream consumers.
export const platformAdminTenantsHealthRouterType = {
	get: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				snapshotDate: string | null;
				healthScore: number | null;
				riskFlags:
					| Array<{
							code: string;
							severity: "info" | "warn" | "critical";
							observedAt: string;
					  }>
					| null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	history: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				days: z.number().int().min(7).max(90).default(30),
			}),
		)
		.handler(
			(): {
				series: Array<{
					snapshotDate: string;
					healthScore: number | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	listAtRisk: protectedProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(50).default(10),
			}),
		)
		.handler(
			(): {
				orgs: Array<{
					orgId: string;
					orgName: string;
					healthScore: number | null;
					criticalFlagCount: number;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Billing (Plan F.3-A — Agent I). Per-tenant
// Stripe invoice history + refund. Exported for downstream consumers.
export const platformAdminTenantsBillingRouterType = {
	listInvoices: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				limit: z.number().int().min(1).max(100).default(20),
				startingAfter: z.string().optional(),
			}),
		)
		.handler(
			(): {
				invoices: Array<{
					id: string;
					number: string | null;
					status: string | null;
					amountPaid: number;
					amountDue: number;
					currency: string;
					createdAt: Date;
					hostedInvoiceUrl: string | null;
					invoicePdf: string | null;
					paymentIntent: string | null;
					refunded: boolean;
					refundedAmount: number;
				}>;
				hasMore: boolean;
				nextCursor: string | undefined;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getInvoice: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().min(1),
			}),
		)
		.handler(
			(): {
				invoice: {
					id: string;
					number: string | null;
					status: string | null;
					amountPaid: number;
					amountDue: number;
					currency: string;
					createdAt: Date;
					hostedInvoiceUrl: string | null;
					invoicePdf: string | null;
					paymentIntent: string | null;
					refunded: boolean;
					refundedAmount: number;
				};
				lines: Array<{
					id: string;
					description: string | null;
					amount: number;
					currency: string;
					quantity: number | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	refundInvoice: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().min(1),
				amountCents: z.number().int().min(1).optional(),
				reason: z
					.enum(["duplicate", "fraudulent", "requested_by_customer"])
					.default("requested_by_customer"),
				notes: z.string().max(1000).optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				refundId: string;
				amountCents: number;
				status: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getCustomerSummary: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				stripeCustomerId: string | null;
				defaultPaymentMethod: { brand: string; last4: string } | null;
				currency: string;
				balance: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	// Plan F.3.5 — Agent T2 — Tier change mid-period.
	changeTier: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				toTier: z.enum(["basic", "professional", "enterprise"]),
				prorationBehavior: z
					.enum(["create_prorations", "none", "always_invoice"])
					.default("create_prorations"),
				notes: z.string().max(1000).optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				fromTier: "basic" | "professional" | "enterprise";
				toTier: "basic" | "professional" | "enterprise";
				prorationInvoiceId: string | null;
				prorationAmountCents: number | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Mission Control Dashboard types (Plan F.1.5 — Agent M).
export const platformAdminDashboardRouterType = {
	getOverview: protectedProcedure
		.input(z.object({}).default({}))
		.handler(
			(): {
				counts: {
					total: number;
					active: number;
					trialing: number;
					pastDue: number;
					unpaid: number;
					cancelled: number;
				};
				subs: { activeCount: number; trialingCount: number };
				mrr: { cents: number; estimateAvailable: boolean };
				recentActions: Array<{
					actorUserId: string;
					actorEmail?: string;
					action: string;
					targetOrgId?: string;
					targetOrgName?: string;
					createdAt: string;
				}>;
				atRisk: Array<{
					orgId: string;
					orgName: string;
					healthScore: number | null;
					criticalFlagCount: number;
				}>;
				recentSignups: Array<{
					orgId: string;
					orgName: string;
					createdAt: string;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Revenue Aggregator types (Plan F.2 — Agent V).
export const platformAdminRevenueRouterType = {
	getKpis: protectedProcedure
		.input(z.object({}).default({}))
		.handler(
			(): {
				mrr: { cents: number; estimateAvailable: boolean };
				arr: { cents: number; estimateAvailable: boolean };
				activeSubsCount: number;
				trialingSubsCount: number;
				cancelledLast30d: number;
				churnRatePct: number;
				newMrrLast30dCents: number;
				churnedMrrLast30dCents: number;
				netNewMrrLast30dCents: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getCohortRetention: protectedProcedure
		.input(
			z.object({
				monthsBack: z.number().int().min(3).max(24).default(12),
			}),
		)
		.handler(
			(): {
				cohorts: Array<{
					cohortMonth: string;
					cohortSize: number;
					retained: number[];
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getRecentChurn: protectedProcedure
		.input(
			z.object({
				days: z.number().int().min(7).max(180).default(30),
			}),
		)
		.handler(
			(): {
				events: Array<{
					orgId: string;
					orgName: string;
					tier: string;
					mrrCentsLost: number;
					canceledAt: string;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Comms router types (Plan F.2.5 — Agent C).
// Outbox + reusable template library. Mounted as top-level namespace
// `platformAdminComms`, distinct from `platformAdminTenants.*Comms*`
// (Plan E.5 per-tenant send procs which remain unchanged).
const platformAdminCommsRouterType = {
	listOutbox: protectedProcedure
		.input(
			z.object({
				kind: z.enum(["direct_message", "announcement"]).optional(),
				actorUserId: z.string().optional(),
				targetOrgId: z.string().uuid().optional(),
				days: z.number().int().positive().max(365).default(90),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(200).default(50),
			}),
		)
		.handler(
			(): {
				rows: Array<{
					id: string;
					kind: "direct_message" | "announcement";
					actionType: string;
					actor: {
						id: string;
						name: string | null;
						email: string | null;
					} | null;
					targetOrg: { id: string; name: string } | null;
					subject: string;
					metadata: unknown;
					sentAt: Date;
				}>;
				total: number;
				page: number;
				limit: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	listTemplates: protectedProcedure
		.input(
			z.object({
				kind: z.enum(["direct_message", "announcement"]).optional(),
				includeArchived: z.boolean().default(false),
			}),
		)
		.handler(
			(): {
				templates: Array<{
					id: string;
					name: string;
					subject: string;
					bodyMarkdown: string;
					kind: string;
					priority: string | null;
					targetAudience: string | null;
					createdByUserId: string;
					createdAt: Date;
					updatedAt: Date;
					archivedAt: Date | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getTemplate: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(
			(): {
				template: {
					id: string;
					name: string;
					subject: string;
					bodyMarkdown: string;
					kind: string;
					priority: string | null;
					targetAudience: string | null;
					createdByUserId: string;
					createdAt: Date;
					updatedAt: Date;
					archivedAt: Date | null;
				} | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	createTemplate: protectedProcedure
		.input(
			z.object({
				name: z.string().trim().min(1).max(200),
				subject: z.string().trim().min(1).max(200),
				bodyMarkdown: z.string().trim().min(1).max(20000),
				kind: z.enum(["direct_message", "announcement"]),
				priority: z.enum(["info", "warning", "critical"]).optional(),
				targetAudience: z.enum(["all", "staff", "clients"]).optional(),
			}),
		)
		.handler(
			(): {
				ok: true;
				template: {
					id: string;
					name: string;
					subject: string;
					bodyMarkdown: string;
					kind: string;
					priority: string | null;
					targetAudience: string | null;
					createdByUserId: string;
					createdAt: Date;
					updatedAt: Date;
					archivedAt: Date | null;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	updateTemplate: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).max(200).optional(),
				subject: z.string().trim().min(1).max(200).optional(),
				bodyMarkdown: z.string().trim().min(1).max(20000).optional(),
				priority: z.enum(["info", "warning", "critical"]).optional().nullable(),
				targetAudience: z.enum(["all", "staff", "clients"]).optional().nullable(),
			}),
		)
		.handler(
			(): {
				ok: true;
				template: {
					id: string;
					name: string;
					subject: string;
					bodyMarkdown: string;
					kind: string;
					priority: string | null;
					targetAudience: string | null;
					createdByUserId: string;
					createdAt: Date;
					updatedAt: Date;
					archivedAt: Date | null;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	archiveTemplate: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(
			(): {
				ok: true;
				template: {
					id: string;
					archivedAt: Date | null;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	unarchiveTemplate: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(
			(): {
				ok: true;
				template: {
					id: string;
					archivedAt: Date | null;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Deletion / Export types (Plan E E.8).
const platformAdminTenantsDeletionRouterType = {
	requestTenantExport: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				exportedAt: string;
				organizationId: string;
				tableCount: number;
				totalRows: number;
				dataUrlPreviewLength: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	requestTenantDeletion: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				captureExport: z.boolean().default(false),
			}),
		)
		.handler(
			(): {
				ok: true;
				tenantDeletionId: string;
				hardDeleteAfter: Date;
				exportCaptured: boolean;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	restoreTenantDeletion: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler((): { ok: true; tenantDeletionId: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	listTenantDeletions: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid().optional(),
				onlyOpen: z.boolean().default(false),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(
			(): {
				total: number;
				page: number;
				limit: number;
				deletions: Array<{
					id: string;
					organizationId: string;
					organizationName: string | null;
					organizationSlug: string | null;
					requestedAt: Date | null;
					requestedBy: string;
					hardDeleteAfter: Date;
					restoredAt: Date | null;
					hardDeletedAt: Date | null;
					hasExportUrl: boolean;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	runHardDeleteSweeperNow: protectedProcedure.handler(
		(): {
			scanned: number;
			deleted: number;
			errors: Array<{ organizationId: string; error: string }>;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
};

// GHL router type definition for client type inference.
// The actual implementation is in apps/server/src/routers/ghl.ts
// (server-only: uses encrypted API key, Neon control panel DB).
const ghlRouterType = {
	connectBranch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				tenantBranchId: z.string().uuid(),
				ghlLocationId: z.string().min(1),
				ghlApiKey: z.string().min(10),
				existingBranchCustomFieldId: z
					.string()
					.trim()
					.min(1)
					.optional()
					.nullable(),
			}),
		)
		.handler((): { status: "connected" } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	disconnectBranch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				tenantBranchId: z.string().uuid(),
			}),
		)
		.handler((): { status: "disconnected" } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	listBranchLinks: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): Array<{
				id: string;
				tenantBranchId: string;
				ghlLocationId: string;
				existingBranchCustomFieldId: string | null;
				isActive: boolean;
				createdAt: Date;
				updatedAt: Date;
				errorCount: number;
			}> => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	retryFailedSyncs: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				tenantBranchId: z.string().uuid(),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.handler(
			(): {
				attempted: number;
				recovered: number;
				stillFailing: number;
				cappedAt: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	// Phase G.2: Org-shared GHL connection (one GHL sub-account per org)
	connectOrgShared: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				ghlLocationId: z.string().min(1),
				ghlApiKey: z.string().min(10),
			}),
		)
		.handler((): { status: "connected" } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	disconnectOrgShared: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler((): { status: "disconnected" } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	getOrgShared: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				ghlLocationId: string | null;
				ghlSyncModel: string | null;
				ghlProvisionedAt: Date | null;
				hasApiKey: boolean;
				countryFieldCount: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Coupons types (Plan F.3.5 — Agent C2).
// Stripe-backed coupon catalog + per-tenant attach/remove. Audit actions
// `coupon_create` / `coupon_delete` / `coupon_apply` / `coupon_remove`.
export const platformAdminCouponsRouterType = {
	listCoupons: protectedProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(50),
				startingAfter: z.string().optional(),
			}),
		)
		.handler(
			(): {
				coupons: Array<{
					id: string;
					name: string | null;
					percentOff: number | null;
					amountOff: number | null;
					currency: string | null;
					duration: "once" | "repeating" | "forever";
					durationInMonths: number | null;
					maxRedemptions: number | null;
					timesRedeemed: number;
					valid: boolean;
					createdAt: Date;
				}>;
				hasMore: boolean;
				nextCursor: string | undefined;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	createCoupon: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				discountKind: z.enum(["percent", "amount"]),
				percentOff: z.number().min(1).max(100).optional(),
				amountOffCents: z.number().int().min(1).optional(),
				currency: z.string().length(3).default("usd"),
				duration: z.enum(["once", "repeating", "forever"]),
				durationInMonths: z.number().int().min(1).max(60).optional(),
				maxRedemptions: z.number().int().min(1).optional(),
			}),
		)
		.handler(
			(): { couponId: string; name: string; valid: boolean } => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	deleteCoupon: protectedProcedure
		.input(z.object({ couponId: z.string().min(1) }))
		.handler((): { ok: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	applyCoupon: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				couponId: z.string().min(1),
				notes: z.string().max(1000).optional(),
			}),
		)
		.handler(
			(): { ok: true; couponId: string; customerId: string } => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	removeCoupon: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler((): { ok: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	getCustomerCoupon: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				coupon: {
					id: string;
					name: string | null;
					percentOff: number | null;
					amountOff: number | null;
					currency: string | null;
					duration: "once" | "repeating" | "forever";
					durationInMonths: number | null;
					maxRedemptions: number | null;
					timesRedeemed: number;
					valid: boolean;
					createdAt: Date;
				} | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Global Billing aggregator types (Plan F.3.5 — Agent G).
// TOP-LEVEL router (NOT under platformAdminTenants). Read-only aggregate
// across all tenants. Live Stripe reads per ADR-0033.
export const platformAdminBillingRouterType = {
	getOverview: protectedProcedure
		.input(z.object({}).default({}))
		.handler(
			(): {
				kpis: {
					activeSubsCount: number;
					mrr: { cents: number; estimateAvailable: boolean };
					refundsLast30dCount: number;
					refundsLast30dAmountCents: number;
					couponsCount: number;
				};
				recentInvoices: Array<{
					orgId: string;
					orgName: string;
					invoiceId: string;
					invoiceNumber: string | null;
					amountPaid: number;
					status: string | null;
					currency: string;
					createdAt: Date;
				}>;
				recentRefunds: Array<{
					refundId: string;
					orgId: string;
					orgName: string;
					amountCents: number;
					reason: string;
					refundedAt: Date;
					actorEmail: string | null;
				}>;
				activeCoupons: Array<{
					id: string;
					name: string | null;
					percentOff: number | null;
					amountOff: number | null;
					currency: string | null;
					duration: "once" | "repeating" | "forever";
					timesRedeemed: number;
					valid: boolean;
					createdAt: Date;
				}>;
				stripeAvailable: boolean;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	listInvoicesCrossTenant: protectedProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(50),
				days: z.number().int().min(7).max(180).default(30),
			}),
		)
		.handler(
			(): {
				invoices: Array<{
					orgId: string;
					orgName: string;
					invoiceId: string;
					invoiceNumber: string | null;
					amountPaid: number;
					status: string | null;
					currency: string;
					createdAt: Date;
				}>;
				stripeAvailable: boolean;
			} => {
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
	// Extend customerProfiles router with server-specific softDelete procedure type
	customerProfiles: {
		...customerProfilesRouter,
		...serverCustomerProfilesRouterType,
	},
	admin: adminRouterType,
	tenantAdmin: tenantAdminRouterType,
	ghl: ghlRouterType,
	subscriptions: subscriptionsRouterType,
	stripeConnect: stripeConnectRouterType,
	payments: paymentsRouterType,
	platformAdminPayments: platformAdminPaymentsRouterType,
	platformAdminTenants: {
		...platformAdminTenantsRouterType,
		...platformAdminTenantsUsageTypes,
		...platformAdminTenantsLifecycleTypes,
		...platformAdminTenantsFunnelTypes,
		...platformAdminTenantsCommsTypes,
		...platformAdminTenantsProvisionRouterType,
		...platformAdminTenantsDeletionRouterType,
		notes: platformAdminTenantsNotesRouterType,
		tags: platformAdminTenantsTagsRouterType,
		search: platformAdminTenantsSearchRouterType,
		health: platformAdminTenantsHealthRouterType,
		billing: platformAdminTenantsBillingRouterType,
	},
	platformAdminAudit: platformAdminAuditRouterType,
	platformAdminDashboard: platformAdminDashboardRouterType,
	platformAdminRevenue: platformAdminRevenueRouterType,
	platformAdminComms: platformAdminCommsRouterType,
	platformAdminCoupons: platformAdminCouponsRouterType,
	platformAdminBilling: platformAdminBillingRouterType,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
