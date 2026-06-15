/**
 * Payment Side Effects — Unit Tests (pure helper)
 *
 * `onAppointmentPaid` is IO-heavy (tenant DB update + status-history insert +
 * control-panel email lookup + Resend). Its DB-observable guard logic — only
 * pending→confirmed flips, history only on transition — is pinned in the
 * sibling `.integration.test.ts`. This file covers the one pure helper that
 * shapes customer-facing money strings on the receipt email.
 *
 * Run: bun test src/services/payment-side-effects.service.unit.test.ts
 */

import { describe, expect, test } from "bun:test";
import { formatMoney } from "./payment-side-effects.service";

describe("formatMoney", () => {
	test("formats minor units as MAJOR.dd with an uppercased currency", () => {
		expect(formatMoney(12345, "myr")).toBe("MYR 123.45");
		expect(formatMoney(9900, "usd")).toBe("USD 99.00");
	});

	test("always shows two decimal places", () => {
		expect(formatMoney(10000, "MYR")).toBe("MYR 100.00");
		expect(formatMoney(5, "MYR")).toBe("MYR 0.05");
	});

	test("zero is a real amount, not an em-dash", () => {
		expect(formatMoney(0, "MYR")).toBe("MYR 0.00");
	});

	test("null amount renders an em-dash placeholder", () => {
		expect(formatMoney(null, "MYR")).toBe("—");
	});

	test("missing currency falls back to the bare major amount", () => {
		expect(formatMoney(12345, null)).toBe("123.45");
	});
});
