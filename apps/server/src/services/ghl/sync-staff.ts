// apps/server/src/services/ghl/sync-staff.ts
/**
 * Staff (member.role IN admin/staff/trainer + user) → GHL User outbound sync.
 *
 * Same failure mode B as sync-customer.ts. Different table: ghl_user_links.
 *
 * Phase G: dispatches via resolveSyncContext() — supports both per-branch
 * (legacy) and org-shared models. In org-shared mode the branch is encoded
 * onto the GHL User via a `customFields` entry referencing the per-country
 * SINGLE_OPTIONS field.
 */

import { eq } from "drizzle-orm";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { ghlFetch } from "./http-client";
import { buildUserPayload, type AvantejUser } from "./payload-builders";
import { resolveSyncContext } from "./sync-context";
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
	reason?:
		| "branch-not-connected"
		| "org-shared-not-provisioned"
		| "unknown-sync-model"
		| "non-staff-role";
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

	const ctx = await resolveSyncContext({
		controlPanelDb,
		tenantDb,
		organizationId,
		branchNodeId,
		decryptApiKey,
	});

	if (ctx.model === "skipped") {
		return { status: "skipped", reason: ctx.reason };
	}

	const { apiKey, locationId } = ctx;
	const branchCountryFieldId =
		ctx.model === "org-shared" ? ctx.branchCountryFieldId : null;
	const branchOptionLabel =
		ctx.model === "org-shared" ? ctx.branchOptionLabel : null;

	// Phase G.5: ghl_user_links uniq is (member_id) only.
	const existing = await tenantDb.query.ghlUserLinks.findFirst({
		where: eq(ghlUserLinks.memberId, member.id),
	});

	// A prior failed create leaves a link row with ghlUserId="pending" (the
	// error placeholder). Such a row is NOT a real GHL user — treating it as
	// one makes update/delete PUT/DELETE /users/pending → 401 and permanently
	// wedges the member's sync. Only a link with a real GHL id counts as linked.
	const hasRealGhlUser = !!existing && existing.ghlUserId !== "pending";

	try {
		if (operation === "create" || (operation === "update" && !hasRealGhlUser)) {
			const payload = buildUserPayload({
				companyId,
				locationId,
				user,
				memberRole: member.role as "admin" | "staff" | "trainer",
				branchCountryFieldId,
				branchOptionLabel,
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
				branchCountryFieldId,
				branchOptionLabel,
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
		if (!hasRealGhlUser) return { status: "skipped" };
		await ghlFetch<unknown>({
			method: "DELETE",
			path: `/users/${existing!.ghlUserId}`,
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
				? // Surface GHL's raw response body so a 422 shows the offending
					// field instead of just "GHL API 422 on /users/".
					`${error.code}: ${error.message}${
						error.responseBody
							? ` — ${
									typeof error.responseBody === "string"
										? error.responseBody
										: JSON.stringify(error.responseBody)
								}`
							: ""
					}`.slice(0, 800)
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
			// Phase G.5: uniq is single-column (member_id).
			target: [ghlUserLinks.memberId],
			set: {
				ghlUserId: args.ghlUserId,
				ghlLocationId: args.ghlLocationId,
				branchNodeId: args.branchNodeId,
				syncStatus: args.syncStatus,
				lastSyncedAt: new Date(),
				lastError: args.lastError,
				updatedAt: new Date(),
			},
		});
}
