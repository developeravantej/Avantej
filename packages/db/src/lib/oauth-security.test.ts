/**
 * Tests for the OAuth-security helpers used by Google Calendar (and any other
 * provider added later). The underlying AES-256-GCM helper is covered by
 * encryption.test.ts — these tests focus on the envelope contract
 * (replay window, tampering rejection, legacy-plaintext fallback).
 *
 * Run with:
 *   ENCRYPTION_KEY=$(openssl rand -hex 32) bun test oauth-security.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	decryptOAuthState,
	decryptToken,
	encryptOAuthState,
	encryptToken,
} from "./oauth-security";

const TEST_KEY =
	"23c13068d7e40921af59305dc8f4e5fecbb1d61894674a4cd0c9dad2365d0f32";

const originalKey = process.env.ENCRYPTION_KEY;

beforeAll(() => {
	process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
	if (originalKey === undefined) {
		delete process.env.ENCRYPTION_KEY;
	} else {
		process.env.ENCRYPTION_KEY = originalKey;
	}
});

describe("encryptOAuthState / decryptOAuthState", () => {
	test("round-trips a payload", () => {
		const payload = { organizationId: "org-1", userId: "user-1" };
		const state = encryptOAuthState(payload);
		const decoded = decryptOAuthState<typeof payload>(state);
		expect(decoded).toEqual(payload);
	});

	test("rejects a tampered state", () => {
		const state = encryptOAuthState({ a: 1 });
		const tampered = `${state.slice(0, -2)}aa`;
		expect(() => decryptOAuthState(tampered)).toThrow("invalid_state");
	});

	test("rejects a malformed state", () => {
		expect(() => decryptOAuthState("not-encrypted")).toThrow("invalid_state");
	});

	test("rejects an expired state", () => {
		// Wind real time forward by mocking Date.now after encryption.
		const realNow = Date.now;
		try {
			const state = encryptOAuthState({ a: 1 });
			Date.now = () => realNow() + 11 * 60 * 1000;
			expect(() => decryptOAuthState(state)).toThrow("state_expired");
		} finally {
			Date.now = realNow;
		}
	});

	test("distinct states for identical payloads (nonce works)", () => {
		const payload = { a: 1 };
		const s1 = encryptOAuthState(payload);
		const s2 = encryptOAuthState(payload);
		expect(s1).not.toEqual(s2);
	});
});

describe("encryptToken / decryptToken", () => {
	test("round-trips a token", () => {
		const t = "ya29.a0AfH6SMBxxxxxxxxxxxx-fake-google-token";
		const enc = encryptToken(t);
		expect(enc.startsWith("enc:v1:")).toBe(true);
		expect(decryptToken(enc)).toBe(t);
	});

	test("returns legacy plaintext rows unchanged (migration safety)", () => {
		const legacy = "ya29.legacyPlaintextToken";
		expect(decryptToken(legacy)).toBe(legacy);
	});

	test("empty strings round-trip without throwing", () => {
		expect(encryptToken("")).toBe("");
		expect(decryptToken("")).toBe("");
	});
});
