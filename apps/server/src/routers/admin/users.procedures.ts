import { eq, or, like, count, desc, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user } from "@avantej-core/db/schema/auth";
import { requirePlatformAdmin, adminProcedure } from "@/lib/admin-procedure";
import { getPlatformAdmin, syncUserRole } from "@/services/admin.service";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

export const userProcedures = {
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

		const controlPanelDb = getControlPanelDb(context);

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
			const controlPanelDb = getControlPanelDb(context);

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
			const controlPanelDb = getControlPanelDb(context);

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
			const controlPanelDb = getControlPanelDb(context);

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

			const controlPanelDb = getControlPanelDb(context);

			await controlPanelDb
				.delete(platformAdmins)
				.where(eq(platformAdmins.userId, input.userId));

			// Clear user.role so Better-Auth stops treating them as an admin
			await syncUserRole(controlPanelDb, input.userId);

			return { success: true as const };
		}),
};
