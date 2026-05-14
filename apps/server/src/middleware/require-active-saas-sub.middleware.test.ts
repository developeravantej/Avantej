import { describe, it, expect } from "bun:test";
import { evaluateAccess } from "./require-active-saas-sub.middleware";

const now = new Date("2026-05-13T12:00:00Z");

describe("evaluateAccess", () => {
	it("allows when sub.status === 'active'", () => {
		const result = evaluateAccess(
			{
				status: "active",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("allow");
	});

	it("allows + 'trialing' banner when sub.status === 'trialing' and trialEndsAt in future", () => {
		const result = evaluateAccess(
			{
				status: "trialing",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: new Date("2026-05-20T12:00:00Z"),
			},
			now,
		);
		expect(result.decision).toBe("allow");
		expect(result.decision === "allow" && result.banner).toBe("trialing");
	});

	it("allows + 'past_due_in_grace' banner when past_due within 7-day grace", () => {
		const result = evaluateAccess(
			{
				status: "past_due",
				pastDueAt: new Date("2026-05-12T00:00:00Z"),
				gracePeriodEndsAt: new Date("2026-05-19T00:00:00Z"),
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("allow");
		expect(result.decision === "allow" && result.banner).toBe("past_due_in_grace");
	});

	it("read-only when past_due past 7-day grace", () => {
		const result = evaluateAccess(
			{
				status: "past_due",
				pastDueAt: new Date("2026-05-01T00:00:00Z"),
				gracePeriodEndsAt: new Date("2026-05-08T00:00:00Z"),
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("read_only");
		expect(result.decision === "read_only" && result.reason).toBe("past_due_past_grace");
	});

	it("read-only when status is canceled", () => {
		const result = evaluateAccess(
			{
				status: "canceled",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("read_only");
		expect(result.decision === "read_only" && result.reason).toBe("canceled");
	});

	it("read-only when status is unpaid", () => {
		const result = evaluateAccess(
			{
				status: "unpaid",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("read_only");
		expect(result.decision === "read_only" && result.reason).toBe("unpaid");
	});

	it("read-only when status is incomplete_expired", () => {
		const result = evaluateAccess(
			{
				status: "incomplete_expired",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("read_only");
	});

	it("blocks when status is incomplete (first payment never succeeded)", () => {
		const result = evaluateAccess(
			{
				status: "incomplete",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("block");
		expect(result.decision === "block" && result.reason).toBe("incomplete");
	});

	it("blocks when no sub and trial expired", () => {
		const result = evaluateAccess(
			null,
			now,
			new Date("2026-05-01T00:00:00Z"),
		);
		expect(result.decision).toBe("block");
		expect(result.decision === "block" && result.reason).toBe("trial_expired_no_sub");
	});

	it("allows + 'trialing' banner when no sub but trial still active", () => {
		const result = evaluateAccess(
			null,
			now,
			new Date("2026-05-20T00:00:00Z"),
		);
		expect(result.decision).toBe("allow");
		expect(result.decision === "allow" && result.banner).toBe("trialing");
	});

	it("blocks when no sub and no trialEndsAt", () => {
		const result = evaluateAccess(null, now, null);
		expect(result.decision).toBe("block");
		expect(result.decision === "block" && result.reason).toBe("trial_expired_no_sub");
	});

	it("blocks when no sub and trialEndsAt is undefined", () => {
		const result = evaluateAccess(null, now, undefined);
		expect(result.decision).toBe("block");
	});

	it("read-only with unknown status string (default fallthrough)", () => {
		const result = evaluateAccess(
			{
				status: "some_future_stripe_status",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("read_only");
		expect(result.decision === "read_only" && result.reason).toBe(
			"some_future_stripe_status",
		);
	});

	it("trialing + null trialEndsAt still allows (no explicit expiry)", () => {
		// Edge case: Stripe rarely emits 'trialing' without trial_end, but the evaluator
		// must not crash. Current behavior: allow with banner. Open Plan D question: should
		// this block as a data integrity issue?
		const result = evaluateAccess(
			{
				status: "trialing",
				pastDueAt: null,
				gracePeriodEndsAt: null,
				trialEndsAt: null,
			},
			now,
		);
		expect(result.decision).toBe("allow");
		expect(result.decision === "allow" && result.banner).toBe("trialing");
	});
});
