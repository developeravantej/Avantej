/**
 * Plan F.4 — Renewals Calendar router unit tests (Agent Re).
 *
 * Seeds varied currentPeriodEnd dates → asserts week bucketing, MRR
 * pass/at-risk split, summary math, and past-due ordering. Pure DB read —
 * no Stripe mocking required.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	platformAdminRenewalsRouter,
	getISOWeekStart,
} from "./platform-admin-renewals";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { getTierPriceUsdCents } from "@avantej-core/types";

const PREFIX = "00000000-0000-0000-0000-44440000";
const TEST_USER_ID = "test-admin-user-renewals";

// Fixture: 5 orgs/subs with varied currentPeriodEnd / cancelAtPeriodEnd / status.
const ORG = (n: number) => `${PREFIX}${String(n).padStart(4, "0")}`;
const SUB = (n: number) => `${PREFIX}1${String(n).padStart(3, "0")}`;

function daysFromNow(days: number): Date {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function getHandler<T>(proc: unknown): (args: unknown) => Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((proc as any)["~orpc"] as Record<string, unknown>)["handler"] as (
		args: unknown,
	) => Promise<T>;
}

function fakeContext() {
	return {
		session: { user: { id: TEST_USER_ID, email: "admin@test.local" } },
		honoContext: {
			get: (k: string) => (k === "controlPanelDb" ? controlPanelDb : undefined),
		},
	};
}

beforeEach(async () => {
	// Ensure the test admin user exists in auth.user + is a platform admin.
	const existingUser = await controlPanelDb.query.user.findFirst({
		where: eq(userTable.id, TEST_USER_ID),
	});
	if (!existingUser) {
		await controlPanelDb.insert(userTable).values({
			id: TEST_USER_ID,
			email: `${TEST_USER_ID}@test.local`,
			name: "Renewals Test Admin",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as typeof userTable.$inferInsert);
	}
	const existingPa = await controlPanelDb.query.platformAdmins.findFirst({
		where: eq(platformAdmins.userId, TEST_USER_ID),
	});
	if (!existingPa) {
		await controlPanelDb.insert(platformAdmins).values({
			userId: TEST_USER_ID,
			role: "super_admin",
		} as typeof platformAdmins.$inferInsert);
	}

	// Clear any prior fixtures.
	const orgIds = [1, 2, 3, 4, 5].map(ORG);
	const subIds = [1, 2, 3, 4, 5].map(SUB);
	await controlPanelDb
		.delete(organizations)
		.where(inArray(organizations.id, orgIds));
	await controlPanelDb
		.delete(subscriptions)
		.where(inArray(subscriptions.id, subIds));

	// Sub 1: active, renews in 3 days, normal renewal.
	// Sub 2: active, renews in 10 days, cancel_at_period_end → at-risk.
	// Sub 3: trialing, renews in 25 days, normal.
	// Sub 4: past_due, period_end 5 days ago (oldest past_due).
	// Sub 5: unpaid, period_end 2 days ago.
	const seeds: Array<{
		id: string;
		periodEnd: Date | null;
		status: string;
		cancel: boolean;
		tier: string;
	}> = [
		{
			id: SUB(1),
			periodEnd: daysFromNow(3),
			status: "active",
			cancel: false,
			tier: "basic",
		},
		{
			id: SUB(2),
			periodEnd: daysFromNow(10),
			status: "active",
			cancel: true,
			tier: "professional",
		},
		{
			id: SUB(3),
			periodEnd: daysFromNow(25),
			status: "trialing",
			cancel: false,
			tier: "enterprise",
		},
		{
			id: SUB(4),
			periodEnd: daysFromNow(-5),
			status: "past_due",
			cancel: false,
			tier: "basic",
		},
		{
			id: SUB(5),
			periodEnd: daysFromNow(-2),
			status: "unpaid",
			cancel: false,
			tier: "professional",
		},
	];

	for (let i = 0; i < seeds.length; i++) {
		const s = seeds[i]!;
		await controlPanelDb.insert(subscriptions).values({
			id: s.id,
			stripeSubscriptionId: `sub_renewals_${s.id}`,
			stripeCustomerId: `cus_renewals_${s.id}`,
			stripePriceId: "price_test",
			tier: s.tier,
			organizationCountLimit: 1,
			applicationFeeBps: 100,
			currency: "usd",
			status: s.status,
			currentPeriodEnd: s.periodEnd ?? undefined,
			cancelAtPeriodEnd: s.cancel,
		} as typeof subscriptions.$inferInsert);
		await controlPanelDb.insert(organizations).values({
			id: ORG(i + 1),
			name: `Renewals Test Org ${i + 1}`,
			slug: `renewals-test-${i + 1}-${Date.now()}`,
			neonProjectId: `stub-renewals-${ORG(i + 1)}`,
			connectionString: "stub",
			paymentStatus: "active",
			subscriptionId: s.id,
		} as typeof organizations.$inferInsert);
	}
});

describe("getISOWeekStart", () => {
	it("returns Monday 00:00 UTC for various weekdays", () => {
		// 2026-05-17 is a Sunday.
		const sun = new Date(Date.UTC(2026, 4, 17, 12, 30, 0));
		const mon = getISOWeekStart(sun);
		expect(mon.getUTCDay()).toBe(1);
		expect(mon.getUTCHours()).toBe(0);
		expect(mon.toISOString()).toBe("2026-05-11T00:00:00.000Z");

		// 2026-05-13 is a Wednesday.
		const wed = new Date(Date.UTC(2026, 4, 13, 8, 0, 0));
		expect(getISOWeekStart(wed).toISOString()).toBe("2026-05-11T00:00:00.000Z");

		// Monday → itself (at 00:00).
		const monIn = new Date(Date.UTC(2026, 4, 11, 23, 59, 59));
		expect(getISOWeekStart(monIn).toISOString()).toBe(
			"2026-05-11T00:00:00.000Z",
		);
	});
});

describe("platformAdminRenewals.getCalendar", () => {
	it("buckets renewals by week + computes pass/at-risk MRR", async () => {
		const handler = getHandler<{
			weeks: Array<{
				weekStartISO: string;
				weekEndISO: string;
				renewals: Array<{
					orgId: string;
					mrrCents: number;
					cancelAtPeriodEnd: boolean;
				}>;
				totalMrrAtRiskCents: number;
				totalMrrPassingCents: number;
			}>;
			pastDue: Array<{
				orgId: string;
				currentPeriodEnd: string;
			}>;
			summary: {
				totalRenewalsInWindow: number;
				totalMrrAtRiskCents: number;
				totalMrrPassingCents: number;
				pastDueCount: number;
			};
		}>(platformAdminRenewalsRouter.getCalendar);

		const result = await handler({
			context: fakeContext(),
			input: { daysAhead: 90 },
		});

		// Weeks should cover ~14 weeks (90 days / 7 ≈ 13, plus current week
		// partial). Just sanity-check >= 13.
		expect(result.weeks.length).toBeGreaterThanOrEqual(13);

		// Per-week invariant: pass = sum of !cancel mrr, at-risk = sum of cancel mrr.
		for (const w of result.weeks) {
			const passSum = w.renewals
				.filter((r) => !r.cancelAtPeriodEnd)
				.reduce((s, r) => s + r.mrrCents, 0);
			const riskSum = w.renewals
				.filter((r) => r.cancelAtPeriodEnd)
				.reduce((s, r) => s + r.mrrCents, 0);
			expect(passSum).toBe(w.totalMrrPassingCents);
			expect(riskSum).toBe(w.totalMrrAtRiskCents);
		}

		// Our 3 seeded upcoming subs should be in the window.
		const allRenewalOrgIds = result.weeks
			.flatMap((w) => w.renewals)
			.map((r) => r.orgId);
		expect(allRenewalOrgIds).toContain(ORG(1));
		expect(allRenewalOrgIds).toContain(ORG(2));
		expect(allRenewalOrgIds).toContain(ORG(3));

		// MRR at-risk includes professional tier (sub 2).
		const proPrice = getTierPriceUsdCents("professional" as never);
		expect(result.summary.totalMrrAtRiskCents).toBeGreaterThanOrEqual(proPrice);
		// MRR passing includes basic (sub 1) + enterprise (sub 3).
		const basicPrice = getTierPriceUsdCents("basic" as never);
		const entPrice = getTierPriceUsdCents("enterprise" as never);
		expect(result.summary.totalMrrPassingCents).toBeGreaterThanOrEqual(
			basicPrice + entPrice,
		);

		// summary totals should equal sum across weeks.
		const sumWeeksRisk = result.weeks.reduce(
			(s, w) => s + w.totalMrrAtRiskCents,
			0,
		);
		const sumWeeksPass = result.weeks.reduce(
			(s, w) => s + w.totalMrrPassingCents,
			0,
		);
		expect(result.summary.totalMrrAtRiskCents).toBe(sumWeeksRisk);
		expect(result.summary.totalMrrPassingCents).toBe(sumWeeksPass);
		expect(result.summary.totalRenewalsInWindow).toBe(
			result.weeks.reduce((s, w) => s + w.renewals.length, 0),
		);
	});

	it("returns past-due subs sorted by currentPeriodEnd ASC (oldest first)", async () => {
		const handler = getHandler<{
			pastDue: Array<{
				orgId: string;
				currentPeriodEnd: string;
				status: string;
			}>;
			summary: { pastDueCount: number };
		}>(platformAdminRenewalsRouter.getCalendar);

		const result = await handler({
			context: fakeContext(),
			input: { daysAhead: 90 },
		});

		// At minimum our 2 fixtures should appear.
		const ours = result.pastDue.filter(
			(p) => p.orgId === ORG(4) || p.orgId === ORG(5),
		);
		expect(ours.length).toBe(2);
		// ORG(4) at -5 days is older than ORG(5) at -2 days.
		const idx4 = ours.findIndex((p) => p.orgId === ORG(4));
		const idx5 = ours.findIndex((p) => p.orgId === ORG(5));
		expect(idx4).toBeLessThan(idx5);

		// Global ordering: each consecutive entry ≥ previous.
		for (let i = 1; i < result.pastDue.length; i++) {
			const prev = result.pastDue[i - 1]!.currentPeriodEnd;
			const cur = result.pastDue[i]!.currentPeriodEnd;
			expect(prev <= cur).toBe(true);
		}

		expect(result.summary.pastDueCount).toBe(result.pastDue.length);
	});

	it("respects daysAhead — narrower window produces fewer/equal weeks", async () => {
		const handler = getHandler<{
			weeks: Array<unknown>;
		}>(platformAdminRenewalsRouter.getCalendar);
		const wide = await handler({
			context: fakeContext(),
			input: { daysAhead: 90 },
		});
		const narrow = await handler({
			context: fakeContext(),
			input: { daysAhead: 30 },
		});
		expect(narrow.weeks.length).toBeLessThanOrEqual(wide.weeks.length);
	});
});
