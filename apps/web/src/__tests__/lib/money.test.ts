import { describe, expect, it } from "vitest";
import {
	centsToRm,
	formatPrice,
	parseMoneyInput,
	rmToCents,
} from "@/lib/money";

describe("money", () => {
	describe("rmToCents", () => {
		it("converts number to integer cents", () => {
			expect(rmToCents(10)).toBe(1000);
			expect(rmToCents(0)).toBe(0);
			expect(rmToCents(0.01)).toBe(1);
			expect(rmToCents(12.345)).toBe(1235);
		});
		it("converts numeric string to cents", () => {
			expect(rmToCents("9.99")).toBe(999);
		});
		it("throws on invalid or negative input", () => {
			expect(() => rmToCents("abc")).toThrow();
			expect(() => rmToCents(-1)).toThrow();
		});
	});

	describe("centsToRm", () => {
		it("formats with 2 decimals", () => {
			expect(centsToRm(0)).toBe("0.00");
			expect(centsToRm(1)).toBe("0.01");
			expect(centsToRm(12345)).toBe("123.45");
		});
	});

	describe("formatPrice", () => {
		it("formats MYR with RM prefix", () => {
			expect(formatPrice(12345)).toBe("RM 123.45");
			expect(formatPrice(0)).toBe("RM 0.00");
			expect(formatPrice(100)).toBe("RM 1.00");
		});
		it("formats non-MYR via Intl", () => {
			const result = formatPrice(12345, "USD");
			expect(result).toContain("123.45");
		});
		it("accepts lowercase currency", () => {
			expect(formatPrice(100, "myr")).toBe("RM 1.00");
		});
	});

	describe("parseMoneyInput", () => {
		it("accepts plain numeric strings", () => {
			expect(parseMoneyInput("9.99")).toEqual({ ok: true, cents: 999 });
			expect(parseMoneyInput("0")).toEqual({ ok: true, cents: 0 });
		});
		it("strips RM prefix and commas", () => {
			expect(parseMoneyInput("RM 1,234.56")).toEqual({
				ok: true,
				cents: 123456,
			});
			expect(parseMoneyInput("rm 10")).toEqual({ ok: true, cents: 1000 });
		});
		it("returns Result, never throws, on invalid input", () => {
			expect(parseMoneyInput("")).toEqual({ ok: false, error: "Required" });
			expect(parseMoneyInput("   ")).toEqual({
				ok: false,
				error: "Required",
			});
			expect(parseMoneyInput("abc")).toEqual({
				ok: false,
				error: "Enter a valid amount",
			});
			expect(parseMoneyInput("-5")).toEqual({
				ok: false,
				error: "Amount must be ≥ 0",
			});
		});
	});
});
