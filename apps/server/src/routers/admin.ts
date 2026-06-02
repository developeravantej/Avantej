/**
 * Admin Router
 *
 * API endpoints for platform administrators to manage tenants, view statistics,
 * and perform impersonation for support purposes.
 *
 * All procedures that require elevated access are gated behind requirePlatformAdmin(),
 * which checks the platform_admins table. A subset of procedures (impersonation) further
 * restricts to super_admin / support roles.
 */

import { eq, and, or, like, count, desc, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { requirePlatformAdmin, adminProcedure } from "@/lib/admin-procedure";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { adminSessions } from "@avantej-core/db/schema/control-panel/admin-sessions";
import { user } from "@avantej-core/db/schema/auth";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import {
	getPlatformAdmin,
	syncUserRole,
	getFirstActiveOrgForUser,
} from "@/services/admin.service";
import { getBetterAuth } from "@/lib/better-auth";

export const adminRouter = {
	/**
	 * Return platform admin status for the current caller.
	 * Safe to call for any authenticated user — returns false if not a platform admin.
	 */
	me: protectedProcedure.handler(async ({ context }) => {
		if (!context.session?.user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Authentication required",
			});
		}

		const controlPanelDb = context.honoContext?.get("controlPanelDb") as
			| NeonDatabase<typeof controlPanelSchema>
			| undefined;

		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Control panel database not available",
			});
		}

		const adminRecord = await getPlatformAdmin(
			controlPanelDb,
			context.session.user.id,
		);

		if (!adminRecord) {
			return { isPlatformAdmin: false as const, role: null };
		}

		return {
			isPlatformAdmin: true as const,
			role: adminRecord.role as "super_admin" | "support" | "billing",
		};
	}),

	/**
	 * Paginated, searchable user list — any platform admin role.
	 */
	listUsers: adminProcedure
		.input(
			z.object({
				search: z.string().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			const conditions = [];
			if (input.search) {
				conditions.push(
					or(
						like(user.email, `%${input.search}%`),
						like(user.firstName, `%${input.search}%`),
						like(user.lastName, `%${input.search}%`),
						like(user.name, `%${input.search}%`),
					),
				);
			}

			const whereClause =
				conditions.length > 0 ? and(...conditions) : undefined;

			const totalResult = await controlPanelDb
				.select({ count: count() })
				.from(user)
				.where(whereClause);

			const totalItems = Number(totalResult[0]?.count ?? 0);
			const totalPages = Math.ceil(totalItems / input.limit);
			const offset = (input.page - 1) * input.limit;

			const users = await controlPanelDb
				.select({
					id: user.id,
					email: user.email,
					firstName: user.firstName,
					lastName: user.lastName,
					name: user.name,
					lastLoginAt: user.lastLoginAt,
					createdAt: user.createdAt,
				})
				.from(user)
				.where(whereClause)
				.orderBy(desc(user.createdAt))
				.limit(input.limit)
				.offset(offset);

			// Enrich with platform admin info in a single query
			const adminRows = await controlPanelDb.query.platformAdmins.findMany();
			const adminMap = new Map(adminRows.map((a) => [a.userId, a.role]));

			const data = users.map((u) => ({
				id: u.id,
				email: u.email,
				firstName: u.firstName,
				lastName: u.lastName,
				name: u.name,
				lastLoginAt: u.lastLoginAt,
				isPlatformAdmin: adminMap.has(u.id),
				platformAdminRole: adminMap.get(u.id) ?? null,
			}));

			return {
				data,
				pagination: {
					currentPage: input.page,
					totalPages,
					pageSize: input.limit,
					totalItems,
				},
			};
		}),

	/**
	 * List all platform_admins rows — super_admin only.
	 */
	listAdmins: protectedProcedure
		.use(requirePlatformAdmin(["super_admin"]))
		.handler(async ({ context }) => {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			const admins = await controlPanelDb.query.platformAdmins.findMany();

			// Enrich with user info
			const enriched = await Promise.all(
				admins.map(async (admin) => {
					const adminUser = await controlPanelDb.query.user.findFirst({
						where: eq(user.id, admin.userId),
					});

					let grantedByEmail: string | null = null;
					if (admin.grantedBy) {
						const grantor = await controlPanelDb.query.user.findFirst({
							where: eq(user.id, admin.grantedBy),
						});
						grantedByEmail = grantor?.email ?? null;
					}

					return {
						userId: admin.userId,
						email: adminUser?.email ?? null,
						name: adminUser?.name ?? null,
						role: admin.role as "super_admin" | "support" | "billing",
						grantedAt: admin.grantedAt,
						grantedByEmail,
					};
				}),
			);

			return enriched;
		}),

	/**
	 * Start impersonating a user as a platform admin.
	 * Only super_admin and support roles may impersonate.
	 * Writes an audit row to admin_sessions.
	 */
	impersonateUser: protectedProcedure
		.use(requirePlatformAdmin(["super_admin", "support"]))
		.input(z.object({ userId: z.string().min(1).max(64) }))
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}

			// Prevent self-impersonation
			if (input.userId === context.session.user.id) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot impersonate yourself",
				});
			}

			// Prevent nested impersonation
			const rawSession = context.session as {
				session?: { impersonatedBy?: string | null };
			};
			if (rawSession.session?.impersonatedBy) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Already impersonating another user. Stop the current impersonation first.",
				});
			}

			const cph = context.honoContext;
			const controlPanelDb = cph?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			// Check target is not a platform admin
			const targetAdminRecord = await getPlatformAdmin(
				controlPanelDb,
				input.userId,
			);
			if (targetAdminRecord) {
				throw new ORPCError("FORBIDDEN", {
					message: "Cannot impersonate platform admins",
				});
			}

			// Verify target user exists
			const targetUser = await controlPanelDb.query.user.findFirst({
				where: eq(user.id, input.userId),
			});
			if (!targetUser) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target user not found",
				});
			}

			// Build auth instance with request-scoped pool
			const auth = getBetterAuth(cph);

			// Forward the incoming admin session cookie so Better-Auth validates the caller
			const incomingHeaders = new Headers(cph!.req.raw.headers);

			// Call Better-Auth impersonateUser — returnHeaders: true so we get Set-Cookie back
			const result = await auth.api.impersonateUser({
				body: { userId: input.userId },
				headers: incomingHeaders,
				returnHeaders: true,
			});

			// Extract Set-Cookie from the returned headers
			let setCookies: string[] = [];
			if (result.headers) {
				// Standard way to get multiple Set-Cookie values
				if (typeof result.headers.getSetCookie === "function") {
					setCookies = result.headers.getSetCookie();
				} else {
					// Fallback: iterate entries
					for (const [key, value] of result.headers.entries()) {
						if (key.toLowerCase() === "set-cookie") {
							setCookies.push(value);
						}
					}
				}
			}

			// Stash cookies on Hono context for the index.ts wrapper to re-attach
			if (setCookies.length > 0) {
				cph!.set("__impersonationSetCookie__", setCookies);
			}

			// Session token from Better-Auth's new impersonation session
			const newSessionToken = result.response.session.token;

			// Determine the target's primary organization (deterministic: earliest active)
			const organizationId = await getFirstActiveOrgForUser(
				controlPanelDb,
				input.userId,
			);

			// Insert audit row — wrap in try/catch; rollback by stopping impersonation on failure
			try {
				await controlPanelDb.insert(adminSessions).values({
					adminUserId: context.session.user.id,
					impersonatedUserId: input.userId,
					organizationId: organizationId ?? undefined,
					sessionToken: newSessionToken,
				});
			} catch (auditError) {
				console.error(
					"Audit insert failed, rolling back impersonation:",
					auditError,
				);

				// Rollback: use the NEW impersonation cookie to call stopImpersonating
				try {
					const rollbackHeaders = new Headers();
					for (const cookie of setCookies) {
						rollbackHeaders.append("Set-Cookie", cookie);
					}
					// Build a cookie header string from the Set-Cookie values
					// Better-Auth needs the session cookie to know which session to stop
					const cookieHeader = setCookies
						.map((c) => c.split(";")[0])
						.join("; ");
					const rollbackRequestHeaders = new Headers();
					rollbackRequestHeaders.set("cookie", cookieHeader);
					await auth.api.stopImpersonating({
						headers: rollbackRequestHeaders,
					});
				} catch (rollbackError) {
					console.error("Rollback failed:", rollbackError);
				}

				// Clear the stashed cookies so the browser doesn't get the impersonation cookie
				cph!.set("__impersonationSetCookie__", []);

				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to record impersonation audit. Session rolled back.",
					cause: auditError,
				});
			}

			return {
				success: true as const,
				redirectTo: "/dashboard",
				impersonatedUserId: input.userId,
				organizationId,
			};
		}),

	/**
	 * Stop an active impersonation session and restore the original admin session.
	 * Callable while impersonating (uses protectedProcedure — no admin gate).
	 */
	stopImpersonating: protectedProcedure.handler(async ({ context }) => {
		if (!context.session?.user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Authentication required",
			});
		}

		// Verify we are actually impersonating
		const rawSession = context.session as {
			session?: { impersonatedBy?: string | null; token?: string };
		};

		if (!rawSession.session?.impersonatedBy) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Not currently impersonating",
			});
		}

		// Capture token before we stop (for audit update)
		const currentSessionToken = rawSession.session.token;

		const cph = context.honoContext;
		const controlPanelDb = cph?.get("controlPanelDb") as
			| NeonDatabase<typeof controlPanelSchema>
			| undefined;

		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Control panel database not available",
			});
		}

		const auth = getBetterAuth(cph);
		const incomingHeaders = new Headers(cph!.req.raw.headers);

		// Call Better-Auth to restore the original admin session
		const result = await auth.api.stopImpersonating({
			headers: incomingHeaders,
			returnHeaders: true,
		});

		// Extract and stash Set-Cookie for the index.ts wrapper
		let setCookies: string[] = [];
		if (result.headers) {
			if (typeof result.headers.getSetCookie === "function") {
				setCookies = result.headers.getSetCookie();
			} else {
				for (const [key, value] of result.headers.entries()) {
					if (key.toLowerCase() === "set-cookie") {
						setCookies.push(value);
					}
				}
			}
		}

		if (setCookies.length > 0) {
			cph!.set("__impersonationSetCookie__", setCookies);
		}

		// Close the audit row (if it exists — it's a no-op if 0 rows updated)
		if (currentSessionToken) {
			await controlPanelDb
				.update(adminSessions)
				.set({ endedAt: new Date() })
				.where(
					and(
						eq(adminSessions.sessionToken, currentSessionToken),
						isNull(adminSessions.endedAt),
					),
				);
		}

		return {
			success: true as const,
			redirectTo: "/dashboard/platform-admin/users",
		};
	}),

	/**
	 * Return whether the current session is an impersonation session, and of what type.
	 */
	getImpersonationStatus: protectedProcedure.handler(async ({ context }) => {
		if (!context.session?.user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Authentication required",
			});
		}

		const rawSession = context.session as {
			session?: { impersonatedBy?: string | null };
		};

		if (!rawSession.session?.impersonatedBy) {
			return { isImpersonating: false as const };
		}

		const originalAdminId = rawSession.session.impersonatedBy;

		const controlPanelDb = context.honoContext?.get("controlPanelDb") as
			| NeonDatabase<typeof controlPanelSchema>
			| undefined;

		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Control panel database not available",
			});
		}

		// Look up original admin user
		const adminUser = await controlPanelDb.query.user.findFirst({
			where: eq(user.id, originalAdminId),
		});

		// Determine type: platform if originalAdmin is in platform_admins
		const adminPlatformRecord = await getPlatformAdmin(
			controlPanelDb,
			originalAdminId,
		);
		const impersonationType = adminPlatformRecord ? "platform" : "tenant";

		// Current user is the impersonated user
		const impersonatedUser = context.session.user;

		return {
			isImpersonating: true as const,
			type: impersonationType as "platform" | "tenant",
			adminUser: {
				id: originalAdminId,
				email: adminUser?.email ?? null,
				name: adminUser?.name ?? null,
			},
			impersonatedUser: {
				id: impersonatedUser.id,
				email: impersonatedUser.email,
				name: impersonatedUser.name,
			},
		};
	}),

	/**
	 * Grant platform admin role to a user — super_admin only.
	 * Upserts into platform_admins and mirrors user.role via syncUserRole.
	 */
	grantPlatformAdmin: protectedProcedure
		.use(requirePlatformAdmin(["super_admin"]))
		.input(
			z.object({
				userId: z.string().min(1).max(64),
				role: z.enum(["super_admin", "support", "billing"]),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			// Verify target user exists
			const targetUser = await controlPanelDb.query.user.findFirst({
				where: eq(user.id, input.userId),
			});
			if (!targetUser) {
				throw new ORPCError("NOT_FOUND", { message: "User not found" });
			}

			// Upsert: allow role change via onConflictDoUpdate
			await controlPanelDb
				.insert(platformAdmins)
				.values({
					userId: input.userId,
					role: input.role,
					grantedBy: context.session!.user.id,
				})
				.onConflictDoUpdate({
					target: platformAdmins.userId,
					set: {
						role: input.role,
						grantedBy: context.session!.user.id,
						grantedAt: new Date(),
					},
				});

			// Mirror to user.role so Better-Auth admin plugin recognises the user
			await syncUserRole(controlPanelDb, input.userId);

			return { success: true as const, role: input.role };
		}),

	/**
	 * Revoke platform admin role — super_admin only.
	 * Cannot revoke your own role (prevents lockout).
	 */
	revokePlatformAdmin: protectedProcedure
		.use(requirePlatformAdmin(["super_admin"]))
		.input(z.object({ userId: z.string().min(1).max(64) }))
		.handler(async ({ input, context }) => {
			if (input.userId === context.session!.user.id) {
				throw new ORPCError("FORBIDDEN", {
					message: "Cannot revoke your own platform admin role",
				});
			}

			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			await controlPanelDb
				.delete(platformAdmins)
				.where(eq(platformAdmins.userId, input.userId));

			// Clear user.role so Better-Auth stops treating them as an admin
			await syncUserRole(controlPanelDb, input.userId);

			return { success: true as const };
		}),

	/**
	 * List all organizations with pagination and filters
	 */
	listTenants: adminProcedure
		.input(
			z.object({
				status: z.enum(["active", "suspended"]).optional(),
				search: z.string().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			// Build where conditions
			const conditions = [];
			if (input.status) {
				conditions.push(eq(organizations.paymentStatus, input.status));
			}
			if (input.search) {
				conditions.push(
					or(
						like(organizations.name, `%${input.search}%`),
						like(organizations.slug, `%${input.search}%`),
					),
				);
			}

			const whereClause =
				conditions.length > 0 ? and(...conditions) : undefined;

			// Get total count
			const totalResult = await controlPanelDb
				.select({ count: count() })
				.from(organizations)
				.where(whereClause);

			const totalItems = totalResult[0]?.count || 0;
			const totalPages = Math.ceil(totalItems / input.limit);
			const offset = (input.page - 1) * input.limit;

			// Get organizations with subscription info
			const orgs = await controlPanelDb.query.organizations.findMany({
				where: whereClause,
				limit: input.limit,
				offset,
				with: {
					subscription: true,
				},
				orderBy: (orgs, { desc }) => [desc(orgs.createdAt)],
			});

			// Get member counts for each organization
			const orgsWithMemberCounts = await Promise.all(
				orgs.map(async (org) => {
					// Count members in control panel registry
					const memberCountResult = await controlPanelDb
						.select({ count: count() })
						.from(organizationMembers)
						.where(eq(organizationMembers.organizationId, org.id));

					const memberCount = memberCountResult[0]?.count || 0;

					return {
						id: org.id,
						name: org.name,
						slug: org.slug,
						status: org.paymentStatus as "active" | "suspended",
						neonBranchId: org.neonProjectId,
						subscriptionId: org.subscriptionId,
						subscriptionTier: org.subscription?.tier as
							| "starter"
							| "professional"
							| "enterprise",
						memberCount,
						createdAt: org.createdAt,
					};
				}),
			);

			return {
				data: orgsWithMemberCounts,
				pagination: {
					currentPage: input.page,
					totalPages,
					pageSize: input.limit,
					totalItems,
				},
			};
		}),

	/**
	 * Get tenant details with subscription info and member count
	 */
	getTenant: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			const org = await controlPanelDb.query.organizations.findFirst({
				where: eq(organizations.id, input.id),
				with: {
					subscription: true,
					owner: true,
				},
			});

			if (!org) {
				throw new ORPCError("NOT_FOUND", {
					message: "Tenant not found",
				});
			}

			// Get member count from control panel registry
			const memberCountResult = await controlPanelDb
				.select({ count: count() })
				.from(organizationMembers)
				.where(eq(organizationMembers.organizationId, org.id));

			const memberCount = memberCountResult[0]?.count || 0;

			// Get hierarchy node count from tenant DB
			let hierarchyNodeCount = 0;
			try {
				const { getTenantDb } = await import("@/lib/db");
				const tenantDb = await getTenantDb(org.id, context.honoContext);
				const nodeCountResult = await tenantDb
					.select({ count: count() })
					.from(hierarchyNodes);
				hierarchyNodeCount = nodeCountResult[0]?.count || 0;
			} catch (error) {
				console.error("Failed to get hierarchy node count:", error);
				// Continue without hierarchy count
			}

			return {
				id: org.id,
				name: org.name,
				slug: org.slug,
				status: org.paymentStatus as "active" | "suspended",
				neonBranchId: org.neonProjectId,
				subscriptionId: org.subscriptionId,
				subscriptionTier: org.subscription?.tier as
					| "starter"
					| "professional"
					| "enterprise",
				memberCount,
				createdAt: org.createdAt,
				ownerUserId: org.ownerUserId || undefined,
				ownerEmail: org.owner?.email || undefined,
				hierarchyNodeCount,
				subscription: org.subscription
					? {
							stripeSubscriptionId: org.subscription.stripeSubscriptionId,
							stripeCustomerId: org.subscription.stripeCustomerId,
							tier: org.subscription.tier,
							organizationCountLimit: org.subscription.organizationCountLimit,
							status: org.subscription.status,
						}
					: undefined,
			};
		}),

	/**
	 * Suspend organization
	 */
	suspendTenant: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				reason: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			const org = await controlPanelDb.query.organizations.findFirst({
				where: eq(organizations.id, input.id),
				with: {
					subscription: true,
				},
			});

			if (!org) {
				throw new ORPCError("NOT_FOUND", {
					message: "Tenant not found",
				});
			}

			// Update payment status to suspended
			await controlPanelDb
				.update(organizations)
				.set({
					paymentStatus: "suspended",
					updatedAt: new Date(),
				})
				.where(eq(organizations.id, input.id));

			// Get updated org with member count
			const updatedOrg = await controlPanelDb.query.organizations.findFirst({
				where: eq(organizations.id, input.id),
				with: {
					subscription: true,
				},
			});

			const memberCountResult = await controlPanelDb
				.select({ count: count() })
				.from(organizationMembers)
				.where(eq(organizationMembers.organizationId, input.id));

			const memberCount = memberCountResult[0]?.count || 0;

			return {
				id: updatedOrg!.id,
				name: updatedOrg!.name,
				slug: updatedOrg!.slug,
				status: updatedOrg!.paymentStatus as "active" | "suspended",
				neonBranchId: updatedOrg!.neonProjectId,
				subscriptionId: updatedOrg!.subscriptionId,
				subscriptionTier: updatedOrg!.subscription?.tier as
					| "starter"
					| "professional"
					| "enterprise",
				memberCount,
				createdAt: updatedOrg!.createdAt,
			};
		}),

	/**
	 * Restore suspended organization
	 */
	unsuspendTenant: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			const org = await controlPanelDb.query.organizations.findFirst({
				where: eq(organizations.id, input.id),
				with: {
					subscription: true,
				},
			});

			if (!org) {
				throw new ORPCError("NOT_FOUND", {
					message: "Tenant not found",
				});
			}

			// Update payment status to active
			await controlPanelDb
				.update(organizations)
				.set({
					paymentStatus: "active",
					updatedAt: new Date(),
				})
				.where(eq(organizations.id, input.id));

			// Get updated org with member count
			const updatedOrg = await controlPanelDb.query.organizations.findFirst({
				where: eq(organizations.id, input.id),
				with: {
					subscription: true,
				},
			});

			const memberCountResult = await controlPanelDb
				.select({ count: count() })
				.from(organizationMembers)
				.where(eq(organizationMembers.organizationId, input.id));

			const memberCount = memberCountResult[0]?.count || 0;

			return {
				id: updatedOrg!.id,
				name: updatedOrg!.name,
				slug: updatedOrg!.slug,
				status: updatedOrg!.paymentStatus as "active" | "suspended",
				neonBranchId: updatedOrg!.neonProjectId,
				subscriptionId: updatedOrg!.subscriptionId,
				subscriptionTier: updatedOrg!.subscription?.tier as
					| "starter"
					| "professional"
					| "enterprise",
				memberCount,
				createdAt: updatedOrg!.createdAt,
			};
		}),

	// admin.getAuditLogs (stub) was removed in Phase 8.4 — it had zero
	// callers and was superseded by platformAdminAudit.listAdminActions
	// (Plan E E.6), which reads adminSessionActions + adminSessions and
	// is the canonical platform-audit query.

	/**
	 * Get platform statistics
	 */
	getStats: adminProcedure.handler(async ({ context }) => {
		const controlPanelDb = context.honoContext?.get("controlPanelDb") as
			| NeonDatabase<typeof controlPanelSchema>
			| undefined;

		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Control panel database not available",
			});
		}

		// Get organization counts
		const orgCounts = await controlPanelDb
			.select({
				status: organizations.paymentStatus,
				count: count(),
			})
			.from(organizations)
			.groupBy(organizations.paymentStatus);

		const activeOrganizations =
			orgCounts.find((c) => c.status === "active")?.count || 0;
		const suspendedOrganizations =
			orgCounts.find((c) => c.status === "suspended")?.count || 0;
		const totalOrganizations = orgCounts.reduce(
			(sum, c) => sum + Number(c.count),
			0,
		);

		// Get user count
		const userCountResult = await controlPanelDb
			.select({ count: count() })
			.from(user);
		const totalUsers = userCountResult[0]?.count || 0;

		// Get total member count (across all organizations)
		const memberCountResult = await controlPanelDb
			.select({ count: count() })
			.from(organizationMembers);
		const totalMembers = memberCountResult[0]?.count || 0;

		// Get active subscription count
		const subscriptionCountResult = await controlPanelDb
			.select({ count: count() })
			.from(subscriptions)
			.where(eq(subscriptions.status, "active"));
		const activeSubscriptions = subscriptionCountResult[0]?.count || 0;

		return {
			totalOrganizations,
			activeOrganizations,
			suspendedOrganizations,
			totalUsers,
			totalMembers,
			activeSubscriptions,
		};
	}),
};
