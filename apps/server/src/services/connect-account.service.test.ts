/**
 * Connect Account Service — Unit Tests
 *
 * Pure-function tests for computeApplicationFee. The resolver functions
 * (getConnectAccountForOrg / getConnectAccountForOrgCountry) need a real DB
 * and live as integration tests.
 *
 * Run: bun test src/services/connect-account.service.test.ts
 */

import { describe, expect, test } from "bun:test";
import { computeApplicationFee } from "./connect-account.service";

describe("computeApplicationFee", () => {
	test("computes 2% (200 bps) of 10000 cents = 200", () => {
		expect(computeApplicationFee(10_000, 200)).toBe(200);
	});

	test("computes 3% (basic tier) of 5000 cents = 150", () => {
		expect(computeApplicationFee(5_000, 300)).toBe(150);
	});

	test("computes 1.5% (enterprise tier) of 100000 cents = 1500", () => {
		expect(computeApplicationFee(100_000, 150)).toBe(1_500);
	});

	test("rounds DOWN — never overcharge fee", () => {
		// 2% of 333 = 6.66 -> floor to 6
		expect(computeApplicationFee(333, 200)).toBe(6);
		// 3% of 1 = 0.03 -> floor to 0
		expect(computeApplicationFee(1, 300)).toBe(0);
	});

	test("zero amount yields zero fee", () => {
		expect(computeApplicationFee(0, 300)).toBe(0);
	});

	test("zero bps yields zero fee", () => {
		expect(computeApplicationFee(10_000, 0)).toBe(0);
	});

	test("matches ADR-0002 tier rates against a realistic appointment", () => {
		// RM100 appointment paid on Professional tier (2%) -> RM2 fee.
		expect(computeApplicationFee(10_000, 200)).toBe(200);
		// RM500 appointment paid on Enterprise tier (1.5%) -> RM7.50 fee.
		expect(computeApplicationFee(50_000, 150)).toBe(750);
		// RM50 appointment paid on Basic tier (3%) -> RM1.50 fee.
		expect(computeApplicationFee(5_000, 300)).toBe(150);
	});
});
