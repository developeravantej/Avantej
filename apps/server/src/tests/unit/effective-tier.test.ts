import { describe, expect, test } from "bun:test";
import { resolveEffectiveTier } from "@avantej-core/types";

/**
 * Guards the C4 / B1 fix: the application fee must reflect the EFFECTIVE
 * (live) tier. A lapsed subscription must not keep a higher tier's discounted
 * fee — a canceled enterprise tenant previously kept 1.5% (under-collection).
 */
describe("resolveEffectiveTier", () => {
	test("live enterprise → 150 bps (1.5%)", () => {
		expect(resolveEffectiveTier({ tier: "enterprise", status: "active" })).toEqual({
			tier: "enterprise",
			appFeeBps: 150,
		});
	});

	test("live professional (trialing) → 200 bps", () => {
		expect(
			resolveEffectiveTier({ tier: "professional", status: "trialing" }),
		).toEqual({ tier: "professional", appFeeBps: 200 });
	});

	test("live basic (past_due grace) → 300 bps", () => {
		expect(resolveEffectiveTier({ tier: "basic", status: "past_due" })).toEqual({
			tier: "basic",
			appFeeBps: 300,
		});
	});

	test("B1: canceled enterprise → basic 300 bps (no discount kept)", () => {
		expect(
			resolveEffectiveTier({ tier: "enterprise", status: "canceled" }),
		).toEqual({ tier: null, appFeeBps: 300 });
	});

	test("unpaid enterprise → basic 300 bps", () => {
		expect(
			resolveEffectiveTier({ tier: "enterprise", status: "unpaid" }),
		).toEqual({ tier: null, appFeeBps: 300 });
	});

	test("no subscription → basic 300 bps", () => {
		expect(resolveEffectiveTier(null)).toEqual({ tier: null, appFeeBps: 300 });
	});

	test("live but unrecognized tier → basic fee, null tier", () => {
		expect(resolveEffectiveTier({ tier: "garbage", status: "active" })).toEqual({
			tier: null,
			appFeeBps: 300,
		});
	});
});
