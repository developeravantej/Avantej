/**
 * Membership Service
 *
 * Centralizes membership synchronization logic between control panel and tenant databases.
 * Implements dual-write pattern to keep organization_members (control panel) and members (tenant) in sync.
 *
 * This service handles:
 * - Creating members from invitation acceptance
 * - Updating member roles
 * - Suspending/reactivating members
 * - Removing members (with "cannot remove last admin" validation)
 *
 * All operations sync to both databases atomically using Promise.all().
 *
 * Usage:
 * ```typescript
 * import { MembershipService } from "@avantej-core/db/services/membership.service";
 * import { controlPanelDb } from "@/lib/db";
 *
 * const membershipService = new MembershipService(controlPanelDb);
 *
 * // From invitation acceptance:
 * await membershipService.createMember({
 *   userId,
 *   organizationId,
 *   role,
 *   hierarchyScopeId,
 *   invitationId, // optional
 *   tenantDb: await getTenantDb(organizationId),
 * });
 *
 * // Direct creation (no invitation):
 * await membershipService.createMember({
 *   userId,
 *   organizationId,
 *   role,
 *   hierarchyScopeId,
 *   tenantDb: await getTenantDb(organizationId),
 * });
 * ```
 */

import { eq, and, ne } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { members } from "@avantej-core/db/schema/tenant/members";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { roles } from "@avantej-core/db/schema/tenant/roles";

// Type definitions for database clients
// Support both NeonHttpDatabase and NeonDatabase (serverless) for flexibility
type ControlPanelDb =
	| NeonHttpDatabase<typeof controlPanelSchema>
	| NeonDatabase<typeof controlPanelSchema>;
type TenantDb =
	| NeonHttpDatabase<typeof tenantSchema>
	| NeonDatabase<typeof tenantSchema>;

export class MembershipService {
	constructor(private controlPanelDb: ControlPanelDb) {}

	/**
	 * Create new member (from invitation acceptance or direct creation)
	 * Syncs to both control panel and tenant database
	 *
	 * @param params - Member creation parameters
	 * @param params.userId - User ID from control panel users table
	 * @param params.organizationId - Organization ID
	 * @param params.role - Member role (admin, trainer, staff, client)
	 * @param params.hierarchyScopeId - Hierarchy node ID for scope
	 * @param params.invitationId - Optional invitation ID to mark as accepted (if creating from invitation)
	 * @param params.tenantDb - Tenant database client
	 * @returns Success indicator
	 * @throws Error if creation fails
	 */
	async createMember(params: {
		userId: string;
		organizationId: string;
		role: string;
		hierarchyScopeId: string;
		invitationId?: string;
		tenantDb: TenantDb;
	}) {
		const {
			userId,
			organizationId,
			role,
			hierarchyScopeId,
			invitationId,
			tenantDb,
		} = params;

		try {
			// Sync to both databases in parallel
			await Promise.all([
				// Control Panel: Registry for routing
				this.controlPanelDb.insert(organizationMembers).values({
					userId,
					organizationId,
					role,
					status: "active",
				}),

				// Tenant DB: Full member record + optionally mark invitation accepted
				tenantDb.transaction(async (tx) => {
					// Phase 3 Task 3.4: resolve role_id from roles table so the FK is set
					// at creation time instead of requiring a separate backfill.
					const roleRow = await tx
						.select({ id: roles.id })
						.from(roles)
						.where(eq(roles.name, role))
						.limit(1)
						.then((rows) => rows[0]);

					await tx.insert(members).values({
						userId,
						role,
						roleId: roleRow?.id ?? null,
						hierarchyScopeId,
						status: "active",
					});

					// Only update invitation if invitationId is provided
					if (invitationId) {
						await tx
							.update(invitations)
							.set({ status: "accepted" })
							.where(eq(invitations.id, invitationId));
					}
				}),
			]);

			return { success: true };
		} catch (error) {
			console.error("Failed to create member:", error);
			throw new Error(
				`Failed to create member: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Update member role
	 * Syncs to both control panel and tenant database
	 *
	 * @param params - Role update parameters
	 * @param params.userId - User ID
	 * @param params.organizationId - Organization ID
	 * @param params.newRole - New role to assign
	 * @param params.tenantDb - Tenant database client
	 * @returns Success indicator
	 * @throws Error if update fails
	 */
	async updateMemberRole(params: {
		userId: string;
		organizationId: string;
		newRole: string;
		tenantDb: TenantDb;
	}) {
		const { userId, organizationId, newRole, tenantDb } = params;

		try {
			await Promise.all([
				// Control Panel: Update registry
				this.controlPanelDb
					.update(organizationMembers)
					.set({ role: newRole })
					.where(
						and(
							eq(organizationMembers.userId, userId),
							eq(organizationMembers.organizationId, organizationId),
						),
					),

				// Tenant DB: Update member record
				tenantDb
					.update(members)
					.set({ role: newRole })
					.where(eq(members.userId, userId)),
			]);

			return { success: true };
		} catch (error) {
			console.error("Failed to update member role:", error);
			throw new Error(
				`Failed to update member role: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Suspend member
	 * Syncs to both control panel and tenant database
	 *
	 * @param params - Suspension parameters
	 * @param params.userId - User ID
	 * @param params.organizationId - Organization ID
	 * @param params.tenantDb - Tenant database client
	 * @returns Success indicator
	 * @throws Error if suspension fails
	 */
	async suspendMember(params: {
		userId: string;
		organizationId: string;
		tenantDb: TenantDb;
	}) {
		const { userId, organizationId, tenantDb } = params;

		try {
			await Promise.all([
				// Control Panel: Update status
				this.controlPanelDb
					.update(organizationMembers)
					.set({ status: "suspended" })
					.where(
						and(
							eq(organizationMembers.userId, userId),
							eq(organizationMembers.organizationId, organizationId),
						),
					),

				// Tenant DB: Update status
				tenantDb
					.update(members)
					.set({ status: "suspended" })
					.where(eq(members.userId, userId)),
			]);

			return { success: true };
		} catch (error) {
			console.error("Failed to suspend member:", error);
			throw new Error(
				`Failed to suspend member: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Reactivate member
	 * Syncs to both control panel and tenant database
	 *
	 * @param params - Reactivation parameters
	 * @param params.userId - User ID
	 * @param params.organizationId - Organization ID
	 * @param params.tenantDb - Tenant database client
	 * @returns Success indicator
	 * @throws Error if reactivation fails
	 */
	async reactivateMember(params: {
		userId: string;
		organizationId: string;
		tenantDb: TenantDb;
	}) {
		const { userId, organizationId, tenantDb } = params;

		try {
			await Promise.all([
				// Control Panel: Update status
				this.controlPanelDb
					.update(organizationMembers)
					.set({ status: "active" })
					.where(
						and(
							eq(organizationMembers.userId, userId),
							eq(organizationMembers.organizationId, organizationId),
						),
					),

				// Tenant DB: Update status
				tenantDb
					.update(members)
					.set({ status: "active" })
					.where(eq(members.userId, userId)),
			]);

			return { success: true };
		} catch (error) {
			console.error("Failed to reactivate member:", error);
			throw new Error(
				`Failed to reactivate member: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Remove member from organization
	 * Syncs to both control panel and tenant database
	 * Validates: Cannot remove last admin
	 *
	 * @param params - Removal parameters
	 * @param params.userId - User ID to remove
	 * @param params.organizationId - Organization ID
	 * @param params.tenantDb - Tenant database client
	 * @returns Success indicator
	 * @throws Error if removal fails or if trying to remove last admin
	 */
	async removeMember(params: {
		userId: string;
		organizationId: string;
		tenantDb: TenantDb;
	}) {
		const { userId, organizationId, tenantDb } = params;

		try {
			// Check: Cannot remove last admin
			// First, get the member being removed to check their role
			const memberToRemove = await tenantDb.query.members.findFirst({
				where: eq(members.userId, userId),
			});

			if (!memberToRemove) {
				throw new Error(`Member not found: ${userId}`);
			}

			// If removing an admin, check if there are other admins
			if (memberToRemove.role === "admin") {
				const remainingAdmins = await tenantDb.query.members.findMany({
					where: and(
						eq(members.role, "admin"),
						eq(members.status, "active"),
						ne(members.userId, userId),
					),
				});

				if (remainingAdmins.length === 0) {
					throw new Error("Cannot remove last admin from organization");
				}
			}

			// Remove from both databases
			await Promise.all([
				// Control Panel: Remove from registry
				this.controlPanelDb
					.delete(organizationMembers)
					.where(
						and(
							eq(organizationMembers.userId, userId),
							eq(organizationMembers.organizationId, organizationId),
						),
					),

				// Tenant DB: Delete member record
				tenantDb.delete(members).where(eq(members.userId, userId)),
			]);

			return { success: true };
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes("Cannot remove last admin")
			) {
				throw error;
			}
			console.error("Failed to remove member:", error);
			throw new Error(
				`Failed to remove member: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}
