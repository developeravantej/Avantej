/**
 * Member Service
 *
 * Provides utilities for managing organization members and their hierarchy scope assignments.
 */

import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { writeAudit } from "./audit-log.service";
import * as branchStatsCache from "./branch-stats-cache.service";

/**
 * Get all members assigned to a specific hierarchy node
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param hierarchyScopeId - UUID of the hierarchy node
 * @returns Array of member records
 */
export async function getMembersByHierarchyScope(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	hierarchyScopeId: string,
) {
	if (!hierarchyScopeId) {
		throw new Error("Hierarchy scope ID is required");
	}

	try {
		const memberList = await tenantDb.query.members.findMany({
			where: eq(members.hierarchyScopeId, hierarchyScopeId),
			orderBy: (members, { asc }) => [asc(members.joinedAt)],
		});

		return memberList;
	} catch (error) {
		throw new Error(
			`Failed to get members by hierarchy scope: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Update a member's hierarchy scope assignment
 *
 * Validates that:
 * - Member exists
 * - Target hierarchy node exists
 * - User has permission to reassign (enforced in API layer)
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param memberId - UUID of the member to update
 * @param newHierarchyScopeId - UUID of the new hierarchy node
 * @returns Updated member record
 * @throws Error if member or target node not found, or update fails
 */
export async function updateMemberHierarchyScope(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	memberId: string,
	newHierarchyScopeId: string,
) {
	if (!memberId) {
		throw new Error("Member ID is required");
	}

	if (!newHierarchyScopeId) {
		throw new Error("New hierarchy scope ID is required");
	}

	try {
		// Check if member exists
		const member = await tenantDb.query.members.findFirst({
			where: eq(members.id, memberId),
		});

		if (!member) {
			throw new Error(`Member not found: ${memberId}`);
		}

		// Check if target hierarchy node exists
		const targetNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, newHierarchyScopeId),
		});

		if (!targetNode) {
			throw new Error(
				`Target hierarchy node not found: ${newHierarchyScopeId}`,
			);
		}

		// Update member's hierarchy scope
		const [updatedMember] = await tenantDb
			.update(members)
			.set({
				hierarchyScopeId: newHierarchyScopeId,
			})
			.where(eq(members.id, memberId))
			.returning();

		if (!updatedMember) {
			throw new Error("Failed to update member hierarchy scope");
		}

		// Refresh both old and new node member + staff counts (debounced, fire-and-forget)
		const oldScopeId = member.hierarchyScopeId;
		if (oldScopeId && oldScopeId !== newHierarchyScopeId) {
			branchStatsCache.refresh(tenantDb, oldScopeId, "members");
			branchStatsCache.refresh(tenantDb, oldScopeId, "staff");
		}
		branchStatsCache.refresh(tenantDb, newHierarchyScopeId, "members");
		branchStatsCache.refresh(tenantDb, newHierarchyScopeId, "staff");

		return updatedMember;
	} catch (error) {
		throw new Error(
			`Failed to update member hierarchy scope: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Bulk update members' hierarchy scope assignments
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param memberIds - Array of member UUIDs to update
 * @param newHierarchyScopeId - UUID of the new hierarchy node
 * @returns Number of members updated
 * @throws Error if any member or target node not found, or update fails
 */
export async function bulkUpdateMemberHierarchyScope(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	memberIds: string[],
	newHierarchyScopeId: string,
) {
	if (!memberIds || memberIds.length === 0) {
		throw new Error("Member IDs are required");
	}

	if (!newHierarchyScopeId) {
		throw new Error("New hierarchy scope ID is required");
	}

	try {
		// Check if target hierarchy node exists
		const targetNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, newHierarchyScopeId),
		});

		if (!targetNode) {
			throw new Error(
				`Target hierarchy node not found: ${newHierarchyScopeId}`,
			);
		}

		// Verify all members exist
		const existingMembers = await tenantDb.query.members.findMany({
			where: (members, { inArray }) => inArray(members.id, memberIds),
		});

		if (existingMembers.length !== memberIds.length) {
			const foundIds = existingMembers.map((m) => m.id);
			const missingIds = memberIds.filter((id) => !foundIds.includes(id));
			throw new Error(`Some members not found: ${missingIds.join(", ")}`);
		}

		// Bulk update members
		const updatedMembers = await tenantDb
			.update(members)
			.set({
				hierarchyScopeId: newHierarchyScopeId,
			})
			.where(inArray(members.id, memberIds))
			.returning({
				id: members.id,
				userId: members.userId,
				role: members.role,
				hierarchyScopeId: members.hierarchyScopeId,
				status: members.status,
				joinedAt: members.joinedAt,
			});

		return updatedMembers;
	} catch (error) {
		throw new Error(
			`Failed to bulk update member hierarchy scope: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Get all members in an organization with user details from control panel
 *
 * This function:
 * 1. Finds the organization root node (depth=0, type="organization")
 * 2. Gets all members scoped to the organization (or all accessible members)
 * 3. Fetches user details from control panel database
 * 4. Returns enriched member data with user information
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param controlPanelDb - Drizzle client for the control panel database
 * @param organizationId - UUID of the organization
 * @param includeInactive - Whether to include inactive/suspended members (default: false)
 * @returns Array of member records with user details (name, email, userId, role, status)
 */
export async function getAllOrganizationMembersWithUserDetails(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
	includeInactive = false,
) {
	if (!organizationId) {
		throw new Error("Organization ID is required");
	}

	try {
		// Step 1: Find organization root node
		const orgRoot = await tenantDb.query.hierarchyNodes.findFirst({
			where: (nodes, { and, eq }) =>
				and(eq(nodes.depth, 0), eq(nodes.type, "organization")),
		});

		if (!orgRoot) {
			throw new Error("Organization root node not found");
		}

		// Step 2: Get all members in the organization
		// We'll get members scoped to the org root and all its descendants
		// For simplicity, we can get all members and filter by accessible nodes
		const allMembers = await tenantDb.query.members.findMany({
			orderBy: (members, { asc }) => [asc(members.joinedAt)],
		});

		// Filter by status if needed
		const activeMembers = includeInactive
			? allMembers
			: allMembers.filter((m) => m.status === "active");

		if (activeMembers.length === 0) {
			return [];
		}

		// Step 3: Get unique user IDs
		const userIds = [...new Set(activeMembers.map((m) => m.userId))];

		// Step 4: Fetch user details from control panel database
		const users = await controlPanelDb.query.user.findMany({
			where: (users, { inArray }) => inArray(users.id, userIds),
		});

		// Create a map of userId -> user details
		const userMap = new Map(users.map((u) => [u.id, u]));

		// Step 5: Combine member data with user details
		const membersWithUserDetails = activeMembers.map((member) => {
			const user = userMap.get(member.userId);
			return {
				id: member.id,
				userId: member.userId,
				name: user?.name || "Unknown",
				email: user?.email || "No email",
				role: member.role,
				status: member.status,
				hierarchyScopeId: member.hierarchyScopeId,
				joinedAt: member.joinedAt,
			};
		});

		return membersWithUserDetails;
	} catch (error) {
		throw new Error(
			`Failed to get organization members with user details: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Create a new member in an organization
 *
 * Creates a member record in both the control panel and tenant databases.
 * This can be used for direct member creation (not through invitation flow).
 *
 * @param controlPanelDb - Drizzle client for the control panel database
 * @param tenantDb - Drizzle client for the tenant database
 * @param params - Member creation parameters
 * @param params.userId - User ID from control panel users table
 * @param params.organizationId - Organization ID
 * @param params.role - Member role (admin, trainer, staff, client)
 * @param params.hierarchyScopeId - Hierarchy node ID for scope
 * @param params.invitationId - Optional invitation ID (if creating from invitation)
 * @returns Success indicator
 * @throws Error if creation fails
 */
export async function createMember(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		userId: string;
		organizationId: string;
		role: string;
		hierarchyScopeId: string;
		invitationId?: string;
	},
) {
	const { userId, organizationId, role, hierarchyScopeId, invitationId } =
		params;

	if (!userId) {
		throw new Error("User ID is required");
	}

	if (!organizationId) {
		throw new Error("Organization ID is required");
	}

	if (!role) {
		throw new Error("Role is required");
	}

	if (!hierarchyScopeId) {
		throw new Error("Hierarchy scope ID is required");
	}

	try {
		const membershipService = new MembershipService(controlPanelDb);
		const result = await membershipService.createMember({
			userId,
			organizationId,
			role,
			hierarchyScopeId,
			invitationId,
			tenantDb,
		});
		// Refresh branch member + staff counts (debounced, fire-and-forget)
		branchStatsCache.refresh(tenantDb, hierarchyScopeId, "members");
		branchStatsCache.refresh(tenantDb, hierarchyScopeId, "staff");
		return result;
	} catch (error) {
		throw new Error(
			`Failed to create member: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Deactivate a member in the tenant database
 *
 * Sets the member's status to "inactive" directly in the tenant database.
 * Unlike suspend (which dual-writes to control panel), this is a tenant-only operation.
 * Audit row is written inside the same transaction as the status change.
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param memberId - UUID of the member to deactivate
 * @param actor - Actor info (userId, memberId, role) for the audit log
 * @returns Updated member record
 * @throws Error if member not found
 */
export async function deactivateMember(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	memberId: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<typeof members.$inferSelect> {
	const existing = await tenantDb.query.members.findFirst({
		where: eq(members.id, memberId),
	});
	if (!existing) {
		throw new Error(`Member not found: ${memberId}`);
	}

	const updated = await tenantDb.transaction(async (tx) => {
		const [row] = await tx
			.update(members)
			.set({ status: "inactive" })
			.where(eq(members.id, memberId))
			.returning();

		if (!row) {
			throw new Error(`Failed to deactivate member: ${memberId}`);
		}

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "member.deactivate",
			entityType: "member",
			entityId: memberId,
			branchId: existing.hierarchyScopeId ?? undefined,
			summary: `Deactivated member ${memberId}`,
			changes: {
				statusBefore: existing.status,
				statusAfter: "inactive",
				role: existing.role,
			},
		});

		return row;
	});

	// Refresh branch member + staff counts for the node the member was assigned to
	if (existing.hierarchyScopeId) {
		branchStatsCache.refresh(tenantDb, existing.hierarchyScopeId, "members");
		branchStatsCache.refresh(tenantDb, existing.hierarchyScopeId, "staff");
	}

	return updated;
}
