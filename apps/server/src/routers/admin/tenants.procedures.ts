import { eq, or, like, count, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { adminProcedure } from "@/lib/admin-procedure";
import { user } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

export const tenantProcedures = {
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
			const controlPanelDb = getControlPanelDb(context);

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
			const controlPanelDb = getControlPanelDb(context);

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
			const controlPanelDb = getControlPanelDb(context);

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
			const controlPanelDb = getControlPanelDb(context);

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
		const controlPanelDb = getControlPanelDb(context);

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
