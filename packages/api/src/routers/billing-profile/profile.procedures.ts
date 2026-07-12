import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch, requirePermissionOrpc } from "../../guards";
import {
	ALLOWED_LOGO_TYPES,
	MAX_LOGO_BYTES,
	getBillingProfile,
	upsertBillingProfile,
} from "@avantej-core/services";
import {
	base64ToBytes,
	getProofsBucket,
	loadAsDataUrl,
} from "../../lib/r2-bucket";

/**
 * Tenant billing identity (legal name, SSM reg no, document address, footer
 * note, logo) printed on invoices/receipts. Reads follow the
 * organization-settings pattern (tenant + org-match only); writes require
 * organization_settings:update. The logo is stored in the PROOFS_BUCKET R2
 * binding under billing-logo/{orgId} and served back as a data URL.
 */

export const billingProfileProcedures = {
	get: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const profile = await getBillingProfile(context.tenantDb);
			if (!profile) return null;
			let logoDataUrl: string | null = null;
			if (profile.logoKey && profile.logoContentType) {
				try {
					logoDataUrl = await loadAsDataUrl(
						getProofsBucket(context),
						profile.logoKey,
						profile.logoContentType,
					);
				} catch {
					logoDataUrl = null;
				}
			}
			return { ...profile, logoDataUrl };
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				legalName: z.string().max(200).nullable().optional(),
				registrationNo: z.string().max(50).nullable().optional(),
				address: z.string().max(500).nullable().optional(),
				footerNote: z.string().max(1000).nullable().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"organization_settings",
				"update",
			);
			return upsertBillingProfile(context.tenantDb, {
				legalName: input.legalName,
				registrationNo: input.registrationNo,
				address: input.address,
				footerNote: input.footerNote,
			});
		}),

	uploadLogo: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				contentType: z.string(),
				/** Base64 file body (no data: prefix). Length-capped BEFORE decode —
				 * atob materializes the whole payload in Worker memory, so the byte
				 * check alone would decode a multi-MB body just to reject it. */
				data: z
					.string()
					.min(1)
					.max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 4),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"organization_settings",
				"update",
			);

			if (!ALLOWED_LOGO_TYPES.has(input.contentType)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Logo must be a PNG, JPEG, or WebP image.",
				});
			}
			const bytes = base64ToBytes(input.data);
			// Printed documents inline the logo as a data URL on every print-view
			// fetch — keep it small.
			if (bytes.byteLength > MAX_LOGO_BYTES) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB.`,
				});
			}

			const bucket = getProofsBucket(context);
			const key = `billing-logo/${input.organizationId}`;
			await bucket.put(key, bytes, {
				httpMetadata: { contentType: input.contentType },
			});

			return upsertBillingProfile(context.tenantDb, {
				logoKey: key,
				logoContentType: input.contentType,
			});
		}),

	removeLogo: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"organization_settings",
				"update",
			);
			const profile = await getBillingProfile(context.tenantDb);
			if (profile?.logoKey) {
				try {
					await getProofsBucket(context).delete(profile.logoKey);
				} catch {
					// Best-effort object cleanup; clearing the DB pointer is what matters.
				}
			}
			return upsertBillingProfile(context.tenantDb, {
				logoKey: null,
				logoContentType: null,
			});
		}),
};
