/**
 * Unit tests for the pure validation helper used by
 * invitations.acceptWithSignup.
 *
 * The procedure itself (Better-Auth signUp/signIn + member create + GHL sync)
 * is integration territory — covered by manual smoke. These tests cover the
 * boundary checks: token validity, email match, status, expiry.
 */

import { describe, expect, test } from "bun:test";
import { validateAcceptanceInput } from "./invitation-acceptance";

const futureDate = (daysFromNow = 7): Date => {
	const d = new Date();
	d.setDate(d.getDate() + daysFromNow);
	return d;
};
const pastDate = (daysAgo = 1): Date => {
	const d = new Date();
	d.setDate(d.getDate() - daysAgo);
	return d;
};

const baseInvitation = {
	id: "inv_1",
	email: "user@example.com",
	role: "client",
	status: "pending",
	expiresAt: futureDate(),
} as const;

describe("validateAcceptanceInput", () => {
	test("ok when token matches a pending invitation and emails align", () => {
		const result = validateAcceptanceInput(baseInvitation, "user@example.com");
		expect(result).toEqual({ ok: true });
	});

	test("fails 'invalid-token' when invitation is null", () => {
		const result = validateAcceptanceInput(null, "user@example.com");
		expect(result).toEqual({ ok: false, error: "invalid-token" });
	});

	test("fails 'email-mismatch' when signup email differs from invitation email", () => {
		const result = validateAcceptanceInput(
			baseInvitation,
			"someone-else@example.com",
		);
		expect(result).toEqual({ ok: false, error: "email-mismatch" });
	});

	test("email comparison is case-insensitive", () => {
		const result = validateAcceptanceInput(baseInvitation, "USER@EXAMPLE.COM");
		expect(result).toEqual({ ok: true });
	});

	test("fails 'expired' when invitation expiresAt is in the past", () => {
		const result = validateAcceptanceInput(
			{ ...baseInvitation, expiresAt: pastDate() },
			"user@example.com",
		);
		expect(result).toEqual({ ok: false, error: "expired" });
	});

	test("fails 'already-accepted' when invitation status is 'accepted'", () => {
		const result = validateAcceptanceInput(
			{ ...baseInvitation, status: "accepted" },
			"user@example.com",
		);
		expect(result).toEqual({ ok: false, error: "already-accepted" });
	});

	test("fails 'declined' when invitation status is 'declined'", () => {
		const result = validateAcceptanceInput(
			{ ...baseInvitation, status: "declined" },
			"user@example.com",
		);
		expect(result).toEqual({ ok: false, error: "declined" });
	});
});
