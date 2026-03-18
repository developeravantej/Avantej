import { describe, test, expect } from "vitest";

describe("tax rate basis points", () => {
	test("8.00% stored as 800 basis points (display to stored)", () => {
		const rate = parseFloat("8.00");
		const basisPoints = Math.round(rate * 100);
		expect(basisPoints).toBe(800);
	});

	test("800 basis points displayed as '8.00' (stored to display)", () => {
		const display = (800 / 100).toFixed(2);
		expect(display).toBe("8.00");
	});

	test("6.25% stored as 625 basis points (no floating point error)", () => {
		const basisPoints = Math.round(6.25 * 100);
		expect(basisPoints).toBe(625);
	});

	test("zero basis points (0.00% stored as 0)", () => {
		const basisPoints = Math.round(0 * 100);
		expect(basisPoints).toBe(0);
	});

	test("10% stored as 1000 basis points", () => {
		const basisPoints = Math.round(10 * 100);
		expect(basisPoints).toBe(1000);
	});

	test("0.50% stored as 50 basis points", () => {
		const basisPoints = Math.round(0.5 * 100);
		expect(basisPoints).toBe(50);
	});

	test("round-trip: percent to basis points and back", () => {
		const original = 7.5;
		const basisPoints = Math.round(original * 100);
		const restored = basisPoints / 100;
		expect(restored).toBe(7.5);
	});
});
