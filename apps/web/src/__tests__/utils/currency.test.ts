import { describe, test, expect } from "vitest";
import { rmToCents, centsToRm } from "@/lib/amount";

describe("rmToCents", () => {
	test("converts whole RM to cents", () => {
		expect(rmToCents(100)).toBe(10000);
		expect(rmToCents(1)).toBe(100);
	});

	test("converts decimal RM to cents (rounding)", () => {
		expect(rmToCents(123.45)).toBe(12345);
		expect(rmToCents(0.99)).toBe(99);
		expect(rmToCents(0.001)).toBe(0);
		expect(rmToCents(0.005)).toBe(1);
	});

	test("converts string input", () => {
		expect(rmToCents("50.00")).toBe(5000);
		expect(rmToCents("1.50")).toBe(150);
	});

	test("throws on negative amount", () => {
		expect(() => rmToCents(-1)).toThrow("Invalid amount");
	});

	test("throws on NaN", () => {
		expect(() => rmToCents("not-a-number")).toThrow("Invalid amount");
		expect(() => rmToCents(NaN)).toThrow("Invalid amount");
	});

	test("zero is valid", () => {
		expect(rmToCents(0)).toBe(0);
	});

	test("handles floating point precision (classic 0.1 + 0.2 issue)", () => {
		expect(rmToCents(0.1 + 0.2)).toBe(30);
	});
});

describe("centsToRm", () => {
	test("converts cents to RM string", () => {
		expect(centsToRm(10000)).toBe("100.00");
		expect(centsToRm(99)).toBe("0.99");
		expect(centsToRm(0)).toBe("0.00");
	});

	test("converts single cent", () => {
		expect(centsToRm(1)).toBe("0.01");
	});
});
