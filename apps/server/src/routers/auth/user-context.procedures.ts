import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { permissions as permissionsTable } from "@avantej-core/db/schema/tenant/permissions";
import { rolePermissions } from "@avantej-core/db/schema/tenant/role-permissions";
import { roles } from "@avantej-core/db/schema/tenant/roles";
import { getDescendantNodeIds } from "@avantej-core/services";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { authMiddleware, o } from "./_shared";

// Configure Neon for WebSocket support
neonConfig.webSocketConstructor = ws;

/**
 * User context procedure - Get current user's complete context
 * Includes user data, organizations, hierarchy, and permissions
 */
export const userContext = o
	.use(authMiddleware)
	.handler(async ({ context }) => {
		const c = context.honoContext;

		if (!c) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Missing Hono context",
			});
		}

		// Get current user from context (set by requireAuth middleware)
		const userId = context.session?.user?.id;

		if (!userId) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Not authenticated",
			});
		}

		// Get control panel database from context (set by dbMiddleware)
		const controlPanelDb = c.get("controlPanelDb") as
			| (NeonDatabase<
					typeof import("@avantej-core/db/schema/control-panel-schema")
			  > & { $client: Pool })
			| undefined;

		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Database unavailable",
			});
		}

		// Get decrypt function
		const decrypt = c.get("decrypt");
		if (!decrypt) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Decrypt function unavailable",
			});
		}

		// Get user's organizations
		const userOrganizations = await controlPanelDb
			.select({
				id: organizationMembers.organizationId,
				role: organizationMembers.role,
				memberStatus: organizationMembers.status,
			})
			.from(organizationMembers)
			.where(eq(organizationMembers.userId, userId));

		// Check if user is a platform admin
		const platformAdmin = await controlPanelDb.query.platformAdmins.findFirst({
			where: eq(platformAdmins.userId, userId),
		});
		const isSystemAdmin = !!platformAdmin;

		// Build organizations with hierarchy data
		const organizationsWithHierarchy: Array<{
			id: string;
			name: string;
			slug: string;
			role: string;
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
		}> = [];

		for (const om of userOrganizations) {
			if (om.memberStatus !== "active") continue;

			// Get organization details
			const org = await controlPanelDb.query.organizations.findFirst({
				where: (orgs, { eq }) => eq(orgs.id, om.id),
			});

			if (!org || org.paymentStatus !== "active") continue;

			// Get tenant database connection for this organization
			let memberPermissions: string[] = [];
			let hierarchyData = {
				nodes: [] as Array<{
					id: string;
					name: string;
					type: string;
					depth: number;
					parentId: string | null;
					createdAt: Date | null;
					updatedAt: Date | null;
				}>,
				member: null as {
					id: string;
					role: string;
					hierarchyScopeId: string;
					hierarchyScopeName: string;
					accessibleNodeIds: string[];
				} | null,
			};

			try {
				// Decrypt connection string and connect to tenant DB
				const connectionString = decrypt(org.connectionString);
				const tenantPool = new Pool({ connectionString });
				const tenantDb = drizzle({
					client: tenantPool,
					schema: tenantSchema,
				}) as NeonDatabase<typeof tenantSchema>;

				try {
					// Hierarchy load — best-effort. Failures here MUST NOT block permission
					// loading below, otherwise dev/staging schema drift on hierarchy_nodes
					// (e.g. new column added to schema before migration applied) blocks
					// every page that gates on a permission.
					try {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const allNodes = await tenantDb.query.hierarchyNodes.findMany({
							orderBy: (nodes: any, { asc }: any) => [
								asc(nodes.depth),
								asc(nodes.name),
							],
						});

						hierarchyData.nodes = allNodes.map((node) => ({
							id: node.id,
							name: node.name,
							type: node.type,
							depth: node.depth,
							parentId: node.parentId,
							createdAt: node.createdAt,
							updatedAt: node.updatedAt,
						}));
					} catch (hierarchyError) {
						console.error(
							`[userContext] Failed to load hierarchy nodes for org ${org.id} (continuing with empty hierarchy):`,
							hierarchyError,
						);
					}

					// Member + permissions — load independently so hierarchy drift doesn't
					// strip permissions and lock admins out of every page.
					const member = await tenantDb.query.members.findFirst({
						where: eq(members.userId, userId),
					});

					if (member) {
						// accessibleNodeIds best-effort (depends on hierarchy table)
						let accessibleNodeIds: string[] = [];
						let scopeName = "Unknown";
						try {
							accessibleNodeIds = await getDescendantNodeIds(
								tenantDb,
								member.hierarchyScopeId,
							);
							const scopeNode = await tenantDb.query.hierarchyNodes.findFirst({
								where: eq(hierarchyNodes.id, member.hierarchyScopeId),
							});
							scopeName = scopeNode?.name || "Unknown";
						} catch (scopeError) {
							console.error(
								`[userContext] Failed to compute accessibleNodeIds for member ${member.id} (continuing without scope):`,
								scopeError,
							);
						}

						hierarchyData.member = {
							id: member.id,
							role: member.role,
							hierarchyScopeId: member.hierarchyScopeId,
							hierarchyScopeName: scopeName,
							accessibleNodeIds,
						};

						// Fetch permissions for the member's role (case-insensitive to handle "Admin" vs "admin")
						const role = await tenantDb.query.roles.findFirst({
							where: sql`LOWER(${roles.name}) = LOWER(${member.role})`,
						});

						if (!role) {
							console.warn(
								`[userContext] No role found for member.role="${member.role}" in tenant DB`,
							);
						}

						if (role) {
							// Admin roles (priority >= 100) get all permissions
							if (role.priority >= 100) {
								const allPerms = await tenantDb
									.select({
										resource: permissionsTable.resource,
										action: permissionsTable.action,
									})
									.from(permissionsTable);
								if (allPerms.length === 0) {
									console.warn(
										`[userContext] Admin role "${role.name}" has priority ${role.priority} but permissions table is empty`,
									);
								}
								memberPermissions = allPerms.map(
									(p) => `${p.resource}:${p.action}`,
								);
							} else {
								// Fetch permissions assigned to this role
								const rolePerms = await tenantDb
									.select({
										resource: permissionsTable.resource,
										action: permissionsTable.action,
									})
									.from(rolePermissions)
									.innerJoin(
										permissionsTable,
										eq(rolePermissions.permissionId, permissionsTable.id),
									)
									.where(eq(rolePermissions.roleId, role.id));
								memberPermissions = rolePerms.map(
									(p) => `${p.resource}:${p.action}`,
								);
							}
						}
					}
				} finally {
					await tenantPool.end();
				}
			} catch (error) {
				console.error(
					`[userContext] Tenant DB connection failed for org ${org.id}:`,
					error,
				);
				// Continue with empty hierarchy data
			}

			organizationsWithHierarchy.push({
				id: org.id,
				name: org.name,
				slug: org.slug,
				role: om.role,
				permissions: memberPermissions,
				hierarchy: hierarchyData,
			});
		}

		return {
			user: {
				id: context.session!.user.id,
				email: context.session!.user.email,
				name: context.session!.user.name,
				firstName: context.session!.user.firstName,
				lastName: context.session!.user.lastName,
				emailVerified: context.session!.user.emailVerified,
			},
			isSystemAdmin,
			organizations: organizationsWithHierarchy,
			currentOrganizationId: organizationsWithHierarchy[0]?.id || null,
		};
	});
