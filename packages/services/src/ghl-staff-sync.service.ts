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
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
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

	// TODO: subsequent tasks add deactivate-skip, branch resolution, sync call, error capture.
	return { status: "error", error: "not implemented" };
}
