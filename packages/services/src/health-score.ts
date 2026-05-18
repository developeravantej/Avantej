/**
 * Plan F.1.5 (Agent H) — Composite tenant health-score + risk-flag emitter.
 *
 * Pure function. Lives in `@avantej-core/services` so the daily snapshot
 * cron, the read procs, and the unit tests all share one source of truth.
 *
 * Output:
 *   - score: 0-100 (100 = healthy). Weighted sum of 5 factors, clamped.
 *   - flags: RiskFlag[]   (each flag has code/severity/observedAt).
 *
 * Inputs are intentionally optional — the F.1.5 snapshot writer cannot
 * yet feed all 5 factors (admin-login + webhook-failure + DAM30 are not
 * tracked). Missing inputs emit a `no_data` info flag and the factor is
 * skipped. See ADR-0030 / docs/plans/plan-f-ops-ux.md.
 */

import type { RiskFlag } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";

export type { RiskFlag };

/**
 * What `computeHealthScore` reads. Persisted snapshot fields are
 * required (cron always has them); auxiliary signals are optional.
 *
 * NOTE: `paymentStatus` accepts both org-level values
 * ({active, suspended, cancelled}) and Stripe sub-level values
 * ({trialing, past_due, unpaid}) — the formula's table covers both.
 */
export interface HealthScoreInput {
	// Required — persisted on every snapshot row.
	memberCount: number;
	customerCount: number;
	apptCount30d: number;
	salesTotal30dMinor: number;
	ghlActive: boolean;

	// Optional — fed by cron when available, otherwise emits `no_data`.
	paymentStatus?: string | null;
	lastSuccessfulPaymentAt?: Date | string | null;
	lastAdminLoginAt?: Date | string | null;
	failedWebhooks7d?: number | null;
	/** Trailing-30d daily-active members average. Cron does not yet
	 *  populate this — emits `no_data` for the Activity factor. */
	dailyActiveMembers30dAvg?: number | null;

	/** Override "now" for deterministic tests. Defaults to new Date(). */
	now?: Date;
}

export interface HealthScoreResult {
	score: number;
	flags: RiskFlag[];
}

const WEIGHTS = {
	subscription: 25,
	paymentRecency: 20,
	activity: 20,
	loginRecency: 15,
	webhookReliability: 20,
} as const;

const PAYMENT_RECENCY_ZERO_DAYS = 35;
const LOGIN_RECENCY_ZERO_DAYS = 14;
const ACTIVITY_FULL_RATIO = 0.4;
const ACTIVITY_LOW_RATIO = 0.2;

function daysBetween(now: Date, then: Date): number {
	return (now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000);
}

function asDate(v: Date | string | null | undefined): Date | null {
	if (v === null || v === undefined) return null;
	if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
	const d = new Date(v);
	return Number.isFinite(d.getTime()) ? d : null;
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}

/**
 * Compute composite health-score for a tenant snapshot.
 *
 * Scoring per factor:
 *   - Subscription: active|trialing=full, past_due|suspended=half,
 *       unpaid=quarter, cancelled=0
 *   - Payment recency: linear 0d=full → 35d=zero, >35d=0
 *   - Activity: ratio active/member ≥ 0.4 = full, 0 = 0 (linear)
 *   - Login recency: 0d=full, 14d=zero, >14d=0
 *   - Webhook reliability: 0 fails=full, 1-2=half, 3+=0
 *
 * Flags emitted (each tagged with observedAt = now):
 *   - subscription_cancelled (critical), subscription_past_due (warn)
 *   - payment_stale (warn)
 *   - low_activity (warn)
 *   - inactive_admin (info)
 *   - webhook_failures (critical if ≥3, else warn)
 *   - no_data (info) — any required input missing
 */
export function computeHealthScore(
	snapshot: HealthScoreInput,
): HealthScoreResult {
	const now = snapshot.now ?? new Date();
	const observedAt = now.toISOString();
	const flags: RiskFlag[] = [];

	let totalWeight = 0;
	let achieved = 0;

	// ── Factor 1: Subscription status ──────────────────────────────────
	if (snapshot.paymentStatus == null) {
		flags.push({ code: "no_data", severity: "info", observedAt });
	} else {
		totalWeight += WEIGHTS.subscription;
		const s = snapshot.paymentStatus.toLowerCase();
		let factor = 0;
		if (s === "active" || s === "trialing") {
			factor = 1;
		} else if (s === "past_due" || s === "suspended") {
			factor = 0.5;
			flags.push({
				code: "subscription_past_due",
				severity: "warn",
				observedAt,
			});
		} else if (s === "unpaid") {
			factor = 0.25;
			flags.push({
				code: "subscription_past_due",
				severity: "warn",
				observedAt,
			});
		} else if (s === "cancelled" || s === "canceled") {
			factor = 0;
			flags.push({
				code: "subscription_cancelled",
				severity: "critical",
				observedAt,
			});
		} else {
			// Unknown status — score as zero and emit no_data.
			factor = 0;
			flags.push({ code: "no_data", severity: "info", observedAt });
		}
		achieved += WEIGHTS.subscription * factor;
	}

	// ── Factor 2: Payment recency ──────────────────────────────────────
	const lastPay = asDate(snapshot.lastSuccessfulPaymentAt);
	if (lastPay === null) {
		flags.push({ code: "no_data", severity: "info", observedAt });
	} else {
		totalWeight += WEIGHTS.paymentRecency;
		const d = daysBetween(now, lastPay);
		let factor: number;
		if (d <= 0) factor = 1;
		else if (d >= PAYMENT_RECENCY_ZERO_DAYS) {
			factor = 0;
			flags.push({ code: "payment_stale", severity: "warn", observedAt });
		} else {
			factor = 1 - d / PAYMENT_RECENCY_ZERO_DAYS;
		}
		achieved += WEIGHTS.paymentRecency * factor;
	}

	// ── Factor 3: Activity (DAM30 / members) ───────────────────────────
	if (
		snapshot.dailyActiveMembers30dAvg == null ||
		snapshot.memberCount == null
	) {
		flags.push({ code: "no_data", severity: "info", observedAt });
	} else if (snapshot.memberCount === 0) {
		// Cannot compute ratio; treat as no_data rather than divide-by-zero.
		flags.push({ code: "no_data", severity: "info", observedAt });
	} else {
		totalWeight += WEIGHTS.activity;
		const ratio = snapshot.dailyActiveMembers30dAvg / snapshot.memberCount;
		const factor = clamp(ratio / ACTIVITY_FULL_RATIO, 0, 1);
		if (ratio < ACTIVITY_LOW_RATIO) {
			flags.push({ code: "low_activity", severity: "warn", observedAt });
		}
		achieved += WEIGHTS.activity * factor;
	}

	// ── Factor 4: Admin login recency ──────────────────────────────────
	const lastLogin = asDate(snapshot.lastAdminLoginAt);
	if (lastLogin === null) {
		flags.push({ code: "no_data", severity: "info", observedAt });
	} else {
		totalWeight += WEIGHTS.loginRecency;
		const d = daysBetween(now, lastLogin);
		let factor: number;
		if (d <= 0) factor = 1;
		else if (d >= LOGIN_RECENCY_ZERO_DAYS) {
			factor = 0;
			flags.push({ code: "inactive_admin", severity: "info", observedAt });
		} else {
			factor = 1 - d / LOGIN_RECENCY_ZERO_DAYS;
		}
		achieved += WEIGHTS.loginRecency * factor;
	}

	// ── Factor 5: Webhook reliability ──────────────────────────────────
	if (snapshot.failedWebhooks7d == null) {
		flags.push({ code: "no_data", severity: "info", observedAt });
	} else {
		totalWeight += WEIGHTS.webhookReliability;
		const n = snapshot.failedWebhooks7d;
		let factor: number;
		if (n <= 0) {
			factor = 1;
		} else if (n <= 2) {
			factor = 0.5;
			flags.push({ code: "webhook_failures", severity: "warn", observedAt });
		} else {
			factor = 0;
			flags.push({
				code: "webhook_failures",
				severity: "critical",
				observedAt,
			});
		}
		achieved += WEIGHTS.webhookReliability * factor;
	}

	// Normalize: if every factor is no_data, score = 0; otherwise scale to 0-100.
	let score: number;
	if (totalWeight === 0) {
		score = 0;
	} else {
		score = Math.round((achieved / totalWeight) * 100);
	}
	score = clamp(score, 0, 100);

	return { score, flags };
}
