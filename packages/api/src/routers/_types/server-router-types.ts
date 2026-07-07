/**
 * Server-only router type stubs for client inference (Plan D.2.1).
 * Implementations live in apps/server/src/routers/.
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../index";

// Auth router type definition for client type inference
// The actual implementation is in apps/server/src/routers/auth.ts
// This dummy implementation is only for type generation
export const authRouterType = {
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
			/** True when the caller is a platform admin (any role). */
			isSystemAdmin: boolean;
			organizations: Array<{
				id: string;
				name: string;
				slug: string;
				role: string;
				/** Flat "resource:action" strings the member's role grants in this org. */
				permissions: string[];
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
	// Set a password for an account that has none yet (post magic-link claim).
	setPassword: protectedProcedure
		.input(z.object({ newPassword: z.string().min(8) }))
		.handler((): { success: boolean; alreadySet: boolean } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Server-specific invitation procedures type definition for client type inference
// The actual implementation is in apps/server/src/routers/invitations.ts
export const serverInvitationRouterType = {
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
				/** Best-effort GHL staff sync result — may be absent if GHL not configured. */
				ghlSync?: {
					status: "synced" | "skipped" | "error";
					reason?: string;
					ghlUserId?: string;
					error?: string;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Admin router type definition for client type inference
// The actual implementation is in apps/server/src/routers/admin.ts
export const adminRouterType = {
	// ── New Phase 2 procedures ─────────────────────────────────────────────────

	/** Returns platform admin status for the current caller. Safe for any authenticated user. */
	me: protectedProcedure.handler(
		():
			| { isPlatformAdmin: false; role: null }
			| {
					isPlatformAdmin: true;
					role: "super_admin" | "support" | "billing";
			  } => {
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
		.handler(
			(): { success: true; role: "super_admin" | "support" | "billing" } => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

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
export const tenantAdminRouterType = {
	/** Impersonate a staff member in the caller's own organization. */
	impersonateMember: protectedProcedure
		.input(
			z.object({
				targetMemberId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
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
		.handler((): { success: true; redirectTo: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Server-side customerProfiles overrides type definition for client type inference.
// The actual implementation is in apps/server/src/routers/customer-profiles.ts
// (server-only: imports fireCustomerSync which requires server-only GHL deps).
export const serverCustomerProfilesRouterType = {
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
				ghlSync: {
					status: "synced" | "skipped" | "error";
					ghlContactId?: string;
					error?: string;
					reason?: string;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	// Phase 4 — staff backfill: replace placeholder email + dispatch magic-link
	addEmailAndDispatchMagicLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
				email: z.string().email(),
			}),
		)
		.handler((): { success: boolean; email: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	// Phase 4 — generic magic-link resend for an existing customer
	resendMagicLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler((): { success: boolean; email: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	// Quick Add — staff creates a customer profile without an email/account
	createUnclaimed: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				firstName: z.string().min(1),
				lastName: z.string().min(1),
				phone: z.string().min(1),
				email: z.string().email().optional(),
				hierarchyScopeId: z.string().uuid(),
				dateOfBirth: z.string().optional(),
				notes: z.string().optional(),
				// Optional full onboarding profile ("Full details" mode) — when all
				// present, the customer is created registration-complete (role "user").
				idPassportNo: z.string().optional(),
				addressType: z.enum(["home", "work"]).optional(),
				streetAddress: z.string().optional(),
				city: z.string().optional(),
				state: z.string().optional(),
				country: z.string().optional(),
				postalCode: z.string().optional(),
				emergencyContactName: z.string().optional(),
				emergencyContactRelationship: z.string().optional(),
				emergencyContactPhone: z.string().optional(),
			}),
		)
		.handler((): { memberId: string; profileId: string; userId: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	// Send a magic-link claim email to an unclaimed customer
	sendClaimLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
				email: z.string().email(),
			}),
		)
		.handler((): { success: boolean; email: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	// Change the display name on a customer's control-panel user account
	updateName: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
				newName: z.string().min(1).max(120),
			}),
		)
		.handler((): { ok: boolean; name: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	// Change the email address on a customer's control-panel user account
	updateEmail: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
				newEmail: z.string().email(),
			}),
		)
		.handler((): { ok: boolean; email: string; verificationSent?: boolean } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Subscriptions router type definition for client type inference.
// The actual implementation is in apps/server/src/routers/subscriptions.ts
// (server-only: uses Stripe SDK, Neon control panel DB).
export const subscriptionsRouterType = {
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
				/** Access decision from subscription gate evaluation. */
				decision: string;
				/** Optional banner message for UI display (e.g. trial ending soon). */
				banner: string | null;
				/** Reason access was blocked; null when decision === "allow". */
				blockedReason: string | null;
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
export const paymentsRouterType = {
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

	// POS online checkout — deactivate the link after a sale is cancelled
	deactivateSalesOrderPaymentLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				deactivated: boolean;
				paymentLinkId?: string;
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

	// Phase E1 — per-installment Stripe payment link
	createInstallmentPaymentLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				installmentId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				url: string;
				paymentLinkId: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	// Phase E2 — hosted Checkout Session in setup mode to save card for auto-charge
	createCardSetupSession: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				url: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Stripe Connect router type definition for client type inference.
// Real impl in apps/server/src/routers/stripe-connect.ts (uses Stripe SDK).
export const stripeConnectRouterType = {
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
export const platformAdminPaymentsRouterType = {
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
export const platformAdminAuditRouterType = {
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
	listActionTypes: protectedProcedure.handler((): { actionTypes: string[] } => {
		throw new Error("Not implemented - this is only for type inference");
	}),
};

// Platform Admin — Tenants router types (Plan E E.1).
export const platformAdminTenantsRouterType = {
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
export const platformAdminTenantsCommsTypes = {
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
				priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
				targetAudience: z.enum(["all", "staff", "clients"]).default("all"),
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
export const platformAdminTenantsFunnelTypes = {
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
export const platformAdminTenantsLifecycleTypes = {
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
export const platformAdminTenantsUsageTypes = {
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
export const platformAdminTenantsProvisionRouterType = {
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
export const platformAdminTenantsNotesRouterType = {
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

// Platform Admin — Tenant Members types (Plan F.4 Agent Mb).
export const platformAdminTenantsMembersRouterType = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				search: z.string().trim().optional(),
				role: z.string().trim().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.handler(
			(): {
				rows: Array<{
					id: string;
					userId: string;
					name: string | null;
					email: string | null;
					role: string;
					hierarchyScopeId: string;
					hierarchyScopeName: string | null;
					joinedAt: Date | null;
					lastLoginAt: Date | null;
					status: string;
				}>;
				total: number;
				page: number;
				limit: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getCounts: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				totalMembers: number;
				byRole: Array<{ role: string; count: number }>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Tenant Feature Flags types (Plan F.4 Agent Ff + F.6 Agent Fo).
type _FeatureKey =
	| "ghl"
	| "googleCalendar"
	| "commissionSplits"
	| "memberships"
	| "apiAccess";
type _OverrideMetadata = {
	enabled: boolean;
	setByUserId: string;
	setByEmail: string | null;
	notes: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};
const _featureKeyZ = z.enum([
	"ghl",
	"googleCalendar",
	"commissionSplits",
	"memberships",
	"apiAccess",
]);
export const platformAdminTenantsFeatureFlagsRouterType = {
	get: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				organizationId: string;
				tier: "basic" | "professional" | "enterprise";
				features: Record<_FeatureKey, boolean>;
				tierLimits: {
					organizations: number;
					locations: number;
					members: number;
					customers: number;
					monthlyTxns: number;
					appFeeBps: number;
					analyticsLevel: "basic" | "advanced";
					auditLogDays: number;
				};
				overrides: Partial<Record<_FeatureKey, _OverrideMetadata>>;
				source: "tier_default" | "mixed";
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	listOverrides: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				overrides: Array<{
					featureKey: string;
					enabled: boolean;
					setByUserId: string;
					setByEmail: string | null;
					notes: string | null;
					createdAt: string | null;
					updatedAt: string | null;
				}>;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	setOverride: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				featureKey: _featureKeyZ,
				enabled: z.boolean(),
				notes: z.string().max(1000).optional(),
			}),
		)
		.handler((): { ok: true; featureKey: _FeatureKey; enabled: boolean } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	clearOverride: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				featureKey: _featureKeyZ,
			}),
		)
		.handler((): { ok: true } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Platform Admin — Tenant Tags + Bulk Ops types (Plan F.1).
export const platformAdminTenantsTagsRouterType = {
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
export const platformAdminTenantsSearchRouterType = {
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
				riskFlags: Array<{
					code: string;
					severity: "info" | "warn" | "critical";
					observedAt: string;
				}> | null;
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
	getOverview: protectedProcedure.input(z.object({}).default({})).handler(
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
	getKpis: protectedProcedure.input(z.object({}).default({})).handler(
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
export const platformAdminCommsRouterType = {
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
				targetAudience: z
					.enum(["all", "staff", "clients"])
					.optional()
					.nullable(),
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
export const platformAdminTenantsDeletionRouterType = {
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
export const ghlRouterType = {
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
				ghlRequireApproval: boolean;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	// ── Inbound approval gate (Phase G follow-up) ──────────────────────────
	listPendingContacts: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): Array<{
				id: string;
				ghlContactId: string;
				proposedName: string | null;
				proposedEmail: string | null;
				proposedPhone: string | null;
				resolvedBranchNodeId: string | null;
				status: string;
				createdAt: Date;
			}> => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	approvePendingContact: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				pendingId: z.string().uuid(),
			}),
		)
		.handler(
			(): {
				status: "approved";
				contactId: string;
				message: string;
				// Onboarding hand-off context for the approval-queue UI
				customerProfileId: string | null;
				email: string;
				emailIsPlaceholder: boolean;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	rejectPendingContact: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				pendingId: z.string().uuid(),
				reason: z.string().trim().max(500).optional(),
			}),
		)
		.handler((): { status: "rejected"; contactId: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	setApprovalGate: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				enabled: z.boolean(),
			}),
		)
		.handler((): { status: "ok"; enabled: boolean } => {
			throw new Error("Not implemented - this is only for type inference");
		}),

	// Onboarding hand-off (post-approval) — durable approved-row lifecycle.
	listApprovedContacts: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): Array<{
				id: string;
				proposedName: string | null;
				proposedEmail: string | null;
				proposedPhone: string | null;
				resolvedBranchNodeId: string | null;
				reviewedAt: Date | null;
				onboardingLinkSentAt: Date | null;
				hasLinkedUser: boolean;
				emailIsPlaceholder: boolean;
				registered: boolean;
			}> => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),

	sendOnboardingLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				pendingId: z.string().uuid(),
			}),
		)
		.handler((): { success: boolean; email: string; sentAt: Date } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
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
		.handler((): { couponId: string; name: string; valid: boolean } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
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
		.handler((): { ok: true; couponId: string; customerId: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
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
	getOverview: protectedProcedure.input(z.object({}).default({})).handler(
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

// Platform Admin — Renewals Calendar types (Plan F.4 — Agent Re).
export const platformAdminRenewalsRouterType = {
	getCalendar: protectedProcedure
		.input(
			z.object({
				daysAhead: z.number().int().min(7).max(180).default(90),
			}),
		)
		.handler(
			(): {
				weeks: Array<{
					weekStartISO: string;
					weekEndISO: string;
					renewals: Array<{
						orgId: string;
						orgName: string;
						tier: string;
						mrrCents: number;
						currentPeriodEnd: string;
						status: string;
						cancelAtPeriodEnd: boolean;
						daysUntil: number;
					}>;
					totalMrrAtRiskCents: number;
					totalMrrPassingCents: number;
				}>;
				pastDue: Array<{
					orgId: string;
					orgName: string;
					tier: string;
					mrrCents: number;
					currentPeriodEnd: string;
					status: string;
				}>;
				summary: {
					totalRenewalsInWindow: number;
					totalMrrAtRiskCents: number;
					totalMrrPassingCents: number;
					pastDueCount: number;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Health Scoreboard types (Plan F.4 — Agent He).
// Cross-tenant aggregator: histogram, top at-risk, flag rollup, 30-day trend.
export const platformAdminHealthRouterType = {
	getScoreboard: protectedProcedure
		.input(
			z.object({
				topAtRiskLimit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.handler(
			(): {
				histogram: {
					bands: Array<{
						label: string;
						min: number;
						max: number;
						count: number;
						color: "red" | "amber" | "green";
					}>;
					totalScoredOrgs: number;
					unscoredOrgs: number;
				};
				topAtRisk: Array<{
					orgId: string;
					orgName: string;
					healthScore: number;
					criticalFlagCount: number;
					snapshotDate: string;
				}>;
				flagRollup: Array<{
					flagCode: string;
					severity: "info" | "warn" | "critical";
					count: number;
					uniqueOrgs: number;
				}>;
				trend: {
					avgScoreLast30dByDay: Array<{
						date: string;
						avgScore: number;
						sampleSize: number;
					}>;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Webhooks Log types (Plan F.4 — Agent Wh).
// Read-only view over processed_webhook_events (Stripe dedupe table).
export const platformAdminWebhooksRouterType = {
	getOverview: protectedProcedure.input(z.object({}).default({})).handler(
		(): {
			kpis: {
				totalLast24h: number;
				totalLast7d: number;
				duplicatesLast7d: number;
				uniqueEventTypes: number;
				successesLast7d: number;
				failuresLast7d: number;
			};
			byEventType: Array<{
				eventType: string;
				count: number;
				lastSeenAt: string;
			}>;
			recent: Array<{
				id: string;
				eventId: string;
				eventType: string;
				source: string;
				receivedAt: string;
				processedAt: string | null;
				attempts: number;
				status: "succeeded" | "failed" | "pending";
				error: string | null;
			}>;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		},
	),
	listEvents: protectedProcedure
		.input(
			z.object({
				eventType: z.string().optional(),
				days: z.number().int().min(1).max(90).default(7),
				limit: z.number().int().min(1).max(200).default(50),
				page: z.number().int().min(1).default(1),
			}),
		)
		.handler(
			(): {
				rows: Array<{
					id: string;
					eventId: string;
					eventType: string;
					source: string;
					receivedAt: string;
					processedAt: string | null;
					attempts: number;
					status: "succeeded" | "failed" | "pending";
					error: string | null;
				}>;
				total: number;
				page: number;
				limit: number;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
};

// Platform Admin — Migrations Viewer types (Plan F.4 — Agent Mi).
// READ-ONLY journal + applied + status view over drizzle migration manifests.
export const platformAdminMigrationsRouterType = {
	listMigrations: protectedProcedure
		.input(
			z.object({
				schema: z.enum(["control-panel", "tenant"]).default("control-panel"),
			}),
		)
		.handler(
			(): {
				schema: "control-panel" | "tenant";
				journal: Array<{ idx: number; tag: string; whenISO: string }>;
				applied: Array<{
					hash: string;
					createdAtISO: string;
					tag?: string;
				}>;
				status: Array<{
					idx: number;
					tag: string;
					inJournal: boolean;
					appliedInDb: boolean;
					state: "applied" | "pending" | "orphaned";
				}>;
				summary: {
					journalCount: number;
					appliedCount: number;
					pendingCount: number;
					orphanedCount: number;
				};
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	getMigrationFile: protectedProcedure
		.input(
			z.object({
				schema: z.enum(["control-panel", "tenant"]).default("control-panel"),
				tag: z.string(),
			}),
		)
		.handler((): { sql: string; tag: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

/**
 * Type-only twin of the server emailDomains router. Lets the web client
 * infer types for client.emailDomains.* without depending on apps/server.
 *
 * Exported so rolldown-dts can name it in the generated client.d.ts — an
 * unexported handler return type triggers TS4058 ("cannot be named") on build.
 */
export interface EmailDomainRow {
	id: string;
	organizationId: string;
	/** "resend" (legacy) or "cloudflare". Dispatch/display branch on this. */
	provider: string;
	/** Null for Cloudflare rows (their identity is cfSubdomainId). */
	resendDomainId: string | null;
	cfZoneId: string | null;
	cfSubdomainId: string | null;
	/** "default" | "delegated" | "bare" (Cloudflare), null for Resend rows. */
	onboardingTier: string | null;
	domain: string;
	fromName: string;
	defaultLocalPart: string | null;
	status: string;
	dnsRecords: unknown;
	verifiedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

const RESEND_REGIONS_TYPE = [
	"us-east-1",
	"eu-west-1",
	"sa-east-1",
	"ap-northeast-1",
] as const;

export const emailDomainsRouterType = {
	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				domain: z.string().min(3).max(253),
				fromName: z.string().min(1).max(100),
				defaultLocalPart: z.string().optional(),
				region: z.enum(RESEND_REGIONS_TYPE).optional(),
			}),
		)
		.handler((): EmailDomainRow => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				fromName: z.string().min(1).max(100).optional(),
				defaultLocalPart: z.string().nullable().optional(),
			}),
		)
		.handler((): EmailDomainRow => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler((): EmailDomainRow[] => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	get: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				refresh: z.boolean().optional(),
			}),
		)
		.handler((): EmailDomainRow => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	verify: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler((): EmailDomainRow => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	delete: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler((): { deleted: true; id: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	sendTest: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				to: z.string().email().optional(),
				aliasLabel: z.string().optional(),
			}),
		)
		.handler(
			(): {
				sent: true;
				to: string;
				fromAddress: string;
				messageId: string;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	listAliases: protectedProcedure
		.input(
			z.object({
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(
			(): Array<{
				id: string;
				emailDomainId: string;
				localPart: string;
				label: string | null;
				createdAt: Date;
				updatedAt: Date;
			}> => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	addAlias: protectedProcedure
		.input(
			z.object({
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
				localPart: z.string(),
				label: z.string().optional(),
			}),
		)
		.handler(
			(): {
				id: string;
				emailDomainId: string;
				localPart: string;
				label: string | null;
				createdAt: Date;
				updatedAt: Date;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	removeAlias: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler((): { deleted: true; id: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	getNotificationRouting: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(
			(): {
				routes: Array<{
					id: string;
					organizationId: string;
					notificationType: string;
					aliasId: string | null;
					fromNameOverride: string | null;
					subjectOverride: string | null;
					createdAt: Date;
					updatedAt: Date;
					aliasLocalPart: string | null;
					aliasLabel: string | null;
				}>;
				aliases: Array<{ id: string; localPart: string; label: string | null }>;
				verifiedDomain: {
					id: string;
					domain: string;
					fromName: string;
					defaultLocalPart: string | null;
				} | null;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	upsertNotificationRoute: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				notificationType: z.enum([
					"member_invitation",
					"payment_receipt",
					"auth_verification",
					"auth_password_reset",
					"auth_magic_link",
				]),
				aliasId: z.string().uuid().nullable().optional(),
				fromNameOverride: z.string().nullable().optional(),
				subjectOverride: z.string().nullable().optional(),
			}),
		)
		.handler(
			(): {
				id: string;
				organizationId: string;
				notificationType: string;
				aliasId: string | null;
				fromNameOverride: string | null;
				subjectOverride: string | null;
				createdAt: Date;
				updatedAt: Date;
			} => {
				throw new Error("Not implemented - this is only for type inference");
			},
		),
	deleteNotificationRoute: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				notificationType: z.enum([
					"member_invitation",
					"payment_receipt",
					"auth_verification",
					"auth_password_reset",
					"auth_magic_link",
				]),
			}),
		)
		.handler((): { deleted: true; notificationType: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};
