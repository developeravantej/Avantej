import { describe, test, expect } from "vitest";
import {
	encodePromotionValue,
	displayPromotionValue,
} from "@/lib/promotions";

describe("encodePromotionValue", () => {
	test("percentage: 10% stored as 1000 basis points", () => {
		expect(encodePromotionValue("percentage", "10")).toBe(1000);
	});

	test("percentage: 10.5% stored as 1050 basis points", () => {
		expect(encodePromotionValue("percentage", "10.5")).toBe(1050);
	});

	test("percentage: 100% stored as 10000 basis points", () => {
		expect(encodePromotionValue("percentage", "100")).toBe(10000);
	});

	test("fixed_amount: RM 5.00 stored as 500 cents", () => {
		expect(encodePromotionValue("fixed_amount", "5.00")).toBe(500);
	});

	test("fixed_amount: RM 99.99 stored as 9999 cents", () => {
		expect(encodePromotionValue("fixed_amount", "99.99")).toBe(9999);
	});

	test("throws on zero value", () => {
		expect(() => encodePromotionValue("percentage", "0")).toThrow(
			"Invalid value",
		);
	});

	test("throws on negative value", () => {
		expect(() => encodePromotionValue("fixed_amount", "-5")).toThrow(
			"Invalid value",
		);
	});

	test("throws on non-numeric input", () => {
		expect(() => encodePromotionValue("percentage", "abc")).toThrow(
			"Invalid value",
		);
	});
});

describe("displayPromotionValue", () => {
	test("percentage: 1000 basis points displayed as '10.00%'", () => {
		expect(displayPromotionValue("percentage", 1000)).toBe("10.00%");
	});

	test("percentage: 100 basis points displayed as '1.00%'", () => {
		expect(displayPromotionValue("percentage", 100)).toBe("1.00%");
	});

	test("percentage: 1050 basis points displayed as '10.50%'", () => {
		expect(displayPromotionValue("percentage", 1050)).toBe("10.50%");
	});

	test("fixed_amount: 500 cents displayed as 'RM 5.00'", () => {
		expect(displayPromotionValue("fixed_amount", 500)).toBe("RM 5.00");
	});

	test("fixed_amount: 9999 cents displayed as 'RM 99.99'", () => {
		expect(displayPromotionValue("fixed_amount", 9999)).toBe("RM 99.99");
	});
});
