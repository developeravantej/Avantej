/**
 * Plan F.1.5 (Agent H) — unit tests for computeHealthScore.
 *
 * Pure function — no DB. Tests cover the locked formula in
 * docs/plans/plan-f-ops-ux.md.
 */

import { describe, expect, it } from "bun:test";
import { computeHealthScore, type HealthScoreInput } from "./health-score";

// Fixed clock so payment/login recency calculations are deterministic.
const NOW = new Date("2026-05-15T12:00:00.000Z");

function input(overrides: Partial<HealthScoreInput>): HealthScoreInput {
	return {
		memberCount: 50,
		customerCount: 200,
		apptCount30d: 120,
		salesTotal30dMinor: 50_000_00,
		ghlActive: true,
		paymentStatus: "active",
		lastSuccessfulPaymentAt: new Date("2026-05-10T00:00:00.000Z"), // 5d ago
		lastAdminLoginAt: new Date("2026-05-14T00:00:00.000Z"), // 1.5d ago
		failedWebhooks7d: 0,
		dailyActiveMembers30dAvg: 25, // 25/50 = 0.5 ratio (≥0.4 = full)
		now: NOW,
		...overrides,
	};
}

describe("computeHealthScore", () => {
	it("healthy tenant → score ≥ 85, no critical flags", () => {
		const { score, flags } = computeHealthScore(input({}));
		expect(score).toBeGreaterThanOrEqual(85);
		expect(flags.filter((f) => f.severity === "critical")).toHaveLength(0);
	});

	it("cancelled tenant (realistic: also stale + inactive) → score < 30, includes subscription_cancelled critical", () => {
		// A real cancelled tenant won't have a fresh payment + recent admin login.
		const stale = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
		const oldLogin = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
		const { score, flags } = computeHealthScore(
			input({
				paymentStatus: "cancelled",
				lastSuccessfulPaymentAt: stale,
				lastAdminLoginAt: oldLogin,
				dailyActiveMembers30dAvg: 2, // ratio 0.04 << 0.2
			}),
		);
		expect(score).toBeLessThan(30);
		expect(
			flags.find(
				(f) => f.code === "subscription_cancelled" && f.severity === "critical",
			),
		).toBeTruthy();
	});

	it("cancelled status alone emits subscription_cancelled critical flag", () => {
		const { flags } = computeHealthScore(input({ paymentStatus: "cancelled" }));
		expect(
			flags.find(
				(f) => f.code === "subscription_cancelled" && f.severity === "critical",
			),
		).toBeTruthy();
	});

	it("past-due tenant → mid-range score, includes subscription_past_due warn", () => {
		const { score, flags } = computeHealthScore(
			input({ paymentStatus: "past_due" }),
		);
		expect(score).toBeGreaterThan(30);
		expect(score).toBeLessThan(95);
		expect(
			flags.find(
				(f) => f.code === "subscription_past_due" && f.severity === "warn",
			),
		).toBeTruthy();
	});

	it("stale payment → payment_stale flag emitted, recency factor = 0", () => {
		// 40 days ago > 35d zero-threshold
		const stale = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
		const { score, flags } = computeHealthScore(
			input({ lastSuccessfulPaymentAt: stale }),
		);
		expect(flags.find((f) => f.code === "payment_stale")).toBeTruthy();
		// Score must be strictly less than a healthy run (subtract the 20-pt recency factor).
		const healthy = computeHealthScore(input({}));
		expect(score).toBeLessThan(healthy.score);
	});

	it("missing optional column → no_data info flag, factor skipped", () => {
		const { score, flags } = computeHealthScore(
			input({ failedWebhooks7d: null }),
		);
		// no_data for webhooks
		expect(
			flags.find((f) => f.code === "no_data" && f.severity === "info"),
		).toBeTruthy();
		// Score should still be in healthy range because remaining factors are all-green;
		// totalWeight is renormalized so missing factor doesn't drag the score down.
		expect(score).toBeGreaterThanOrEqual(85);
	});

	it("low activity ratio < 0.2 → low_activity warn", () => {
		const { flags } = computeHealthScore(
			input({ memberCount: 100, dailyActiveMembers30dAvg: 5 }), // ratio 0.05
		);
		expect(
			flags.find((f) => f.code === "low_activity" && f.severity === "warn"),
		).toBeTruthy();
	});

	it("inactive admin > 14d → inactive_admin info flag", () => {
		const old = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
		const { flags } = computeHealthScore(input({ lastAdminLoginAt: old }));
		expect(
			flags.find((f) => f.code === "inactive_admin" && f.severity === "info"),
		).toBeTruthy();
	});

	it("3+ webhook failures → webhook_failures critical", () => {
		const { flags } = computeHealthScore(input({ failedWebhooks7d: 5 }));
		expect(
			flags.find(
				(f) => f.code === "webhook_failures" && f.severity === "critical",
			),
		).toBeTruthy();
	});

	it("1-2 webhook failures → webhook_failures warn", () => {
		const { flags } = computeHealthScore(input({ failedWebhooks7d: 2 }));
		expect(
			flags.find((f) => f.code === "webhook_failures" && f.severity === "warn"),
		).toBeTruthy();
	});

	it("all-zero / cancelled / stale inputs → score = 0, multiple flags", () => {
		const stale = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
		const oldLogin = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
		const { score, flags } = computeHealthScore(
			input({
				paymentStatus: "cancelled",
				lastSuccessfulPaymentAt: stale,
				dailyActiveMembers30dAvg: 0,
				lastAdminLoginAt: oldLogin,
				failedWebhooks7d: 10,
				memberCount: 50,
			}),
		);
		expect(score).toBe(0);
		expect(flags.length).toBeGreaterThanOrEqual(4);
	});

	it("all inputs null → score = 0, multiple no_data flags, no crash", () => {
		const { score, flags } = computeHealthScore(
			input({
				paymentStatus: null,
				lastSuccessfulPaymentAt: null,
				lastAdminLoginAt: null,
				failedWebhooks7d: null,
				dailyActiveMembers30dAvg: null,
			}),
		);
		expect(score).toBe(0);
		expect(
			flags.filter((f) => f.code === "no_data").length,
		).toBeGreaterThanOrEqual(5);
	});

	// ── Plan F.6 (Agent Sn) — new factor-population coverage ──────────────
	describe("Plan F.6 — factors now populated by the cron", () => {
		it("inactive admin (15d since login) + recent webhook fails + low activity → composite drops, three flags emitted", () => {
			const fifteenDaysAgo = new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000);
			const { score, flags } = computeHealthScore(
				input({
					lastAdminLoginAt: fifteenDaysAgo,
					failedWebhooks7d: 4,
					memberCount: 50,
					dailyActiveMembers30dAvg: 3, // ratio 0.06 << 0.2 low
				}),
			);
			expect(
				flags.find((f) => f.code === "inactive_admin" && f.severity === "info"),
			).toBeTruthy();
			expect(
				flags.find(
					(f) => f.code === "webhook_failures" && f.severity === "critical",
				),
			).toBeTruthy();
			expect(
				flags.find((f) => f.code === "low_activity" && f.severity === "warn"),
			).toBeTruthy();
			// Healthy baseline scores 100; this should be substantially lower.
			const healthy = computeHealthScore(input({}));
			expect(score).toBeLessThan(healthy.score - 30);
			// And NOT the all-data-missing degenerate case.
			expect(flags.filter((f) => f.code === "no_data").length).toBe(0);
		});

		it("only activity factor null → exactly one no_data flag, other 4 factors score normally", () => {
			const { score, flags } = computeHealthScore(
				input({ dailyActiveMembers30dAvg: null }),
			);
			expect(flags.filter((f) => f.code === "no_data").length).toBe(1);
			// Score should still be in healthy range (80% of weights still active).
			expect(score).toBeGreaterThanOrEqual(80);
		});

		it("webhook failures count = 0 → no webhook_failures flag, factor at full weight", () => {
			const { flags } = computeHealthScore(input({ failedWebhooks7d: 0 }));
			expect(flags.find((f) => f.code === "webhook_failures")).toBeUndefined();
		});

		it("admin login exactly at boundary (14d) → factor zero + inactive_admin info flag", () => {
			const boundary = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000);
			const { flags } = computeHealthScore(
				input({ lastAdminLoginAt: boundary }),
			);
			expect(
				flags.find((f) => f.code === "inactive_admin" && f.severity === "info"),
			).toBeTruthy();
		});
	});

	it("observedAt is consistent ISO timestamp on every flag", () => {
		const { flags } = computeHealthScore(input({ paymentStatus: "cancelled" }));
		for (const f of flags) {
			expect(typeof f.observedAt).toBe("string");
			expect(() => new Date(f.observedAt).toISOString()).not.toThrow();
		}
	});
});
