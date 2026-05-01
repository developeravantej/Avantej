// apps/server/src/services/ghl/sync-staff.ts
/**
 * Staff (member.role IN admin/staff/trainer + user) → GHL User outbound sync.
 *
 * Same failure mode B as sync-customer.ts. Different table: ghl_user_links.
 */

import { and, eq } from "drizzle-orm";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { ghlFetch } from "./http-client";
import { buildUserPayload, type AvantejUser } from "./payload-builders";
import type { GhlUser } from "./types";
import { GhlApiError } from "./types";

export interface AvantejMember {
	id: string;
	userId: string;
	role: string;
	status: string;
	hierarchyScopeId: string;
}

export type SyncStaffOperation = "create" | "update" | "delete";

export interface SyncStaffArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	branchNodeId: string;
	/** Your GHL agency / company id (constant for the whole agency) */
	companyId: string;
	user: AvantejUser;
	member: AvantejMember;
	operation: SyncStaffOperation;
	decryptApiKey: (encrypted: string) => string;
}

export interface SyncStaffResult {
	status: "synced" | "skipped" | "error";
	ghlUserId?: string;
	error?: string;
	reason?: "branch-not-connected" | "non-staff-role";
}

export async function syncStaffToGhl(
	args: SyncStaffArgs,
): Promise<SyncStaffResult> {
	const {
		controlPanelDb,
		tenantDb,
		organizationId,
		branchNodeId,
		companyId,
		user,
		member,
		operation,
		decryptApiKey,
	} = args;

	if (
		member.role !== "admin" &&
		member.role !== "staff" &&
		member.role !== "trainer"
	) {
		return { status: "skipped", reason: "non-staff-role" };
	}

	const link = await controlPanelDb.query.ghlBranchLinks.findFirst({
		where: and(
			eq(ghlBranchLinks.organizationId, organizationId),
			eq(ghlBranchLinks.tenantBranchId, branchNodeId),
			eq(ghlBranchLinks.isActive, true),
		),
	});
	if (!link) return { status: "skipped", reason: "branch-not-connected" };

	const apiKey = decryptApiKey(link.ghlApiKey);
	const locationId = link.ghlLocationId;

	const existing = await tenantDb.query.ghlUserLinks.findFirst({
		where: and(
			eq(ghlUserLinks.memberId, member.id),
			eq(ghlUserLinks.branchNodeId, branchNodeId),
		),
	});

	try {
		if (operation === "create" || (operation === "update" && !existing)) {
			const payload = buildUserPayload({
				companyId,
				locationId,
				user,
				memberRole: member.role as "admin" | "staff" | "trainer",
			});
			const created = await ghlFetch<GhlUser>({
				method: "POST",
				path: "/users/",
				apiKey,
				body: payload,
			});
			await upsertUserLink({
				tenantDb,
				ghlUserId: created.id,
				userId: user.id,
				memberId: member.id,
				branchNodeId,
				ghlLocationId: locationId,
				syncStatus: "active",
				lastError: null,
			});
			return { status: "synced", ghlUserId: created.id };
		}

		if (operation === "update") {
			const payload = buildUserPayload({
				companyId,
				locationId,
				user,
				memberRole: member.role as "admin" | "staff" | "trainer",
			});
			await ghlFetch<GhlUser>({
				method: "PUT",
				path: `/users/${existing!.ghlUserId}`,
				apiKey,
				body: payload,
			});
			await upsertUserLink({
				tenantDb,
				ghlUserId: existing!.ghlUserId,
				userId: user.id,
				memberId: member.id,
				branchNodeId,
				ghlLocationId: locationId,
				syncStatus: "active",
				lastError: null,
			});
			return { status: "synced", ghlUserId: existing!.ghlUserId };
		}

		// delete
		if (!existing) return { status: "skipped" };
		await ghlFetch<unknown>({
			method: "DELETE",
			path: `/users/${existing.ghlUserId}`,
			apiKey,
		});
		await upsertUserLink({
			tenantDb,
			ghlUserId: existing.ghlUserId,
			userId: user.id,
			memberId: member.id,
			branchNodeId,
			ghlLocationId: locationId,
			syncStatus: "deleted",
			lastError: null,
		});
		return { status: "synced", ghlUserId: existing.ghlUserId };
	} catch (error) {
		const message =
			error instanceof GhlApiError
				? `${error.code}: ${error.message}`
				: error instanceof Error
					? error.message
					: String(error);
		await upsertUserLink({
			tenantDb,
			ghlUserId: existing?.ghlUserId ?? "pending",
			userId: user.id,
			memberId: member.id,
			branchNodeId,
			ghlLocationId: locationId,
			syncStatus: "error",
			lastError: message,
		});
		return { status: "error", error: message };
	}
}

async function upsertUserLink(args: {
	tenantDb: NeonDatabase<typeof tenantSchema>;
	ghlUserId: string;
	userId: string;
	memberId: string;
	branchNodeId: string;
	ghlLocationId: string;
	syncStatus: "active" | "deleted" | "error";
	lastError: string | null;
}) {
	await args.tenantDb
		.insert(ghlUserLinks)
		.values({
			ghlUserId: args.ghlUserId,
			userId: args.userId,
			memberId: args.memberId,
			branchNodeId: args.branchNodeId,
			ghlLocationId: args.ghlLocationId,
			syncStatus: args.syncStatus,
			lastSyncedAt: new Date(),
			lastError: args.lastError,
		})
		.onConflictDoUpdate({
			target: [ghlUserLinks.memberId, ghlUserLinks.branchNodeId],
			set: {
				ghlUserId: args.ghlUserId,
				ghlLocationId: args.ghlLocationId,
				syncStatus: args.syncStatus,
				lastSyncedAt: new Date(),
				lastError: args.lastError,
				updatedAt: new Date(),
			},
		});
}
