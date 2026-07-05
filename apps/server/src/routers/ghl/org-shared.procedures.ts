import { protectedProcedure } from "@avantej-core/api";
import { encrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { requirePermission } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getControlPanelDb } from "@/lib/db";
import {
	ensureCustomFieldsExist,
	validateGhlApiKey,
} from "@/services/ghl/setup";
import type { CustomFieldIdMap } from "@/services/ghl/payload-builders";

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

			// Reject if this GHL location is already claimed by another org or by
			// an active branch link — two tenants on one location = cross-tenant
			// data bleed (mirrors the unique index added in migration 0039).
			const claimedByOrg = await controlPanelDb.query.organizations.findFirst({
				where: and(
					eq(organizations.ghlLocationId, input.ghlLocationId),
					ne(organizations.id, input.organizationId),
				),
			});
			if (claimedByOrg) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"That GHL location is already connected to another organization.",
				});
			}
			const claimedByLink = await controlPanelDb.query.ghlBranchLinks.findFirst(
				{
					where: and(
						eq(ghlBranchLinks.ghlLocationId, input.ghlLocationId),
						eq(ghlBranchLinks.isActive, true),
					),
				},
			);
			if (claimedByLink) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"That GHL location is already in use by a per-branch connection.",
				});
			}

			// Capture the resolved field ids so the live sync path can stamp
			// contacts. Discarding this (the previous behavior) meant gender /
			// emergency-contact / etc. were created in GHL but never sent.
			let globalFieldIds: CustomFieldIdMap = {};
			try {
				globalFieldIds = await ensureCustomFieldsExist({
					apiKey: input.ghlApiKey,
					locationId: input.ghlLocationId,
				});
			} catch (error) {
				console.warn("[ghl] custom field bootstrap failed", error);
			}

			// Inbound webhook auth secret. Preserve an existing one on reconnect so
			// we don't invalidate the value the tenant already configured in GHL.
			const existing = await controlPanelDb.query.organizations.findFirst({
				where: eq(organizations.id, input.organizationId),
			});
			const webhookSecret =
				existing?.ghlWebhookSecret ??
				`ghlwh_${crypto.randomUUID().replace(/-/g, "")}${crypto
					.randomUUID()
					.replace(/-/g, "")}`;

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
					// (ghlGlobalFieldMap is safe to overwrite — it's rebuilt every connect.)
					ghlCountryFieldMap: sql`COALESCE(${organizations.ghlCountryFieldMap}, '{}'::jsonb)`,
					ghlGlobalFieldMap: globalFieldIds,
					ghlWebhookSecret: webhookSecret,
					updatedAt: new Date(),
				})
				.where(eq(organizations.id, input.organizationId));

			// Return the secret so the admin can configure GHL's webhook
			// automation to send it (header `x-ghl-webhook-secret` or `?secret=`).
			return { status: "connected" as const, webhookSecret };
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
					// (Global map + webhook secret are safe to clear: both are
					// regenerated on the next connectOrgShared.)
					ghlGlobalFieldMap: null,
					ghlWebhookSecret: null,
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
					ghlRequireApproval: false,
				};
			}

			const map = (org.ghlCountryFieldMap ?? {}) as Record<string, unknown>;
			return {
				ghlLocationId: org.ghlLocationId ?? null,
				ghlSyncModel: org.ghlSyncModel ?? null,
				ghlProvisionedAt: org.ghlProvisionedAt ?? null,
				hasApiKey: !!org.ghlApiKeyEncrypted,
				countryFieldCount: Object.keys(map).length,
				ghlRequireApproval: org.ghlRequireApproval ?? false,
			};
		}),
};
