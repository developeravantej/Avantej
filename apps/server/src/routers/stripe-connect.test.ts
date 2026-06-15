/**
 * Stripe Connect Router — Unit Tests (OAuth state HMAC)
 *
 * Tests sign/verify round-trips, country encoding, tampering rejection,
 * expiry, and legacy 3-part state compatibility. Uses Web Crypto (no node
 * polyfills) — matches the runtime path on Cloudflare Workers.
 *
 * Run: bun test src/routers/stripe-connect.test.ts
 */

import { describe, expect, test } from "bun:test";
import { signOAuthState, verifyOAuthState } from "./stripe-connect";

const SECRET = "test-secret-do-not-use-in-prod-min-32-chars-abcdefgh";
const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

describe("OAuth state sign/verify", () => {
	test("round-trips orgId without countryCode (legacy / single-acct flow)", async () => {
		const state = await signOAuthState(ORG_ID, SECRET);
		const verified = await verifyOAuthState(state, SECRET);
		expect(verified).not.toBeNull();
		expect(verified?.orgId).toBe(ORG_ID);
		expect(verified?.countryCode).toBe(null);
	});

	test("round-trips orgId WITH countryCode (Phase 4.3 per-country flow)", async () => {
		const state = await signOAuthState(ORG_ID, SECRET, "SG");
		const verified = await verifyOAuthState(state, SECRET);
		expect(verified?.orgId).toBe(ORG_ID);
		expect(verified?.countryCode).toBe("SG");
	});

	test("uppercases countryCode regardless of input case", async () => {
		const state = await signOAuthState(ORG_ID, SECRET, "th");
		const verified = await verifyOAuthState(state, SECRET);
		expect(verified?.countryCode).toBe("TH");
	});

	test("rejects tampered state (HMAC mismatch)", async () => {
		const state = await signOAuthState(ORG_ID, SECRET, "MY");
		// Flip a character in the middle of the base64url.
		const mid = Math.floor(state.length / 2);
		const tampered =
			state.slice(0, mid) +
			(state[mid] === "A" ? "B" : "A") +
			state.slice(mid + 1);
		expect(await verifyOAuthState(tampered, SECRET)).toBeNull();
	});

	test("rejects state signed with a different secret", async () => {
		const state = await signOAuthState(ORG_ID, SECRET, "MY");
		const verified = await verifyOAuthState(
			state,
			"different-secret-different-secret-different",
		);
		expect(verified).toBeNull();
	});

	test("rejects expired state", async () => {
		const state = await signOAuthState(ORG_ID, SECRET, "MY");
		// Negative maxAge guarantees expiry regardless of clock granularity
		// (Date.now() - ts >= 0 > -1 is always true).
		const verified = await verifyOAuthState(state, SECRET, -1);
		expect(verified).toBeNull();
	});

	test("rejects malformed state (not base64url / not 3-4 parts)", async () => {
		expect(await verifyOAuthState("not-valid-state", SECRET)).toBeNull();
		expect(await verifyOAuthState("", SECRET)).toBeNull();
		expect(await verifyOAuthState("a.b", SECRET)).toBeNull();
	});

	test("accepts legacy 3-part state (no country) for backwards compat", async () => {
		// Manually construct a legacy 3-part state: orgId.ts.hmac.
		const ts = Date.now().toString();
		const payload = `${ORG_ID}.${ts}`;
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(SECRET),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const sigBuf = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(payload),
		);
		const bytes = new Uint8Array(sigBuf);
		let sigHex = "";
		for (let i = 0; i < bytes.length; i++) {
			sigHex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
		}
		const b64 = btoa(`${payload}.${sigHex}`);
		const legacyState = b64
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");

		const verified = await verifyOAuthState(legacyState, SECRET);
		expect(verified?.orgId).toBe(ORG_ID);
		expect(verified?.countryCode).toBe(null);
	});

	test("country round-trips for all Phase 4.3 supported countries", async () => {
		const countries = [
			"MY",
			"SG",
			"TH",
			"ID",
			"PH",
			"HK",
			"AU",
			"NZ",
			"US",
			"GB",
			"JP",
		];
		for (const c of countries) {
			const state = await signOAuthState(ORG_ID, SECRET, c);
			const verified = await verifyOAuthState(state, SECRET);
			expect(verified?.countryCode).toBe(c);
		}
	});
});
