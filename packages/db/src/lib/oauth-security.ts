/**
 * OAuth Security Helpers
 *
 * Provides:
 *  - encryptOAuthState / decryptOAuthState: replay-resistant signed-state for
 *    OAuth flows (Google Calendar, Stripe Connect, etc). Wraps the existing
 *    AES-256-GCM helper — the GCM auth-tag is what gives us the integrity
 *    guarantee a separate HMAC would otherwise provide.
 *
 *  - encryptToken / decryptToken: OAuth access/refresh tokens at rest. Uses
 *    the same AES-256-GCM helper. Recognises legacy plaintext rows (no
 *    "enc:v1:" prefix) and returns them unchanged so existing connections
 *    keep working until the user reconnects.
 *
 * All cryptography goes through `encrypt()` / `decrypt()` from ./encryption,
 * which requires the ENCRYPTION_KEY env var.
 */

import { decrypt, encrypt } from "./encryption";

const TOKEN_PREFIX = "enc:v1:";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

/**
 * Wraps an OAuth-state payload in an authenticated envelope with a nonce
 * and issued-at timestamp. The output is suitable for use as the `state`
 * query parameter on an OAuth initiate URL.
 */
export function encryptOAuthState<T extends object>(payload: T): string {
	const envelope = {
		v: 1,
		iat: Date.now(),
		nonce: crypto.randomUUID(),
		payload,
	};
	return encrypt(JSON.stringify(envelope));
}

/**
 * Verifies and unwraps an OAuth state created by encryptOAuthState. Throws on
 * tampering, malformed input, or expiry beyond STATE_TTL_MS.
 */
export function decryptOAuthState<T extends object>(stateParam: string): T {
	let plaintext: string;
	try {
		plaintext = decrypt(stateParam);
	} catch {
		throw new Error("invalid_state");
	}

	let envelope: { v?: number; iat?: number; nonce?: string; payload?: T };
	try {
		envelope = JSON.parse(plaintext);
	} catch {
		throw new Error("invalid_state");
	}

	if (envelope.v !== 1 || !envelope.iat || !envelope.payload) {
		throw new Error("invalid_state");
	}
	if (Date.now() - envelope.iat > STATE_TTL_MS) {
		throw new Error("state_expired");
	}
	return envelope.payload;
}

// ---------------------------------------------------------------------------
// Tokens at rest
// ---------------------------------------------------------------------------

/**
 * Encrypts an OAuth token (access or refresh) for storage. Output is prefixed
 * with "enc:v1:" so legacy plaintext rows are distinguishable on read.
 */
export function encryptToken(token: string): string {
	if (!token) return "";
	return TOKEN_PREFIX + encrypt(token);
}

/**
 * Returns the plaintext token. If the stored value lacks the "enc:v1:" prefix
 * it is assumed to be a legacy unencrypted row from before the at-rest
 * encryption rollout — these are returned unchanged so existing Google
 * Calendar connections keep functioning until rotated.
 */
export function decryptToken(stored: string): string {
	if (!stored) return "";
	if (!stored.startsWith(TOKEN_PREFIX)) {
		// Legacy plaintext — pre-Phase-8.8 row. Return as-is.
		return stored;
	}
	return decrypt(stored.slice(TOKEN_PREFIX.length));
}
