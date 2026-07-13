import { ORPCError } from "@orpc/server";

/**
 * Minimal R2 surface shared by payment-proof and billing-logo procedures
 * (avoids depending on @cloudflare/workers-types). The binding is reached via
 * the Hono context's `env`. Content types are NOT recoverable from `get()` —
 * callers must persist them in the DB alongside the object key.
 */
export type R2Like = {
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

export function getProofsBucket(context: { honoContext?: unknown }): R2Like {
	const env = (
		context.honoContext as { env?: Record<string, unknown> } | undefined
	)?.env;
	const bucket = env?.PROOFS_BUCKET as R2Like | undefined;
	if (!bucket) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message:
				"File storage is not configured (PROOFS_BUCKET binding missing).",
		});
	}
	return bucket;
}

export function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++)
		binary += String.fromCharCode(bytes[i] as number);
	return btoa(binary);
}

/** Load an R2 object as a `data:` URL, or null when key/object is absent. */
export async function loadAsDataUrl(
	bucket: R2Like,
	key: string | null | undefined,
	contentType: string | null | undefined,
): Promise<string | null> {
	if (!key || !contentType) return null;
	const obj = await bucket.get(key);
	if (!obj) return null;
	const bytes = new Uint8Array(await obj.arrayBuffer());
	return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}
