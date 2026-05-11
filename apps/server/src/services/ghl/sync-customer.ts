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
 *
 * Phase G: supports two sync models via resolveSyncContext():
 *   - "org-shared" — single GHL sub-account per org, branch encoded as a
 *     SINGLE_OPTIONS custom field on the contact.
 *   - "per-branch" (legacy) — one GHL sub-account per Avantej branch.
 */

import { eq } from "drizzle-orm";
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
import { resolveSyncContext } from "./sync-context";
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
	reason?:
		| "branch-not-connected"
		| "org-shared-not-provisioned"
		| "unknown-sync-model"
		| "no-existing-contact-on-update";
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

	// 1. Resolve sync model + locationId/apiKey (+ branch-stamp in org-shared)
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
	// TODO(phase-g): non-branch custom fields (gender, emergency contact, etc.)
	// currently flow through `customFieldIds` from the caller. In org-shared mode
	// the caller doesn't have a per-branch source for these — they live per
	// GHL location and could be backfilled onto `organizations` or refreshed
	// at sync time via `ensureCustomFieldsExist`. For now we pass through what
	// the caller supplied (default {}); no regression for the legacy path.
	const branchCountryFieldId =
		ctx.model === "org-shared" ? ctx.branchCountryFieldId : null;
	const branchOptionLabel =
		ctx.model === "org-shared" ? ctx.branchOptionLabel : null;

	// GHL contact endpoints wrap the contact in `{ contact: {...} }`.
	const unwrap = (raw: unknown): GhlContact => {
		if (raw && typeof raw === "object" && "contact" in raw) {
			return (raw as { contact: GhlContact }).contact;
		}
		return raw as GhlContact;
	};

	/**
	 * POST /contacts/ but adopt the existing contact id when GHL replies with
	 * 400 "duplicated contacts" — the response body includes meta.contactId.
	 * Returns the id (new or adopted).
	 */
	const createOrAdoptContact = async (
		body: ReturnType<typeof buildContactPayload>,
	): Promise<string> => {
		try {
			const raw = await ghlFetch<unknown>({
				method: "POST",
				path: "/contacts/",
				apiKey,
				body,
			});
			const created = unwrap(raw);
			if (!created?.id) {
				throw new GhlApiError(
					"unknown",
					undefined,
					`GHL POST /contacts/ returned no contact id; raw=${JSON.stringify(raw).slice(0, 200)}`,
				);
			}
			return created.id;
		} catch (e) {
			if (e instanceof GhlApiError && e.httpStatus === 400 && e.responseBody) {
				const rb = e.responseBody as {
					meta?: { contactId?: string };
					message?: string;
				};
				if (rb?.meta?.contactId) {
					console.log(
						"[syncCustomerToGhl] adopting existing GHL contact id =",
						rb.meta.contactId,
					);
					return rb.meta.contactId;
				}
			}
			throw e;
		}
	};

	/** Build PUT payload — GHL rejects `locationId` in PUT body. */
	const stripLocationId = (
		p: ReturnType<typeof buildContactPayload>,
	): Omit<ReturnType<typeof buildContactPayload>, "locationId"> => {
		const { locationId: _, ...rest } = p;
		return rest;
	};

	// 2. Look up existing contact link for this customer.
	// Phase G.5: ghl_contact_links uniq is now (customer_profile_id) only.
	const existing = await tenantDb.query.ghlContactLinks.findFirst({
		where: eq(ghlContactLinks.customerProfileId, customerProfile.id),
	});

	// A 'deleted' link points at a GHL contact that's already gone — treat
	// as no-existing so a follow-up update/create creates a fresh contact.
	const effectiveExisting = existing?.syncStatus === "deleted" ? null : existing;

	// 3. Dispatch by operation
	try {
		const buildPayload = () =>
			buildContactPayload({
				locationId,
				user,
				profile: customerProfile,
				memberStatus,
				customFieldIds,
				branchCountryFieldId,
				branchOptionLabel,
			});

		if (operation === "create") {
			const payload = buildPayload();
			const ghlContactId = await createOrAdoptContact(payload);
			// We may have adopted an existing GHL contact (duplicate email) —
			// If we adopted an existing GHL contact, immediately PUT to apply
			// our payload (the adopted contact may have stale/different fields).
			await ghlFetch<unknown>({
				method: "PUT",
				path: `/contacts/${ghlContactId}`,
				apiKey,
				body: stripLocationId(payload),
			});
			await upsertLink({
				tenantDb,
				ghlContactId,
				userId: user.id,
				customerProfileId: customerProfile.id,
				branchNodeId,
				ghlLocationId: locationId,
				syncStatus: "active",
				lastError: null,
			});
			return { status: "synced", ghlContactId };
		}

		if (operation === "update") {
			if (!effectiveExisting) {
				const payload = buildPayload();
				const ghlContactId = await createOrAdoptContact(payload);
				// If adopted, PUT to apply our payload to the adopted contact.
				await ghlFetch<unknown>({
					method: "PUT",
					path: `/contacts/${ghlContactId}`,
					apiKey,
					body: stripLocationId(payload),
				});
				await upsertLink({
					tenantDb,
					ghlContactId,
					userId: user.id,
					customerProfileId: customerProfile.id,
					branchNodeId,
					ghlLocationId: locationId,
					syncStatus: "active",
					lastError: null,
				});
				return { status: "synced", ghlContactId };
			}
			const payload = buildPayload();
			await ghlFetch<unknown>({
				method: "PUT",
				path: `/contacts/${effectiveExisting.ghlContactId}`,
				apiKey,
				body: stripLocationId(payload),
			});
			await upsertLink({
				tenantDb,
				ghlContactId: effectiveExisting.ghlContactId,
				userId: user.id,
				customerProfileId: customerProfile.id,
				branchNodeId,
				ghlLocationId: locationId,
				syncStatus: "active",
				lastError: null,
			});
			return { status: "synced", ghlContactId: effectiveExisting.ghlContactId };
		}

		// operation === "delete"
		if (!effectiveExisting) {
			return { status: "skipped", reason: "no-existing-contact-on-update" };
		}
		await ghlFetch<unknown>({
			method: "DELETE",
			path: `/contacts/${effectiveExisting.ghlContactId}`,
			apiKey,
		});
		await upsertLink({
			tenantDb,
			ghlContactId: effectiveExisting.ghlContactId,
			userId: user.id,
			customerProfileId: customerProfile.id,
			branchNodeId,
			ghlLocationId: locationId,
			syncStatus: "deleted",
			lastError: null,
		});
		return { status: "synced", ghlContactId: effectiveExisting.ghlContactId };
	} catch (error) {
		const message =
			error instanceof GhlApiError
				? `${error.code}: ${error.message}`
				: error instanceof Error
					? error.message
					: String(error);
		// Only persist failure to ghl_contact_links when we have a REAL existing
		// ghlContactId — writing a "pending" placeholder breaks subsequent attempts
		// because the orchestrator would try to PUT /contacts/pending on retry.
		if (effectiveExisting?.ghlContactId) {
			await upsertLink({
				tenantDb,
				ghlContactId: effectiveExisting.ghlContactId,
				userId: user.id,
				customerProfileId: customerProfile.id,
				branchNodeId,
				ghlLocationId: locationId,
				syncStatus: "error",
				lastError: message,
			});
		} else {
			// No prior link (or link was deleted) — log + return; user can re-trigger by saving again.
			console.error(
				`[syncCustomerToGhl] create failed for customerProfile=${customerProfile.id}: ${message}`,
			);
		}
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
			// Phase G.5: uniq is single-column (customer_profile_id).
			target: [ghlContactLinks.customerProfileId],
			set: {
				ghlContactId: args.ghlContactId,
				ghlLocationId: args.ghlLocationId,
				branchNodeId: args.branchNodeId,
				syncStatus: args.syncStatus,
				lastSyncedAt: new Date(),
				lastError: args.lastError,
				updatedAt: new Date(),
			},
		});
}
