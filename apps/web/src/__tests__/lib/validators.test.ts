import { describe, expect, it } from "vitest";
import {
	zEmail,
	zMoneyCents,
	zMoneyInput,
	zNonEmpty,
	zPercentageBp,
	zPercentageInput,
	zPhoneMY,
	zUuid,
} from "@/lib/validators";

describe("validators", () => {
	it("zEmail trims, lowercases, and validates", () => {
		expect(zEmail.parse("  Foo@BAR.com ")).toBe("foo@bar.com");
		expect(zEmail.safeParse("not-an-email").success).toBe(false);
	});

	it("zPhoneMY accepts MY formats", () => {
		expect(zPhoneMY.safeParse("0123456789").success).toBe(true);
		expect(zPhoneMY.safeParse("+60123456789").success).toBe(true);
		expect(zPhoneMY.safeParse("123").success).toBe(false);
	});

	it("zMoneyCents rejects non-integers and negatives", () => {
		expect(zMoneyCents.safeParse(100).success).toBe(true);
		expect(zMoneyCents.safeParse(0).success).toBe(true);
		expect(zMoneyCents.safeParse(-1).success).toBe(false);
		expect(zMoneyCents.safeParse(1.5).success).toBe(false);
	});

	it("zMoneyInput transforms string to cents with ctx.addIssue on failure", () => {
		expect(zMoneyInput.parse("9.99")).toBe(999);
		expect(zMoneyInput.parse("RM 1,234.56")).toBe(123456);
		const bad = zMoneyInput.safeParse("abc");
		expect(bad.success).toBe(false);
		if (!bad.success) {
			expect(bad.error.issues[0].message).toBe("Enter a valid amount");
		}
	});

	it("zPercentageBp bounds basis points", () => {
		expect(zPercentageBp.safeParse(0).success).toBe(true);
		expect(zPercentageBp.safeParse(10_000).success).toBe(true);
		expect(zPercentageBp.safeParse(10_001).success).toBe(false);
		expect(zPercentageBp.safeParse(-1).success).toBe(false);
	});

	it("zPercentageInput transforms '8.5%' to 850 bp", () => {
		expect(zPercentageInput.parse("8.5")).toBe(850);
		expect(zPercentageInput.parse("8.5%")).toBe(850);
		expect(zPercentageInput.parse("100")).toBe(10_000);
		expect(zPercentageInput.safeParse("101").success).toBe(false);
		expect(zPercentageInput.safeParse("abc").success).toBe(false);
	});

	it("zNonEmpty uses label in error", () => {
		const schema = zNonEmpty("Name");
		const result = schema.safeParse("   ");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toBe("Name is required");
		}
	});

	it("zUuid accepts uuid only", () => {
		expect(
			zUuid.safeParse("996febce-aaad-4ded-8f47-02d2b566c8ee").success,
		).toBe(true);
		expect(zUuid.safeParse("not-a-uuid").success).toBe(false);
	});
});
