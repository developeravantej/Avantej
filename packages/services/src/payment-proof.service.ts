import { desc, eq } from "drizzle-orm";
import { paymentProofs } from "@avantej-core/db/schema/tenant/payment-proofs";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

/**
 * Payment-proof metadata service (UAT §7). Storage-agnostic: the file bytes are
 * written to R2 by the procedure layer (which holds the binding); this module
 * owns validation, R2-key derivation, and the `payment_proofs` rows that the
 * admin Approvals flow reads.
 */

/** 10 MB cap — receipts/slips are small; this bounds Worker memory + request size. */
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

/** Accepted proof file types (images + PDF). */
export const ALLOWED_PROOF_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"application/pdf",
] as const;

export class InvalidProofError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidProofError";
	}
}

/** Throw {@link InvalidProofError} if the upload violates type/size rules. */
export function validateProofUpload(input: {
	contentType: string;
	byteSize: number;
}): void {
	if (!ALLOWED_PROOF_TYPES.includes(input.contentType as never)) {
		throw new InvalidProofError(
			`Unsupported file type "${input.contentType}". Allowed: ${ALLOWED_PROOF_TYPES.join(", ")}.`,
		);
	}
	if (input.byteSize <= 0) {
		throw new InvalidProofError("File is empty.");
	}
	if (input.byteSize > MAX_PROOF_BYTES) {
		throw new InvalidProofError(
			`File is too large (${input.byteSize} bytes, max ${MAX_PROOF_BYTES}).`,
		);
	}
}

/** Sanitise a filename to a safe extension-preserving slug for the R2 key. */
function safeFileName(fileName: string): string {
	const cleaned = fileName
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		// Collapse dot-runs so a "../" segment can't leave ".." in the key.
		.replace(/\.{2,}/g, ".")
		.slice(-80);
	return cleaned.length > 0 ? cleaned : "proof";
}

/**
 * Derive the R2 object key. Org + package scoping keeps objects browsable and
 * lets a future lifecycle/cleanup target a tenant or a package. `proofId` makes
 * it collision-free.
 */
export function buildProofKey(args: {
	organizationId: string;
	packageInstanceId: string;
	proofId: string;
	fileName: string;
}): string {
	return `payment-proofs/${args.organizationId}/${args.packageInstanceId}/${args.proofId}-${safeFileName(args.fileName)}`;
}

/** Confirm a package instance exists (so we never store a proof for a bad id). */
export async function packageInstanceExists(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<boolean> {
	const row = await tenantDb.query.packageInstances.findFirst({
		where: eq(packageInstances.id, packageInstanceId),
		columns: { id: true },
	});
	return !!row;
}

export type RecordPaymentProofParams = {
	id: string;
	packageInstanceId: string;
	r2Key: string;
	fileName: string;
	contentType: string;
	byteSize: number;
	uploadedBy: string;
	notes?: string | null;
};

/** Insert the metadata row for an uploaded proof (after the R2 put succeeds). */
export async function recordPaymentProof(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: RecordPaymentProofParams,
): Promise<typeof paymentProofs.$inferSelect> {
	const [row] = await tenantDb
		.insert(paymentProofs)
		.values({
			id: params.id,
			packageInstanceId: params.packageInstanceId,
			r2Key: params.r2Key,
			fileName: params.fileName,
			contentType: params.contentType,
			byteSize: params.byteSize,
			uploadedBy: params.uploadedBy,
			notes: params.notes ?? null,
		})
		.returning();
	if (!row) throw new Error("Failed to record payment proof");
	return row;
}

/** List proofs for a package instance, newest first. */
export async function listPaymentProofs(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<(typeof paymentProofs.$inferSelect)[]> {
	return tenantDb.query.paymentProofs.findMany({
		where: eq(paymentProofs.packageInstanceId, packageInstanceId),
		orderBy: [desc(paymentProofs.uploadedAt)],
	});
}

/** Fetch one proof's metadata (incl. r2Key) for download/streaming. */
export async function getPaymentProofById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof paymentProofs.$inferSelect | null> {
	const row = await tenantDb.query.paymentProofs.findFirst({
		where: eq(paymentProofs.id, id),
	});
	return row ?? null;
}
