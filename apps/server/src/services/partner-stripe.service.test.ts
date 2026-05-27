/**
 * Unit tests for partner-stripe.service — pure HMAC/state logic only.
 *
 * Verifies the CSRF-protective state signing + verification primitives match
 * the org-level OAuth flow's behavior: round-trip success, HMAC mismatch
 * rejection, expiry, malformed input handling. No network / Stripe SDK use.
 */
import { describe, expect, it } from "bun:test";
import {
	deriveStripeConnectStatus,
	signPartnerOAuthState,
	verifyPartnerOAuthState,
} from "./partner-stripe.service";

const SECRET = "test-secret-do-not-use-in-prod";

describe("signPartnerOAuthState + verifyPartnerOAuthState — happy path", () => {
	it("round-trip with country recovers orgId + partnerId + country", async () => {
		const state = await signPartnerOAuthState({
			orgId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
			partnerId: "92371eea-56f5-46a7-8bf0-29909ab4cfb9",
			secret: SECRET,
			countryCode: "MY",
		});
		const verified = await verifyPartnerOAuthState(state, SECRET);
		expect(verified).not.toBeNull();
		expect(verified?.orgId).toBe("996febce-aaad-4ded-8f47-02d2b566c8ee");
		expect(verified?.partnerId).toBe("92371eea-56f5-46a7-8bf0-29909ab4cfb9");
		expect(verified?.countryCode).toBe("MY");
	});

	it("round-trip without country recovers null countryCode", async () => {
		const state = await signPartnerOAuthState({
			orgId: "org-1",
			partnerId: "partner-1",
			secret: SECRET,
		});
		const verified = await verifyPartnerOAuthState(state, SECRET);
		expect(verified?.orgId).toBe("org-1");
		expect(verified?.partnerId).toBe("partner-1");
		expect(verified?.countryCode).toBeNull();
	});
});

describe("verifyPartnerOAuthState — rejections", () => {
	it("rejects when signed with a different secret (HMAC mismatch)", async () => {
		const state = await signPartnerOAuthState({
			orgId: "org-1",
			partnerId: "partner-1",
			secret: SECRET,
		});
		const verified = await verifyPartnerOAuthState(state, "different-secret");
		expect(verified).toBeNull();
	});

	it("rejects expired state (older than maxAgeMs)", async () => {
		const state = await signPartnerOAuthState({
			orgId: "org-1",
			partnerId: "partner-1",
			secret: SECRET,
		});
		// Pass maxAgeMs = 0 → any state is "expired" relative to now.
		// (Use 0 instead of waiting; the verify path checks `Date.now() - ts > maxAgeMs`.)
		const verified = await verifyPartnerOAuthState(state, SECRET, 0);
		expect(verified).toBeNull();
	});

	it("rejects malformed base64url input", async () => {
		const verified = await verifyPartnerOAuthState("not-a-valid-state", SECRET);
		expect(verified).toBeNull();
	});

	it("rejects state with fewer than 5 parts (e.g. legacy 4-part org state)", async () => {
		// Synthesize a 4-part state shaped like the legacy org-level OAuth state —
		// it must NOT validate against the partner verifier (different schema).
		const fourPart = Buffer.from("orgA.MY.123.deadbeef").toString("base64url");
		const verified = await verifyPartnerOAuthState(fourPart, SECRET);
		expect(verified).toBeNull();
	});

	it("rejects tampered partnerId (HMAC fails after the swap)", async () => {
		const original = await signPartnerOAuthState({
			orgId: "org-1",
			partnerId: "partner-victim",
			secret: SECRET,
		});
		// Decode, swap the partnerId, re-encode (without re-signing).
		const decoded = Buffer.from(original, "base64url").toString("binary");
		const parts = decoded.split(".");
		parts[1] = "partner-attacker";
		const tampered = Buffer.from(parts.join("."), "binary").toString("base64url");
		const verified = await verifyPartnerOAuthState(tampered, SECRET);
		expect(verified).toBeNull();
	});
});

describe("deriveStripeConnectStatus", () => {
	it("payouts_enabled true → active", () => {
		expect(
			deriveStripeConnectStatus({
				payoutsEnabled: true,
				detailsSubmitted: true,
				requirementsDisabledReason: null,
			}),
		).toBe("active");
	});

	it("payouts_enabled false → pending", () => {
		expect(
			deriveStripeConnectStatus({
				payoutsEnabled: false,
				detailsSubmitted: false,
				requirementsDisabledReason: null,
			}),
		).toBe("pending");
	});

	it("disabled_reason 'rejected.fraud' → rejected", () => {
		expect(
			deriveStripeConnectStatus({
				payoutsEnabled: false,
				detailsSubmitted: true,
				requirementsDisabledReason: "rejected.fraud",
			}),
		).toBe("rejected");
	});

	it("disabled_reason 'requirements.past_due' → restricted", () => {
		expect(
			deriveStripeConnectStatus({
				payoutsEnabled: false,
				detailsSubmitted: true,
				requirementsDisabledReason: "requirements.past_due",
			}),
		).toBe("restricted");
	});
});
