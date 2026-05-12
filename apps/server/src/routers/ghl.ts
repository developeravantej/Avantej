/**
 * GHL integration oRPC router (server-side).
 *
 * - connectBranch: validates a GHL Private Integration API key against
 *   the supplied locationId, bootstraps required custom fields, then
 *   encrypts and upserts the row in ghl_branch_links.
 * - disconnectBranch: marks ghl_branch_links.is_active = false. Keeps
 *   the row + encrypted key for re-activation; does not delete history.
 * - listBranchLinks: read-only listing per organization, with errorCount
 *   per branch (count of ghl_contact_links rows in error state).
 * - retryFailedSyncs: re-fires syncCustomerToGhl for every errored link
 *   on a branch, capped at 50 rows per call.
 *
 * connectBranch + disconnectBranch are gated by user_management:update
 * (matches the route guard on the admin page).
 *
 * connectBranch hits the live GHL API. Failures during custom-field
 * bootstrap are logged but non-fatal (the connection still completes;
 * basic name/email/phone sync works without custom fields).
 */

import { protectedProcedure } from "@avantej-core/api";
import { decrypt, encrypt } from "@avantej-core/db";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { members } from "@avantej-core/db/schema/tenant/members";
import { requirePermission } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getControlPanelDb } from "@/lib/db";
import {
	ensureCustomFieldsExist,
	validateGhlApiKey,
} from "@/services/ghl/setup";
import { syncCustomerToGhl } from "@/services/ghl/sync-customer";

export const ghlRouter = {
	connectBranch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				tenantBranchId: z.string().uuid(),
				ghlLocationId: z.string().min(1),
				ghlApiKey: z.string().min(10),
				existingBranchCustomFieldId: z
					.string()
					.trim()
					.min(1)
					.optional()
					.nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);

			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}

			// 1. Validate the API key works for the locationId
			const valid = await validateGhlApiKey(input.ghlApiKey, input.ghlLocationId);
			if (!valid) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"GHL API key is invalid or does not belong to that locationId. Double-check the values.",
				});
			}

			// 2. Bootstrap custom fields (idempotent — non-fatal on failure)
			try {
				await ensureCustomFieldsExist({
					apiKey: input.ghlApiKey,
					locationId: input.ghlLocationId,
				});
			} catch (error) {
				console.warn("[ghl] custom field bootstrap failed", error);
			}

			// 3. Encrypt + upsert the link
			const encryptedKey = encrypt(input.ghlApiKey);
			const normalizedFieldId = input.existingBranchCustomFieldId ?? null;
			await controlPanelDb
				.insert(ghlBranchLinks)
				.values({
					organizationId: input.organizationId,
					tenantBranchId: input.tenantBranchId,
					ghlLocationId: input.ghlLocationId,
					ghlApiKey: encryptedKey,
					existingBranchCustomFieldId: normalizedFieldId,
					isActive: true,
				})
				.onConflictDoUpdate({
					target: [
						ghlBranchLinks.organizationId,
						ghlBranchLinks.tenantBranchId,
					],
					set: {
						ghlLocationId: input.ghlLocationId,
						ghlApiKey: encryptedKey,
						existingBranchCustomFieldId: normalizedFieldId,
						isActive: true,
						updatedAt: new Date(),
					},
				});
			return { status: "connected" as const };
		}),

	disconnectBranch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				tenantBranchId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);

			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}
			await controlPanelDb
				.update(ghlBranchLinks)
				.set({ isActive: false, updatedAt: new Date() })
				.where(
					and(
						eq(ghlBranchLinks.organizationId, input.organizationId),
						eq(ghlBranchLinks.tenantBranchId, input.tenantBranchId),
					),
				);
			return { status: "disconnected" as const };
		}),

	listBranchLinks: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}

			const rows = await controlPanelDb
				.select({
					id: ghlBranchLinks.id,
					tenantBranchId: ghlBranchLinks.tenantBranchId,
					ghlLocationId: ghlBranchLinks.ghlLocationId,
					existingBranchCustomFieldId:
						ghlBranchLinks.existingBranchCustomFieldId,
					isActive: ghlBranchLinks.isActive,
					createdAt: ghlBranchLinks.createdAt,
					updatedAt: ghlBranchLinks.updatedAt,
				})
				.from(ghlBranchLinks)
				.where(eq(ghlBranchLinks.organizationId, input.organizationId));

			// Cross-DB error count: rows come from control panel; counts come
			// from tenant DB (per-org). One grouped query, then merge.
			const tenantDb = context.tenantDb;
			let errorCounts: Map<string, number> = new Map();
			if (tenantDb && rows.length > 0) {
				const errorRows = await tenantDb
					.select({
						branchNodeId: ghlContactLinks.branchNodeId,
						n: count(),
					})
					.from(ghlContactLinks)
					.where(eq(ghlContactLinks.syncStatus, "error"))
					.groupBy(ghlContactLinks.branchNodeId);
				errorCounts = new Map(
					errorRows.map((r: { branchNodeId: string; n: number }) => [r.branchNodeId, Number(r.n)]),
				);
			}

			return rows.map((r) => ({
				...r,
				errorCount: errorCounts.get(r.tenantBranchId) ?? 0,
			}));
		}),

	retryFailedSyncs: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				tenantBranchId: z.string().uuid(),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);

			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}

			// Resolve branch link (must be active to retry)
			const link = await controlPanelDb.query.ghlBranchLinks.findFirst({
				where: and(
					eq(ghlBranchLinks.organizationId, input.organizationId),
					eq(ghlBranchLinks.tenantBranchId, input.tenantBranchId),
					eq(ghlBranchLinks.isActive, true),
				),
			});
			if (!link) {
				throw new ORPCError("NOT_FOUND", {
					message: "Branch is not connected to GHL",
				});
			}

			// Fetch errored contact links (cap 50 per call)
			const tenantDb = context.tenantDb;
			const errored = await tenantDb
				.select()
				.from(ghlContactLinks)
				.where(
					and(
						eq(ghlContactLinks.branchNodeId, input.tenantBranchId),
						eq(ghlContactLinks.syncStatus, "error"),
					),
				)
				.limit(input.limit);

			let recovered = 0;
			let stillFailing = 0;

			for (const row of errored) {
				if (!row.customerProfileId) {
					stillFailing++;
					continue;
				}
				const profile = await tenantDb.query.customerProfiles.findFirst({
					where: eq(customerProfiles.id, row.customerProfileId),
				});
				const userRecord = (
					await controlPanelDb
						.select()
						.from(userTable)
						.where(eq(userTable.id, row.userId))
						.limit(1)
				)[0];
				const member = await tenantDb.query.members.findFirst({
					where: and(
						eq(members.userId, row.userId),
						eq(members.role, "client"),
					),
				});
				if (!profile || !userRecord || !member) {
					stillFailing++;
					continue;
				}

				const result = await syncCustomerToGhl({
					controlPanelDb,
					tenantDb,
					organizationId: input.organizationId,
					branchNodeId: input.tenantBranchId,
					customerProfile: {
						id: profile.id,
						userId: profile.userId,
						phone: profile.phone ?? null,
						dateOfBirth: profile.dateOfBirth ?? null,
						gender: profile.gender ?? null,
						address: profile.address ?? null,
						emergencyContactName: profile.emergencyContactName ?? null,
						emergencyContactPhone: profile.emergencyContactPhone ?? null,
						medicalNotes: profile.medicalNotes ?? null,
						fitnessGoals: profile.fitnessGoals ?? null,
						creditPoints: profile.creditPoints ?? 0,
						notes: profile.notes ?? null,
						isDeleted: profile.isDeleted ?? false,
						deletedAt: profile.deletedAt ?? null,
						deletedSource: profile.deletedSource ?? null,
					},
					user: {
						id: userRecord.id,
						email: userRecord.email,
						firstName: userRecord.firstName,
						lastName: userRecord.lastName,
						name: userRecord.name,
					},
					memberStatus: member.status === "active" ? "active" : "inactive",
					operation: "update",
					decryptApiKey: decrypt,
				});

				if (result.status === "synced") recovered++;
				else stillFailing++;
			}

			return {
				attempted: errored.length,
				recovered,
				stillFailing,
				cappedAt: input.limit,
			};
		}),

	// ── Phase G.2: Org-shared GHL connection ───────────────────────────────
	// One GHL sub-account per Avantej org; branches differentiated via
	// per-country SINGLE_OPTIONS custom field on contacts/users. Lives on
	// the `organizations` row (not ghl_branch_links).
	connectOrgShared: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				ghlLocationId: z.string().min(1),
				ghlApiKey: z.string().min(10),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);

			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}

			const valid = await validateGhlApiKey(input.ghlApiKey, input.ghlLocationId);
			if (!valid) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"GHL API key is invalid or does not belong to that locationId. Double-check the values.",
				});
			}

			try {
				await ensureCustomFieldsExist({
					apiKey: input.ghlApiKey,
					locationId: input.ghlLocationId,
				});
			} catch (error) {
				console.warn("[ghl] custom field bootstrap failed", error);
			}

			const encryptedKey = encrypt(input.ghlApiKey);
			await controlPanelDb
				.update(organizations)
				.set({
					ghlLocationId: input.ghlLocationId,
					ghlApiKeyEncrypted: encryptedKey,
					ghlProvisionedAt: new Date(),
					ghlSyncModel: "org-shared",
					ghlCountryFieldMap: {},
					updatedAt: new Date(),
				})
				.where(eq(organizations.id, input.organizationId));

			return { status: "connected" as const };
		}),

	disconnectOrgShared: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);

			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}

			await controlPanelDb
				.update(organizations)
				.set({
					ghlLocationId: null,
					ghlApiKeyEncrypted: null,
					ghlCountryFieldMap: null,
					ghlSyncModel: "per-branch",
					updatedAt: new Date(),
				})
				.where(eq(organizations.id, input.organizationId));

			return { status: "disconnected" as const };
		}),

	getOrgShared: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}

			const org = await controlPanelDb.query.organizations.findFirst({
				where: eq(organizations.id, input.organizationId),
			});

			if (!org) {
				return {
					ghlLocationId: null as string | null,
					ghlSyncModel: null as string | null,
					ghlProvisionedAt: null as Date | null,
					hasApiKey: false,
					countryFieldCount: 0,
				};
			}

			const map = (org.ghlCountryFieldMap ?? {}) as Record<string, unknown>;
			return {
				ghlLocationId: org.ghlLocationId ?? null,
				ghlSyncModel: org.ghlSyncModel ?? null,
				ghlProvisionedAt: org.ghlProvisionedAt ?? null,
				hasApiKey: !!org.ghlApiKeyEncrypted,
				countryFieldCount: Object.keys(map).length,
			};
		}),
};
