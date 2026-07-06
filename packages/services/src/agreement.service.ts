import { and, eq, isNull } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

/**
 * Package-agreement (UAT §2). The agreement is rendered on demand from the
 * package instance + its service — no separate document blob is stored. The
 * customer's e-signature is captured into the existing `package_instances`
 * columns: `e_signature` (a JSON envelope, see {@link encodeSignature}) and
 * `terms_agreed_at` (the signing timestamp). Re-generating the PDF with the
 * stored signature reproduces the signed agreement deterministically.
 */

/** Structured signature stored (JSON-encoded) in `package_instances.e_signature`. */
export type SignatureEnvelope = {
	/** Typed legal name of the signer. Always present. */
	signedName: string;
	/** Optional drawn-signature image as a data URL (`data:image/png;base64,...`). */
	signatureDataUrl?: string;
};

/** Data needed to render an agreement PDF and show its signed state. */
export type PackageAgreement = {
	packageInstanceId: string;
	serviceName: string;
	customerName: string;
	totalPrice: number | null;
	taxAmount: number | null;
	creditsTotal: number;
	startsAt: Date;
	expiresAt: Date;
	purchaseNumber: string | null;
	/** Decoded signature, or null when not yet signed. */
	signature: SignatureEnvelope | null;
	signedAt: Date | null;
};

/** Encode a signature envelope for storage in the `e_signature` text column. */
export function encodeSignature(sig: SignatureEnvelope): string {
	return JSON.stringify(sig);
}

/**
 * Decode the `e_signature` column. Tolerates legacy/plain-string values (older
 * rows may have stored just a name or a raw data URL) by wrapping them as a
 * typed-name signature so callers always get a structured shape.
 */
export function decodeSignature(raw: string | null): SignatureEnvelope | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			parsed &&
			typeof parsed === "object" &&
			typeof (parsed as SignatureEnvelope).signedName === "string"
		) {
			return parsed as SignatureEnvelope;
		}
	} catch {
		// Not JSON — fall through to legacy handling.
	}
	return { signedName: raw };
}

/** Fetch the agreement view-model for a package instance, or null if missing. */
export async function getPackageAgreement(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<PackageAgreement | null> {
	const [row] = await tenantDb
		.select({
			id: packageInstances.id,
			serviceName: services.name,
			customerName: packageInstances.customerName,
			totalPrice: packageInstances.totalPrice,
			taxAmount: packageInstances.taxAmount,
			creditsTotal: packageInstances.creditsTotal,
			startsAt: packageInstances.startsAt,
			expiresAt: packageInstances.expiresAt,
			purchaseNumber: packageInstances.purchaseNumber,
			eSignature: packageInstances.eSignature,
			termsAgreedAt: packageInstances.termsAgreedAt,
		})
		.from(packageInstances)
		.innerJoin(services, eq(packageInstances.serviceId, services.id))
		.where(eq(packageInstances.id, packageInstanceId))
		.limit(1);

	if (!row) return null;

	return {
		packageInstanceId: row.id,
		serviceName: row.serviceName,
		customerName: row.customerName ?? "Customer",
		totalPrice: row.totalPrice,
		taxAmount: row.taxAmount,
		creditsTotal: row.creditsTotal,
		startsAt: row.startsAt,
		expiresAt: row.expiresAt,
		purchaseNumber: row.purchaseNumber,
		signature: decodeSignature(row.eSignature),
		signedAt: row.termsAgreedAt,
	};
}

export class AgreementAlreadySignedError extends Error {
	constructor(packageInstanceId: string) {
		super(`Agreement for package ${packageInstanceId} is already signed`);
		this.name = "AgreementAlreadySignedError";
	}
}

/**
 * Persist the customer's e-signature on the package instance and stamp
 * `terms_agreed_at`. Blocks re-signing an already-signed agreement (throws
 * {@link AgreementAlreadySignedError}) so a signed contract is immutable. The
 * caller maps that to a typed CONFLICT.
 */
export async function signPackageAgreement(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
	signature: SignatureEnvelope,
	signedAt: Date = new Date(),
): Promise<PackageAgreement> {
	const existing = await getPackageAgreement(tenantDb, packageInstanceId);
	if (!existing) {
		throw new Error(`Package instance not found: ${packageInstanceId}`);
	}
	// Fast-path rejection for an already-signed agreement (friendly error before
	// touching the DB). The real guard is the conditional UPDATE below — between
	// this read and the write a concurrent sign could land, so the immutability
	// invariant must be enforced atomically, not by this check alone.
	if (existing.signedAt) {
		throw new AgreementAlreadySignedError(packageInstanceId);
	}

	// Atomic compare-and-set: only sign if still unsigned. If a concurrent request
	// signed first, 0 rows match and we treat it as already-signed (closes the
	// TOCTOU between the read above and this update).
	const result = await tenantDb
		.update(packageInstances)
		.set({
			eSignature: encodeSignature(signature),
			termsAgreedAt: signedAt,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(packageInstances.id, packageInstanceId),
				isNull(packageInstances.termsAgreedAt),
			),
		);

	if ((result.rowCount ?? 0) === 0) {
		throw new AgreementAlreadySignedError(packageInstanceId);
	}

	return {
		...existing,
		signature,
		signedAt,
	};
}
