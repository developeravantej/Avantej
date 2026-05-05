/**
 * GHL Staff Sync Service
 *
 * Single source of truth for dispatching staff sync to GoHighLevel.
 * Owns skip-rule decisions (non-staff role, non-branch scope, branch not connected,
 * deactivate skip) and orchestrates calls to the underlying syncStaffToGhl routine.
 *
 * This file currently scaffolds the dispatcher and implements the non-staff-role
 * skip rule only. Subsequent tasks add deactivate-skip, branch resolution,
 * syncStaffToGhl invocation, and dispatchProfileSync.
 */

import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { users } from "@avantej-core/db/schema/control-panel/users";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type StaffSyncOperation = "create" | "update" | "delete";

export type StaffSyncSkipReason =
	| "non-staff-role"
	| "non-branch-scope"
	| "branch-not-connected"
	| "deactivate-skip";

export interface StaffSyncResult {
	status: "synced" | "skipped" | "error";
	reason?: StaffSyncSkipReason;
	ghlUserId?: string;
	error?: string;
}

export interface DispatchStaffSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	memberId: string;
	operation: StaffSyncOperation;
	env: { GHL_AGENCY_ID: string; ENCRYPTION_KEY: string };
}

const STAFF_ROLES = new Set(["admin", "staff", "trainer"]);

export async function dispatchStaffSync(
	args: DispatchStaffSyncArgs,
): Promise<StaffSyncResult> {
	const { tenantDb, memberId } = args;

	const member = await tenantDb.query.members.findFirst({
		where: eq(members.id, memberId),
	});
	if (!member) return { status: "error", error: "member not found" };

	if (!STAFF_ROLES.has(member.role)) {
		return { status: "skipped", reason: "non-staff-role" };
	}

	if (args.operation === "delete") {
		const existing = await tenantDb.query.ghlUserLinks.findFirst({
			where: eq(ghlUserLinks.memberId, memberId),
		});
		if (existing) {
			await tenantDb
				.update(ghlUserLinks)
				.set({ syncStatus: "inactive", updatedAt: new Date() })
				.where(eq(ghlUserLinks.id, existing.id));
		}
		return { status: "skipped", reason: "deactivate-skip" };
	}

	const node = await tenantDb.query.hierarchyNodes.findFirst({
		where: eq(hierarchyNodes.id, member.hierarchyScopeId),
	});
	if (!node || node.type !== "branch") {
		return { status: "skipped", reason: "non-branch-scope" };
	}
	const branchNodeId = node.id;

	const user = await args.controlPanelDb.query.users.findFirst({
		where: eq(users.id, member.userId),
	});
	if (!user) return { status: "error", error: "control panel user not found" };

	const branchLink = await args.controlPanelDb.query.ghlBranchLinks.findFirst({
		where: and(
			eq(ghlBranchLinks.organizationId, args.organizationId),
			eq(ghlBranchLinks.tenantBranchId, branchNodeId),
			eq(ghlBranchLinks.isActive, true),
		),
	});
	if (!branchLink) {
		return { status: "skipped", reason: "branch-not-connected" };
	}

	// TODO Task 4: branch reassignment detection + syncStaffToGhl call
	// biome-ignore lint/correctness/noUnusedVariables: consumed in Task 4
	const _bound = { branchNodeId, user, branchLink };
	return { status: "error", error: "not implemented" };
}
