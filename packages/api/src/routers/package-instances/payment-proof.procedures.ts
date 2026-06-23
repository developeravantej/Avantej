import {
	InvalidProofError,
	buildProofKey,
	getPaymentProofById,
	listPaymentProofs,
	packageInstanceExists,
	recordPaymentProof,
	validateProofUpload,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	requirePermissionOrpc,
} from "../../guards";

/**
 * Offline payment-proof procedures (UAT §7). Files are stored in R2
 * (binding PROOFS_BUCKET) and recorded in `payment_proofs`. Staff upload a proof
 * against a package awaiting payment; an admin views it on the Approvals flow and
 * then confirms payment (existing `confirmPayment`) to activate the package.
 *
 * Transport: base64 through oRPC (reuses tenant/auth/permission guards; receipts
 * are small, well under the 10 MB cap). The R2 binding is reached via the Hono
 * context's `env` — see {@link getBucket}.
 */

/** Minimal R2 surface used here (avoids depending on @cloudflare/workers-types). */
type R2Like = {
	put: (
		key: string,
		value: ArrayBuffer | Uint8Array,
		opts?: { httpMetadata?: { contentType?: string } },
	) => Promise<unknown>;
	get: (
		key: string,
	) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>;
	delete: (key: string) => Promise<void>;
};

function getBucket(context: { honoContext?: unknown }): R2Like {
	const env = (
		context.honoContext as { env?: Record<string, unknown> } | undefined
	)?.env;
	const bucket = env?.PROOFS_BUCKET as R2Like | undefined;
	if (!bucket) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message:
				"Payment-proof storage is not configured (PROOFS_BUCKET binding missing).",
		});
	}
	return bucket;
}

function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++)
		binary += String.fromCharCode(bytes[i] as number);
	return btoa(binary);
}

export const packageInstancesPaymentProofProcedures = {
	uploadPaymentProof: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				fileName: z.string().trim().min(1).max(200),
				contentType: z.string().min(1).max(100),
				// base64-encoded bytes (~13.4M chars for the 10 MB cap; +slack).
				dataBase64: z.string().min(1).max(14_500_000),
				notes: z.string().max(500).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);

			const uploadedBy = context.session?.user?.id;
			if (!uploadedBy) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Session user ID is required to upload a payment proof",
				});
			}

			if (
				!(await packageInstanceExists(
					context.tenantDb,
					input.packageInstanceId,
				))
			) {
				throw new ORPCError("NOT_FOUND", {
					message: `Package not found: ${input.packageInstanceId}`,
				});
			}

			const bytes = base64ToBytes(input.dataBase64);
			try {
				validateProofUpload({
					contentType: input.contentType,
					byteSize: bytes.byteLength,
				});
			} catch (err) {
				if (err instanceof InvalidProofError) {
					throw new ORPCError("BAD_REQUEST", { message: err.message });
				}
				throw err;
			}

			const proofId = crypto.randomUUID();
			const r2Key = buildProofKey({
				organizationId: input.organizationId,
				packageInstanceId: input.packageInstanceId,
				proofId,
				fileName: input.fileName,
			});

			// Store bytes first; only record metadata once the object exists.
			const bucket = getBucket(context);
			await bucket.put(r2Key, bytes, {
				httpMetadata: { contentType: input.contentType },
			});

			return recordPaymentProof(context.tenantDb, {
				id: proofId,
				packageInstanceId: input.packageInstanceId,
				r2Key,
				fileName: input.fileName,
				contentType: input.contentType,
				byteSize: bytes.byteLength,
				uploadedBy,
				notes: input.notes,
			});
		}),

	listPaymentProofs: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);
			return listPaymentProofs(context.tenantDb, input.packageInstanceId);
		}),

	downloadPaymentProof: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				proofId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			const proof = await getPaymentProofById(context.tenantDb, input.proofId);
			if (!proof) {
				throw new ORPCError("NOT_FOUND", {
					message: `Payment proof not found: ${input.proofId}`,
				});
			}

			const bucket = getBucket(context);
			const obj = await bucket.get(proof.r2Key);
			if (!obj) {
				throw new ORPCError("NOT_FOUND", {
					message: "Stored file is missing from object storage.",
				});
			}
			const bytes = new Uint8Array(await obj.arrayBuffer());
			return {
				fileName: proof.fileName,
				contentType: proof.contentType,
				dataBase64: bytesToBase64(bytes),
			};
		}),
};
