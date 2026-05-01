// apps/server/src/services/ghl/sync-customer.ts
/**
 * Customer (member.role='client' + customer_profiles + user) → GHL Contact
 * outbound sync orchestrator.
 *
 * Failure mode B: Avantej caller's mutation has already committed before
 * this is invoked. We attempt the GHL call best-effort and either:
 *   - synced  → upsert ghl_contact_links { sync_status='active', ... }
 *   - skipped → no link, no GHL config
 *   - error   → upsert ghl_contact_links { sync_status='error', last_error }
 *
 * The caller never sees a sync error as a thrown exception.
 */

import { and, eq } from "drizzle-orm";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { ghlFetch } from "./http-client";
import {
	buildContactPayload,
	type AvantejUser,
	type AvantejCustomerProfile,
	type CustomFieldIdMap,
} from "./payload-builders";
import type { GhlContact } from "./types";
import { GhlApiError } from "./types";

export type SyncCustomerOperation = "create" | "update" | "delete";

export interface SyncCustomerArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	branchNodeId: string;
	customerProfile: AvantejCustomerProfile;
	user: AvantejUser;
	memberStatus: "active" | "inactive";
	operation: SyncCustomerOperation;
	decryptApiKey: (encrypted: string) => string;
	customFieldIds?: CustomFieldIdMap;
}

export interface SyncCustomerResult {
	status: "synced" | "skipped" | "error";
	ghlContactId?: string;
	error?: string;
	reason?: "branch-not-connected" | "no-existing-contact-on-update";
}

export async function syncCustomerToGhl(
	args: SyncCustomerArgs,
): Promise<SyncCustomerResult> {
	const {
		controlPanelDb,
		tenantDb,
		organizationId,
		branchNodeId,
		customerProfile,
		user,
		memberStatus,
		operation,
		decryptApiKey,
		customFieldIds = {},
	} = args;

	// 1. Resolve the branch's GHL connection
	const link = await controlPanelDb.query.ghlBranchLinks.findFirst({
		where: and(
			eq(ghlBranchLinks.organizationId, organizationId),
			eq(ghlBranchLinks.tenantBranchId, branchNodeId),
			eq(ghlBranchLinks.isActive, true),
		),
	});

	// Defensive runtime check (mirrors the SQL `isActive=true` predicate; also
	// guards against future schema changes that move "active" semantics).
	if (!link || !link.isActive) {
		return { status: "skipped", reason: "branch-not-connected" };
	}

	const apiKey = decryptApiKey(link.ghlApiKey);
	const locationId = link.ghlLocationId;

	// 2. Look up existing contact link for this (customer, branch)
	const existing = await tenantDb.query.ghlContactLinks.findFirst({
		where: and(
			eq(ghlContactLinks.customerProfileId, customerProfile.id),
			eq(ghlContactLinks.branchNodeId, branchNodeId),
		),
	});

	// 3. Dispatch by operation
	try {
		if (operation === "create") {
			const payload = buildContactPayload({
				locationId,
				user,
				profile: customerProfile,
				memberStatus,
				customFieldIds,
			});
			const created = await ghlFetch<GhlContact>({
				method: "POST",
				path: "/contacts/",
				apiKey,
				body: payload,
			});
			await upsertLink({
				tenantDb,
				ghlContactId: created.id,
				userId: user.id,
				customerProfileId: customerProfile.id,
				branchNodeId,
				ghlLocationId: locationId,
				syncStatus: "active",
				lastError: null,
			});
			return { status: "synced", ghlContactId: created.id };
		}

		if (operation === "update") {
			if (!existing) {
				const payload = buildContactPayload({
					locationId,
					user,
					profile: customerProfile,
					memberStatus,
					customFieldIds,
				});
				const created = await ghlFetch<GhlContact>({
					method: "POST",
					path: "/contacts/",
					apiKey,
					body: payload,
				});
				await upsertLink({
					tenantDb,
					ghlContactId: created.id,
					userId: user.id,
					customerProfileId: customerProfile.id,
					branchNodeId,
					ghlLocationId: locationId,
					syncStatus: "active",
					lastError: null,
				});
				return { status: "synced", ghlContactId: created.id };
			}
			const payload = buildContactPayload({
				locationId,
				user,
				profile: customerProfile,
				memberStatus,
				customFieldIds,
			});
			await ghlFetch<GhlContact>({
				method: "PUT",
				path: `/contacts/${existing.ghlContactId}`,
				apiKey,
				body: payload,
			});
			await upsertLink({
				tenantDb,
				ghlContactId: existing.ghlContactId,
				userId: user.id,
				customerProfileId: customerProfile.id,
				branchNodeId,
				ghlLocationId: locationId,
				syncStatus: "active",
				lastError: null,
			});
			return { status: "synced", ghlContactId: existing.ghlContactId };
		}

		// operation === "delete"
		if (!existing) {
			return { status: "skipped", reason: "no-existing-contact-on-update" };
		}
		await ghlFetch<unknown>({
			method: "DELETE",
			path: `/contacts/${existing.ghlContactId}`,
			apiKey,
		});
		await upsertLink({
			tenantDb,
			ghlContactId: existing.ghlContactId,
			userId: user.id,
			customerProfileId: customerProfile.id,
			branchNodeId,
			ghlLocationId: locationId,
			syncStatus: "deleted",
			lastError: null,
		});
		return { status: "synced", ghlContactId: existing.ghlContactId };
	} catch (error) {
		const message =
			error instanceof GhlApiError
				? `${error.code}: ${error.message}`
				: error instanceof Error
					? error.message
					: String(error);
		await upsertLink({
			tenantDb,
			ghlContactId: existing?.ghlContactId ?? "pending",
			userId: user.id,
			customerProfileId: customerProfile.id,
			branchNodeId,
			ghlLocationId: locationId,
			syncStatus: "error",
			lastError: message,
		});
		return { status: "error", error: message };
	}
}

async function upsertLink(args: {
	tenantDb: NeonDatabase<typeof tenantSchema>;
	ghlContactId: string;
	userId: string;
	customerProfileId: string;
	branchNodeId: string;
	ghlLocationId: string;
	syncStatus: "active" | "deleted" | "error";
	lastError: string | null;
}) {
	await args.tenantDb
		.insert(ghlContactLinks)
		.values({
			ghlContactId: args.ghlContactId,
			userId: args.userId,
			customerProfileId: args.customerProfileId,
			branchNodeId: args.branchNodeId,
			ghlLocationId: args.ghlLocationId,
			syncStatus: args.syncStatus,
			lastSyncedAt: new Date(),
			lastError: args.lastError,
		})
		.onConflictDoUpdate({
			target: [
				ghlContactLinks.customerProfileId,
				ghlContactLinks.branchNodeId,
			],
			set: {
				ghlContactId: args.ghlContactId,
				ghlLocationId: args.ghlLocationId,
				syncStatus: args.syncStatus,
				lastSyncedAt: new Date(),
				lastError: args.lastError,
				updatedAt: new Date(),
			},
		});
}
