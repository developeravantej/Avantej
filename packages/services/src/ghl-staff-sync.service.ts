/**
 * GHL Staff Sync Service
 *
 * Single source of truth for dispatching staff sync to GoHighLevel.
 * Owns skip-rule decisions (non-staff role, non-branch scope, branch not connected,
 * deactivate skip), branch-reassignment handling (PUT-only, preserves ghlUserId),
 * and delegation to the injected `syncStaffToGhl` orchestrator for standard
 * create/update flows. The orchestrator + GHL HTTP client + decryption helpers
 * are dependency-injected so this package stays decoupled from apps/server.
 *
 * Never throws — all errors surface as `{ status: "error", error }`.
 */

import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
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

/**
 * Structural alias for `apps/server/src/services/ghl/sync-staff.ts#syncStaffToGhl`.
 * Kept here to avoid importing from apps/server.
 */
export type SyncStaffOrchestrator = (args: {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	branchNodeId: string;
	companyId: string;
	user: {
		id: string;
		email: string;
		firstName?: string | null;
		lastName?: string | null;
		name?: string | null;
		phone?: string | null;
	};
	member: {
		id: string;
		userId: string;
		role: string;
		status: string;
		hierarchyScopeId: string;
	};
	operation: "create" | "update" | "delete";
	decryptApiKey: (encrypted: string) => string;
}) => Promise<{
	status: "synced" | "skipped" | "error";
	ghlUserId?: string;
	error?: string;
	reason?: string;
}>;

export interface DispatchStaffSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	memberId: string;
	operation: StaffSyncOperation;
	env: { GHL_AGENCY_ID: string };
	syncStaffToGhl: SyncStaffOrchestrator;
	decryptApiKey: (encrypted: string) => string;
	/** GHL PUT /users/:id — invoked only on branch reassignment to preserve ghlUserId. */
	putGhlUser: (args: {
		apiKey: string;
		ghlUserId: string;
		payload: {
			locationIds: string[];
			customFields?: Array<{ id: string; value: string }>;
		};
	}) => Promise<{ id: string }>;
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

	// Phase G: gate on the org's sync model. In "org-shared" mode there's no
	// ghl_branch_links row — config lives on `organizations` — so we must skip
	// the per-branch lookup entirely and delegate to the orchestrator, which
	// reads from organizations via resolveSyncContext.
	const org = await args.controlPanelDb.query.organizations.findFirst({
		where: eq(organizations.id, args.organizationId),
	});
	const isOrgShared =
		org?.ghlSyncModel === "org-shared" &&
		!!org.ghlLocationId &&
		!!org.ghlApiKeyEncrypted;

	const branchLink = isOrgShared
		? null
		: ((await args.controlPanelDb.query.ghlBranchLinks.findFirst({
				where: and(
					eq(ghlBranchLinks.organizationId, args.organizationId),
					eq(ghlBranchLinks.tenantBranchId, branchNodeId),
					eq(ghlBranchLinks.isActive, true),
				),
			})) ?? null);
	if (!isOrgShared && !branchLink) {
		return { status: "skipped", reason: "branch-not-connected" };
	}

	try {
		const existingLink = await tenantDb.query.ghlUserLinks.findFirst({
			where: eq(ghlUserLinks.memberId, memberId),
		});

		// Branch reassignment path: existing link points at a different branch.
		// Reassign by PUT-ing new locationIds to GHL and updating the link row.
		// Skips the standard orchestrator (which would create a new GHL user).
		// Phase G: org-shared model uses the same GHL location for every branch,
		// so reassignment is handled by the standard orchestrator's update path
		// (which PUTs to /users/:id preserving ghlUserId and re-stamps the
		// branch custom field). We only short-circuit for legacy per-branch.
		if (
			!isOrgShared &&
			branchLink &&
			args.operation === "update" &&
			existingLink &&
			existingLink.branchNodeId !== branchNodeId
		) {
			const apiKey = args.decryptApiKey(branchLink.ghlApiKey);
			// If the branch link has an `existingBranchCustomFieldId` configured,
			// set the GHL custom field on the user to the new branch name so the
			// downstream GHL workflows know which branch this person came from.
			const customFields = branchLink.existingBranchCustomFieldId
				? [
						{
							id: branchLink.existingBranchCustomFieldId,
							value: node.name,
						},
					]
				: undefined;
			await args.putGhlUser({
				apiKey,
				ghlUserId: existingLink.ghlUserId,
				payload: {
					locationIds: [branchLink.ghlLocationId],
					...(customFields ? { customFields } : {}),
				},
			});
			await tenantDb
				.update(ghlUserLinks)
				.set({
					branchNodeId,
					ghlLocationId: branchLink.ghlLocationId,
					syncStatus: "active",
					lastError: null,
					lastSyncedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(ghlUserLinks.id, existingLink.id));
			return { status: "synced", ghlUserId: existingLink.ghlUserId };
		}

		// Standard create/update — delegate to the injected orchestrator.
		const result = await args.syncStaffToGhl({
			controlPanelDb: args.controlPanelDb,
			tenantDb,
			organizationId: args.organizationId,
			branchNodeId,
			companyId: args.env.GHL_AGENCY_ID,
			user: {
				id: user.id,
				email: user.email,
				firstName: user.firstName ?? null,
				lastName: user.lastName ?? null,
				name: user.name ?? null,
				phone: user.phone ?? null,
			},
			member: {
				id: member.id,
				userId: member.userId,
				role: member.role,
				status: member.status,
				hierarchyScopeId: member.hierarchyScopeId,
			},
			operation: args.operation,
			decryptApiKey: args.decryptApiKey,
		});
		return result as StaffSyncResult;
	} catch (err) {
		return {
			status: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export interface DispatchProfileSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	userId: string;
	env: { GHL_AGENCY_ID: string };
	openTenantDb: (connectionString: string) => Promise<{
		db: NeonDatabase<typeof tenantSchema>;
		close: () => Promise<void>;
	}>;
	dispatchStaffSync: typeof dispatchStaffSync;
	decryptConnectionString: (encrypted: string) => string;
	decryptApiKey: (encrypted: string) => string;
	syncStaffToGhl: SyncStaffOrchestrator;
	putGhlUser: DispatchStaffSyncArgs["putGhlUser"];
}

/**
 * Cross-org profile sync. Called from the better-auth user.update hook to
 * propagate name/email changes to all GHL users this person has across the
 * organizations they belong to. Iterates the user's organizations, opens each
 * tenant DB, and dispatches a staff-sync update per ghl_user_links row.
 */
export async function dispatchProfileSync(
	args: DispatchProfileSyncArgs,
): Promise<StaffSyncResult[]> {
	const orgMembers =
		await args.controlPanelDb.query.organizationMembers.findMany({
			where: eq(organizationMembers.userId, args.userId),
		});
	const results: StaffSyncResult[] = [];

	for (const om of orgMembers) {
		const org = await args.controlPanelDb.query.organizations.findFirst({
			where: eq(organizations.id, om.organizationId),
		});
		if (!org) continue;

		let tenantDb: NeonDatabase<typeof tenantSchema>;
		let close: () => Promise<void>;
		try {
			const conn = args.decryptConnectionString(org.connectionString);
			const opened = await args.openTenantDb(conn);
			tenantDb = opened.db;
			close = opened.close;
		} catch (err) {
			results.push({
				status: "error",
				error: `tenant connect: ${(err as Error).message}`,
			});
			continue;
		}

		try {
			const links = await tenantDb.query.ghlUserLinks.findMany({
				where: eq(ghlUserLinks.userId, args.userId),
			});

			for (const link of links) {
				if (link.syncStatus !== "active" && link.syncStatus !== "error")
					continue;
				const r = await args.dispatchStaffSync({
					controlPanelDb: args.controlPanelDb,
					tenantDb,
					organizationId: org.id,
					memberId: link.memberId,
					operation: "update",
					env: args.env,
					syncStaffToGhl: args.syncStaffToGhl,
					decryptApiKey: args.decryptApiKey,
					putGhlUser: args.putGhlUser,
				});
				results.push(r);
			}
		} finally {
			await close();
		}
	}
	return results;
}
