import { describe, test, expect } from "bun:test";
import {
	PUBLIC_TENANT_ENDPOINT_SUFFIXES,
	matchesPublicTenantEndpoint,
} from "../../../middleware/public-endpoints";

/**
 * Locks in the public-endpoint set that orpc-tenant.middleware uses to decide
 * which oRPC calls may set up a tenant DB WITHOUT a pre-existing member/session.
 *
 * This is the behavior-preservation guard for the middleware's public-endpoint
 * consolidation: it must keep EXACTLY the same set public — no narrowing
 * (breaks onboarding) and no widening (auth leak). The matcher must accept both
 * path form ("/rpc/invitations/accept") and method form ("invitations.accept"),
 * and — critically — keep matching "invitations.acceptWithSignup" via substring.
 */
describe("matchesPublicTenantEndpoint", () => {
	describe("public endpoints — method form (dot-delimited)", () => {
		const methods = [
			"invitations.getByToken",
			"invitations.accept",
			"invitations.verifyEmailByToken",
			"registration.complete",
		];
		for (const m of methods) {
			test(`matches method "${m}"`, () => {
				expect(matchesPublicTenantEndpoint(m)).toBe(true);
			});
		}
	});

	describe("public endpoints — method form (slash-delimited)", () => {
		const methods = [
			"invitations/getByToken",
			"invitations/accept",
			"invitations/verifyEmailByToken",
			"registration/complete",
		];
		for (const m of methods) {
			test(`matches method "${m}"`, () => {
				expect(matchesPublicTenantEndpoint(m)).toBe(true);
			});
		}
	});

	describe("public endpoints — request path form", () => {
		const paths = [
			"/rpc/invitations/getByToken",
			"/rpc/invitations/accept",
			"/rpc/invitations/verifyEmailByToken",
			"/rpc/registration/complete",
		];
		for (const p of paths) {
			test(`matches path "${p}"`, () => {
				expect(matchesPublicTenantEndpoint(p)).toBe(true);
			});
		}
	});

	test("CRITICAL: acceptWithSignup stays public via substring match", () => {
		// Self-signup invite acceptance is public by construction but is NOT in
		// the explicit suffix list — it works only because substring matching of
		// "invitations/accept" covers it. Tightening to exact equality would
		// silently break self-signup. This test fails loudly if that regresses.
		expect(matchesPublicTenantEndpoint("invitations.acceptWithSignup")).toBe(
			true,
		);
		expect(
			matchesPublicTenantEndpoint("/rpc/invitations/acceptWithSignup"),
		).toBe(true);
	});

	describe("non-public endpoints are rejected", () => {
		const nonPublic = [
			"members.list",
			"pos.createSale",
			"invitations.create", // creating an invite is NOT public
			"invitations.list",
			"registration.start", // only registration.complete is public
			"appointments.schedule",
		];
		for (const m of nonPublic) {
			test(`rejects "${m}"`, () => {
				expect(matchesPublicTenantEndpoint(m)).toBe(false);
			});
		}
	});

	describe("nullish / empty input", () => {
		test("undefined → false", () => {
			expect(matchesPublicTenantEndpoint(undefined)).toBe(false);
		});
		test("null → false", () => {
			expect(matchesPublicTenantEndpoint(null)).toBe(false);
		});
		test("empty string → false", () => {
			expect(matchesPublicTenantEndpoint("")).toBe(false);
		});
	});

	test("suffix list is exactly the four known public endpoints", () => {
		// Guards against silent additions/removals to the public set.
		expect([...PUBLIC_TENANT_ENDPOINT_SUFFIXES]).toEqual([
			"invitations/getByToken",
			"invitations/accept",
			"invitations/verifyEmailByToken",
			"registration/complete",
		]);
	});
});
