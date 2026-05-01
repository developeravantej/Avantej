/**
 * GHL integration oRPC router (server-side).
 *
 * - connectBranch: validates a GHL Private Integration API key against
 *   the supplied locationId, bootstraps required custom fields, then
 *   encrypts and upserts the row in ghl_branch_links.
 * - disconnectBranch: marks ghl_branch_links.is_active = false. Keeps
 *   the row + encrypted key for re-activation; does not delete history.
 *
 * connectBranch hits the live GHL API. Failures during custom-field
 * bootstrap are logged but non-fatal (the connection still completes;
 * basic name/email/phone sync works without custom fields).
 */

import { protectedProcedure } from "@avantej-core/api";
import { encrypt } from "@avantej-core/db";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getControlPanelDb } from "@/lib/db";
import {
	ensureCustomFieldsExist,
	validateGhlApiKey,
} from "@/services/ghl/setup";

export const ghlRouter = {
	connectBranch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				tenantBranchId: z.string().uuid(),
				ghlLocationId: z.string().min(1),
				ghlApiKey: z.string().min(10),
			}),
		)
		.handler(async ({ input, context }) => {
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
			await controlPanelDb
				.insert(ghlBranchLinks)
				.values({
					organizationId: input.organizationId,
					tenantBranchId: input.tenantBranchId,
					ghlLocationId: input.ghlLocationId,
					ghlApiKey: encryptedKey,
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
};
