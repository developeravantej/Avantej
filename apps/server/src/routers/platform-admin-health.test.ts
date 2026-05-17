/**
 * Plan F.4 — Health Scoreboard router unit tests (Agent He).
 *
 * Seeds tenant_usage_snapshots with varied health_score + risk_flags
 * arrays across multiple orgs, then asserts:
 *   - 5-band histogram math (sum bands.count === totalScoredOrgs).
 *   - Band boundary edge cases (0, 19, 20, 79, 80, 100).
 *   - Top-at-risk ordering (lowest score first) + topAtRiskLimit clamp.
 *   - Flag rollup count + unique-orgs math + sort-by-count-desc.
 *   - 30-day trend daily aggregation.
 *
 * Pure DB read — no Stripe / external mocks needed.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	platformAdminHealthRouter,
	bandIndexForScore,
} from "./platform-admin-health";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { tenantUsageSnapshots } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";

const PREFIX = "00000000-0000-0000-0000-44450000";
const TEST_USER_ID = "test-admin-user-health-scoreboard";

const ORG = (n: number) => `${PREFIX}${String(n).padStart(4, "0")}`;

function getHandler<T>(proc: unknown): (args: unknown) => Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((proc as any)["~orpc"] as Record<string, unknown>).handler as (
		args: unknown,
	) => Promise<T>;
}

function fakeContext() {
	return {
		session: { user: { id: TEST_USER_ID, email: "admin@test.local" } },
		honoContext: {
			get: (k: string) =>
				k === "controlPanelDb" ? controlPanelDb : undefined,
		},
	};
}

function isoDay(daysAgo: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - daysAgo);
	return d.toISOString().slice(0, 10);
}

type Seed = {
	idx: number;
	score: number | null;
	flags: Array<{ code: string; severity: "info" | "warn" | "critical" }>;
};

beforeEach(async () => {
	const existingUser = await controlPanelDb.query.user.findFirst({
		where: eq(userTable.id, TEST_USER_ID),
	});
	if (!existingUser) {
		await controlPanelDb.insert(userTable).values({
			id: TEST_USER_ID,
			email: `${TEST_USER_ID}@test.local`,
			name: "Health Scoreboard Admin",
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

	// Clean prior fixtures.
	const orgIds = [1, 2, 3, 4, 5, 6, 7].map(ORG);
	await controlPanelDb
		.delete(tenantUsageSnapshots)
		.where(inArray(tenantUsageSnapshots.organizationId, orgIds));
	await controlPanelDb
		.delete(organizations)
		.where(inArray(organizations.id, orgIds));

	// 7 orgs spanning all 5 bands plus boundary edges.
	const seeds: Seed[] = [
		// Band 0 (0-19)
		{
			idx: 1,
			score: 5,
			flags: [
				{ code: "payment_stale", severity: "critical" },
				{ code: "webhook_failures", severity: "warn" },
			],
		},
		// Band 0 boundary high (19)
		{
			idx: 2,
			score: 19,
			flags: [{ code: "payment_stale", severity: "critical" }],
		},
		// Band 1 boundary low (20)
		{
			idx: 3,
			score: 20,
			flags: [{ code: "low_activity", severity: "warn" }],
		},
		// Band 3 (60-79) boundary high (79)
		{
			idx: 4,
			score: 79,
			flags: [{ code: "no_data", severity: "info" }],
		},
		// Band 4 boundary low (80)
		{
			idx: 5,
			score: 80,
			flags: [],
		},
		// Band 4 boundary high (100)
		{
			idx: 6,
			score: 100,
			flags: [],
		},
		// Unscored
		{ idx: 7, score: null, flags: [] },
	];

	for (const s of seeds) {
		await controlPanelDb.insert(organizations).values({
			id: ORG(s.idx),
			name: `Health Test Org ${s.idx}`,
			slug: `health-test-${s.idx}-${Date.now()}`,
			neonProjectId: `stub-health-${ORG(s.idx)}`,
			connectionString: "stub",
			paymentStatus: "active",
		} as typeof organizations.$inferInsert);

		// Insert today's snapshot (latest).
		await controlPanelDb.insert(tenantUsageSnapshots).values({
			organizationId: ORG(s.idx),
			snapshotDate: isoDay(0),
			memberCount: 0,
			customerCount: 0,
			apptCount30d: 0,
			salesTotal30dMinor: 0,
			salesCurrency: "MYR",
			storageBytes: 0,
			ghlActive: false,
			healthScore: s.score,
			riskFlags:
				s.flags.length > 0
					? s.flags.map((f) => ({
							code: f.code,
							severity: f.severity,
							observedAt: new Date().toISOString(),
						}))
					: null,
		} as typeof tenantUsageSnapshots.$inferInsert);

		// Insert a slightly older snapshot (yesterday) to test "latest only"
		// — give org #1 a much-higher older score; latest should still win.
		if (s.idx === 1) {
			await controlPanelDb.insert(tenantUsageSnapshots).values({
				organizationId: ORG(s.idx),
				snapshotDate: isoDay(1),
				memberCount: 0,
				customerCount: 0,
				apptCount30d: 0,
				salesTotal30dMinor: 0,
				salesCurrency: "MYR",
				storageBytes: 0,
				ghlActive: false,
				healthScore: 95, // Stale + high — must NOT appear in topAtRisk.
				riskFlags: null,
			} as typeof tenantUsageSnapshots.$inferInsert);
		}
	}
});

describe("bandIndexForScore", () => {
	it("buckets boundary scores correctly", () => {
		expect(bandIndexForScore(0)).toBe(0);
		expect(bandIndexForScore(19)).toBe(0);
		expect(bandIndexForScore(20)).toBe(1);
		expect(bandIndexForScore(39)).toBe(1);
		expect(bandIndexForScore(40)).toBe(2);
		expect(bandIndexForScore(59)).toBe(2);
		expect(bandIndexForScore(60)).toBe(3);
		expect(bandIndexForScore(79)).toBe(3);
		expect(bandIndexForScore(80)).toBe(4);
		expect(bandIndexForScore(100)).toBe(4);
	});
});

describe("platformAdminHealth.getScoreboard", () => {
	it("returns 5 monotonically-increasing bands summing to totalScoredOrgs", async () => {
		const handler = getHandler<{
			histogram: {
				bands: Array<{ min: number; max: number; count: number }>;
				totalScoredOrgs: number;
				unscoredOrgs: number;
			};
		}>(platformAdminHealthRouter.getScoreboard);

		const result = await handler({
			context: fakeContext(),
			input: { topAtRiskLimit: 20 },
		});

		expect(result.histogram.bands.length).toBe(5);

		// Monotonically increasing min + max.
		for (let i = 1; i < result.histogram.bands.length; i++) {
			expect(result.histogram.bands[i]!.min).toBeGreaterThan(
				result.histogram.bands[i - 1]!.min,
			);
			expect(result.histogram.bands[i]!.max).toBeGreaterThan(
				result.histogram.bands[i - 1]!.max,
			);
		}

		const sum = result.histogram.bands.reduce((s, b) => s + b.count, 0);
		expect(sum).toBe(result.histogram.totalScoredOrgs);
		// Our 6 scored fixtures must each register in some band.
		expect(result.histogram.totalScoredOrgs).toBeGreaterThanOrEqual(6);
	});

	it("topAtRisk ordered by score ASC + respects limit", async () => {
		const handler = getHandler<{
			topAtRisk: Array<{
				orgId: string;
				healthScore: number;
				snapshotDate: string;
			}>;
		}>(platformAdminHealthRouter.getScoreboard);

		const wide = await handler({
			context: fakeContext(),
			input: { topAtRiskLimit: 50 },
		});
		for (let i = 1; i < wide.topAtRisk.length; i++) {
			expect(wide.topAtRisk[i]!.healthScore).toBeGreaterThanOrEqual(
				wide.topAtRisk[i - 1]!.healthScore,
			);
		}
		// Our worst-scored org (5) must come before our best-scored (100).
		const idx5 = wide.topAtRisk.findIndex((r) => r.orgId === ORG(1));
		const idx100 = wide.topAtRisk.findIndex((r) => r.orgId === ORG(6));
		expect(idx5).toBeGreaterThanOrEqual(0);
		expect(idx100).toBeGreaterThanOrEqual(0);
		expect(idx5).toBeLessThan(idx100);
		// Latest-snapshot wins: ORG(1) score should be 5, not the stale 95.
		const org1Row = wide.topAtRisk.find((r) => r.orgId === ORG(1));
		expect(org1Row?.healthScore).toBe(5);

		// snapshotDate present and ISO-ish (YYYY-MM-DD).
		expect(org1Row?.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

		const narrow = await handler({
			context: fakeContext(),
			input: { topAtRiskLimit: 3 },
		});
		expect(narrow.topAtRisk.length).toBeLessThanOrEqual(3);
	});

	it("flagRollup counts unique orgs per flag + sorts by count DESC", async () => {
		const handler = getHandler<{
			flagRollup: Array<{
				flagCode: string;
				count: number;
				uniqueOrgs: number;
				severity: string;
			}>;
		}>(platformAdminHealthRouter.getScoreboard);

		const result = await handler({
			context: fakeContext(),
			input: { topAtRiskLimit: 20 },
		});

		// Sorted DESC by count.
		for (let i = 1; i < result.flagRollup.length; i++) {
			expect(result.flagRollup[i]!.count).toBeLessThanOrEqual(
				result.flagRollup[i - 1]!.count,
			);
		}

		// payment_stale appears in our fixtures for orgs 1 + 2 → ≥2.
		const paymentStale = result.flagRollup.find(
			(f) => f.flagCode === "payment_stale",
		);
		expect(paymentStale).toBeDefined();
		expect(paymentStale!.count).toBeGreaterThanOrEqual(2);
		expect(paymentStale!.uniqueOrgs).toBe(paymentStale!.count);
		expect(paymentStale!.severity).toBe("critical");

		// webhook_failures appears only on org 1 → ≥1.
		const wf = result.flagRollup.find((f) => f.flagCode === "webhook_failures");
		expect(wf).toBeDefined();
		expect(wf!.count).toBeGreaterThanOrEqual(1);
	});

	it("trend.avgScoreLast30dByDay returns sorted daily aggregates", async () => {
		const handler = getHandler<{
			trend: {
				avgScoreLast30dByDay: Array<{
					date: string;
					avgScore: number;
					sampleSize: number;
				}>;
			};
		}>(platformAdminHealthRouter.getScoreboard);

		const result = await handler({
			context: fakeContext(),
			input: { topAtRiskLimit: 5 },
		});

		// Should include today (since we wrote today snapshots).
		const today = isoDay(0);
		const todayRow = result.trend.avgScoreLast30dByDay.find(
			(r) => r.date === today,
		);
		expect(todayRow).toBeDefined();
		expect(todayRow!.sampleSize).toBeGreaterThanOrEqual(6);

		// Sorted ASC by date.
		for (let i = 1; i < result.trend.avgScoreLast30dByDay.length; i++) {
			expect(
				result.trend.avgScoreLast30dByDay[i]!.date >=
					result.trend.avgScoreLast30dByDay[i - 1]!.date,
			).toBe(true);
		}
	});

	it("histogram.unscoredOrgs reflects orgs without health_score", async () => {
		const handler = getHandler<{
			histogram: { unscoredOrgs: number; totalScoredOrgs: number };
		}>(platformAdminHealthRouter.getScoreboard);

		const result = await handler({
			context: fakeContext(),
			input: { topAtRiskLimit: 5 },
		});

		// We seeded 1 unscored fixture; other test/dev orgs may also be unscored.
		expect(result.histogram.unscoredOrgs).toBeGreaterThanOrEqual(1);
	});
});
