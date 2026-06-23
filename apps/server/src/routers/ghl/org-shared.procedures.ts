import { protectedProcedure } from "@avantej-core/api";
import { encrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { requirePermission } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getControlPanelDb } from "@/lib/db";
import {
	ensureCustomFieldsExist,
	validateGhlApiKey,
} from "@/services/ghl/setup";

export const orgSharedProcedures = {
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

			const valid = await validateGhlApiKey(
				input.ghlApiKey,
				input.ghlLocationId,
			);
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
					// Preserve any existing country→field map on reconnect — the GHL
					// custom fields persist regardless of connect state, so wiping the
					// map here (or on disconnect) would orphan branch country-stamping.
					// COALESCE keeps the existing map; first-time connect initialises {}.
					ghlCountryFieldMap: sql`COALESCE(${organizations.ghlCountryFieldMap}, '{}'::jsonb)`,
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
					// Keep ghlCountryFieldMap intact — the GHL custom fields persist
					// even while disconnected, so the country→field map stays valid for
					// a later reconnect. Wiping it here orphaned branch country-stamping.
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
