/**
 * Payment Service — Unit Tests
 *
 * `handleCheckoutCompleted` is IO-heavy (control-panel tx, Neon provisioning,
 * tenant migrations) and is verified by the subscription/webhook integration
 * specs. This file pins the three PURE helpers that decide billing outcomes
 * from a Stripe checkout session — the parts a wrong constant would silently
 * mis-bill or mis-provision:
 *
 *   - determineTier(amountTotal): cents → tier, with $99 / $299 boundaries
 *   - getTierOrgLimit(tier): org-count cap per tier
 *   - generateSlug(name): URL-safe org slug
 *
 * No DB import is executed (the helpers are pure; controlPanelDb is a lazy
 * proxy, so importing the module does not open a connection).
 *
 * Run: bun test src/services/payment.service.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
	determineTier,
	generateSlug,
	getTierOrgLimit,
} from "./payment.service";

describe("determineTier — checkout amount (cents) → tier", () => {
	test("null / zero amount defaults to basic", () => {
		expect(determineTier(null)).toBe("basic");
		expect(determineTier(0)).toBe("basic");
	});

	test("below the professional floor is basic ($49 = 4900c)", () => {
		expect(determineTier(4900)).toBe("basic");
		expect(determineTier(9899)).toBe("basic");
	});

	test("exactly $99 (9900c) crosses into professional", () => {
		expect(determineTier(9900)).toBe("professional");
	});

	test("between professional and enterprise stays professional", () => {
		expect(determineTier(9901)).toBe("professional");
		expect(determineTier(29899)).toBe("professional");
	});

	test("exactly $299 (29900c) crosses into enterprise", () => {
		expect(determineTier(29900)).toBe("enterprise");
	});

	test("well above the enterprise floor stays enterprise", () => {
		expect(determineTier(50000)).toBe("enterprise");
	});
});

describe("getTierOrgLimit — org-count cap per tier", () => {
	test("known tiers map to their documented caps", () => {
		expect(getTierOrgLimit("basic")).toBe(1);
		expect(getTierOrgLimit("professional")).toBe(3);
		expect(getTierOrgLimit("enterprise")).toBe(10);
	});

	test("unknown tier falls back to the safe minimum (1)", () => {
		expect(getTierOrgLimit("free")).toBe(1);
		expect(getTierOrgLimit("")).toBe(1);
	});

	test("every tier determineTier can emit has a defined org limit", () => {
		for (const amount of [null, 4900, 9900, 29900]) {
			const tier = determineTier(amount);
			expect(getTierOrgLimit(tier)).toBeGreaterThanOrEqual(1);
		}
	});
});

describe("generateSlug — URL-safe organization slug", () => {
	test("lowercases and hyphenates spaces", () => {
		expect(generateSlug("Acme Fitness")).toBe("acme-fitness");
	});

	test("strips special characters", () => {
		expect(generateSlug("Bob's Gym & Spa!")).toBe("bobs-gym-spa");
	});

	test("collapses repeated spaces / hyphens into a single hyphen", () => {
		expect(generateSlug("Power   House --- Gym")).toBe("power-house-gym");
	});

	test("trims leading/trailing hyphens and whitespace", () => {
		expect(generateSlug("  -Elite Gym-  ")).toBe("elite-gym");
	});

	test("preserves digits and underscores (\\w)", () => {
		expect(generateSlug("Studio_24 Seven")).toBe("studio_24-seven");
	});
});
