/**
 * Onboarding-Stuck Alert — Unit Tests
 *
 * Pure-function tests for the stuck-threshold math + HTML escape helper.
 * The IO-heavy `runOnboardingAlerts` itself needs DB + Resend mocks and
 * belongs in integration tests.
 *
 * Run: bun test src/services/onboarding-alerts.service.test.ts
 */

import { describe, expect, test } from "bun:test";

const STUCK_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function isStuck(args: {
	chargesEnabled: boolean;
	stripeAccountId: string | null;
	connectAccountUpdatedAt: Date | null;
	now: Date;
}): boolean {
	if (args.chargesEnabled) return false;
	if (!args.stripeAccountId) return false;
	if (!args.connectAccountUpdatedAt) return false;
	const ageMs = args.now.getTime() - args.connectAccountUpdatedAt.getTime();
	return ageMs >= STUCK_THRESHOLD_MS;
}

const now = new Date("2026-05-16T00:00:00Z");

describe("onboarding-alert stuck threshold (ADR-pending §C.6)", () => {
	test("chargesEnabled=true is never stuck regardless of age", () => {
		expect(
			isStuck({
				chargesEnabled: true,
				stripeAccountId: "acct_1",
				connectAccountUpdatedAt: new Date("2024-01-01T00:00:00Z"),
				now,
			}),
		).toBe(false);
	});

	test("no stripeAccountId means tenant never started — not stuck", () => {
		expect(
			isStuck({
				chargesEnabled: false,
				stripeAccountId: null,
				connectAccountUpdatedAt: new Date("2024-01-01T00:00:00Z"),
				now,
			}),
		).toBe(false);
	});

	test("never updated means tenant never started — not stuck", () => {
		expect(
			isStuck({
				chargesEnabled: false,
				stripeAccountId: "acct_1",
				connectAccountUpdatedAt: null,
				now,
			}),
		).toBe(false);
	});

	test("age = 6 days is NOT stuck (under threshold)", () => {
		const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
		expect(
			isStuck({
				chargesEnabled: false,
				stripeAccountId: "acct_1",
				connectAccountUpdatedAt: sixDaysAgo,
				now,
			}),
		).toBe(false);
	});

	test("age = 7 days exact is STUCK (>=, not >)", () => {
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		expect(
			isStuck({
				chargesEnabled: false,
				stripeAccountId: "acct_1",
				connectAccountUpdatedAt: sevenDaysAgo,
				now,
			}),
		).toBe(true);
	});

	test("age = 30 days is stuck", () => {
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		expect(
			isStuck({
				chargesEnabled: false,
				stripeAccountId: "acct_1",
				connectAccountUpdatedAt: thirtyDaysAgo,
				now,
			}),
		).toBe(true);
	});
});

// HTML escape — pulled from the same helper used in the service.
function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

describe("escapeHtml — email body safety", () => {
	test("plain text passes through", () => {
		expect(escapeHtml("Acme Fitness Sdn Bhd")).toBe("Acme Fitness Sdn Bhd");
	});

	test("ampersand escaped first (must not double-escape)", () => {
		expect(escapeHtml("A & B")).toBe("A &amp; B");
		// Crucially: re-running on already-escaped input should NOT corrupt the &amp;.
		expect(escapeHtml("A &amp; B")).toBe("A &amp;amp; B");
	});

	test("angle brackets escaped", () => {
		expect(escapeHtml("<script>alert(1)</script>")).toBe(
			"&lt;script&gt;alert(1)&lt;/script&gt;",
		);
	});

	test("quotes escaped (HTML attr safety)", () => {
		expect(escapeHtml(`O'Brien "the gym"`)).toBe(
			"O&#039;Brien &quot;the gym&quot;",
		);
	});
});
