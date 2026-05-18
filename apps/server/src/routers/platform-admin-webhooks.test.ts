/**
 * Plan F.4 — Webhooks Log router unit tests (Agent Wh).
 *
 * Seeds processed_webhook_events with varied event_types, sources, and
 * error/processed_at states, then asserts:
 *   - getOverview KPI math (24h / 7d windows, duplicates, success/failure splits).
 *   - byEventType rollup count + sort-by-count-desc.
 *   - recent[] ordered DESC by receivedAt and capped at 20.
 *   - listEvents pagination math (total, page, limit, offset).
 *   - listEvents eventType filter narrows the result.
 *   - listEvents days filter narrows the time window.
 *
 * Pure DB read — no Stripe / external mocks needed.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq, sql } from "drizzle-orm";
import {
	platformAdminWebhooksRouter,
	deriveStatus,
} from "./platform-admin-webhooks";
import { controlPanelDb } from "@/lib/db";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";

const TEST_USER_ID = "test-admin-user-webhooks-log";
const PREFIX = "evt_test_f4_wh_";
const ID = (n: number) => `${PREFIX}${String(n).padStart(4, "0")}`;

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

function hoursAgo(h: number): Date {
	const d = new Date();
	d.setUTCMinutes(d.getUTCMinutes() - h * 60);
	return d;
}

function daysAgo(d: number): Date {
	const x = new Date();
	x.setUTCDate(x.getUTCDate() - d);
	return x;
}

beforeEach(async () => {
	// Ensure admin user exists.
	const existingUser = await controlPanelDb.query.user.findFirst({
		where: eq(userTable.id, TEST_USER_ID),
	});
	if (!existingUser) {
		await controlPanelDb.insert(userTable).values({
			id: TEST_USER_ID,
			email: `${TEST_USER_ID}@test.local`,
			name: "Webhooks Log Admin",
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

	// Clean prior fixtures (any rows whose event_id starts with our PREFIX).
	await controlPanelDb
		.delete(processedWebhookEvents)
		.where(sql`${processedWebhookEvents.eventId} LIKE ${`${PREFIX}%`}`);

	// Seed: 6 events within last 24h, 4 older but within 7d, 2 outside 7d.
	const rows = [
		// last 24h
		{
			eventId: ID(1),
			eventType: "checkout.session.completed",
			source: "platform",
			receivedAt: hoursAgo(1),
			processedAt: hoursAgo(1),
			attempts: 1,
			error: null as string | null,
		},
		{
			eventId: ID(2),
			eventType: "checkout.session.completed",
			source: "platform",
			receivedAt: hoursAgo(2),
			processedAt: hoursAgo(2),
			attempts: 2, // duplicate
			error: null,
		},
		{
			eventId: ID(3),
			eventType: "invoice.payment_failed",
			source: "platform",
			receivedAt: hoursAgo(3),
			processedAt: null,
			attempts: 1,
			error: "Handler threw: NetworkError", // failed
		},
		{
			eventId: ID(4),
			eventType: "customer.subscription.deleted",
			source: "platform",
			receivedAt: hoursAgo(4),
			processedAt: hoursAgo(4),
			attempts: 1,
			error: null,
		},
		{
			eventId: ID(5),
			eventType: "customer.subscription.deleted",
			source: "connect",
			receivedAt: hoursAgo(5),
			processedAt: null,
			attempts: 1,
			error: null, // pending
		},
		{
			eventId: ID(6),
			eventType: "account.updated",
			source: "connect",
			receivedAt: hoursAgo(6),
			processedAt: hoursAgo(6),
			attempts: 3, // duplicate
			error: null,
		},
		// older but within 7d
		{
			eventId: ID(7),
			eventType: "checkout.session.completed",
			source: "platform",
			receivedAt: daysAgo(3),
			processedAt: daysAgo(3),
			attempts: 1,
			error: null,
		},
		{
			eventId: ID(8),
			eventType: "invoice.paid",
			source: "platform",
			receivedAt: daysAgo(4),
			processedAt: daysAgo(4),
			attempts: 1,
			error: null,
		},
		{
			eventId: ID(9),
			eventType: "invoice.paid",
			source: "platform",
			receivedAt: daysAgo(5),
			processedAt: daysAgo(5),
			attempts: 1,
			error: null,
		},
		{
			eventId: ID(10),
			eventType: "invoice.paid",
			source: "platform",
			receivedAt: daysAgo(6),
			processedAt: null,
			attempts: 1,
			error: "Stripe API timeout",
		},
		// outside 7d (must NOT count toward any 7d KPI)
		{
			eventId: ID(11),
			eventType: "checkout.session.completed",
			source: "platform",
			receivedAt: daysAgo(10),
			processedAt: daysAgo(10),
			attempts: 1,
			error: null,
		},
		{
			eventId: ID(12),
			eventType: "ancient.event",
			source: "platform",
			receivedAt: daysAgo(40),
			processedAt: daysAgo(40),
			attempts: 1,
			error: null,
		},
	];

	for (const r of rows) {
		await controlPanelDb.insert(processedWebhookEvents).values({
			eventId: r.eventId,
			eventType: r.eventType,
			source: r.source,
			receivedAt: r.receivedAt,
			processedAt: r.processedAt,
			attempts: r.attempts,
			error: r.error,
		} as typeof processedWebhookEvents.$inferInsert);
	}
});

describe("deriveStatus", () => {
	it("returns failed when error present", () => {
		expect(deriveStatus({ processedAt: new Date(), error: "boom" })).toBe(
			"failed",
		);
		expect(deriveStatus({ processedAt: null, error: "boom" })).toBe("failed");
	});
	it("returns succeeded when processedAt set + no error", () => {
		expect(deriveStatus({ processedAt: new Date(), error: null })).toBe(
			"succeeded",
		);
	});
	it("returns pending when neither", () => {
		expect(deriveStatus({ processedAt: null, error: null })).toBe("pending");
	});
});

describe("platformAdminWebhooks.getOverview", () => {
	it("KPI counts respect 24h vs 7d windows + duplicates", async () => {
		const handler = getHandler<{
			kpis: {
				totalLast24h: number;
				totalLast7d: number;
				duplicatesLast7d: number;
				uniqueEventTypes: number;
				successesLast7d: number;
				failuresLast7d: number;
			};
		}>(platformAdminWebhooksRouter.getOverview);

		const result = await handler({ context: fakeContext(), input: {} });

		// 24h: 6 of our fixtures
		expect(result.kpis.totalLast24h).toBeGreaterThanOrEqual(6);
		// 7d: 10 of our fixtures (6 in 24h + 4 older within 7d). Other rows from
		// dev seed may also count, so use a lower bound.
		expect(result.kpis.totalLast7d).toBeGreaterThanOrEqual(10);
		// Duplicates within 7d: 2 (id 2 attempts=2, id 6 attempts=3)
		expect(result.kpis.duplicatesLast7d).toBeGreaterThanOrEqual(2);
		// Failures within 7d: 2 (id 3 + id 10)
		expect(result.kpis.failuresLast7d).toBeGreaterThanOrEqual(2);
		// Successes within 7d: id 1,2,4,6,7,8,9 → ≥7
		expect(result.kpis.successesLast7d).toBeGreaterThanOrEqual(7);
		// Unique event types within 7d: at least 5 of ours
		expect(result.kpis.uniqueEventTypes).toBeGreaterThanOrEqual(5);
	});

	it("byEventType is sorted by count DESC and includes lastSeenAt", async () => {
		const handler = getHandler<{
			byEventType: Array<{
				eventType: string;
				count: number;
				lastSeenAt: string;
			}>;
		}>(platformAdminWebhooksRouter.getOverview);

		const result = await handler({ context: fakeContext(), input: {} });

		for (let i = 1; i < result.byEventType.length; i++) {
			expect(result.byEventType[i]!.count).toBeLessThanOrEqual(
				result.byEventType[i - 1]!.count,
			);
		}

		// checkout.session.completed appears 3x within 7d (ids 1,2,7).
		const cs = result.byEventType.find(
			(e) => e.eventType === "checkout.session.completed",
		);
		expect(cs).toBeDefined();
		expect(cs!.count).toBeGreaterThanOrEqual(3);
		expect(cs!.lastSeenAt.length).toBeGreaterThan(0);

		// ancient.event is older than 7d → must NOT appear.
		const ancient = result.byEventType.find(
			(e) => e.eventType === "ancient.event",
		);
		expect(ancient).toBeUndefined();
	});

	it("recent[] is ordered DESC by receivedAt and capped at 20", async () => {
		const handler = getHandler<{
			recent: Array<{
				eventId: string;
				receivedAt: string;
				status: string;
			}>;
		}>(platformAdminWebhooksRouter.getOverview);

		const result = await handler({ context: fakeContext(), input: {} });
		expect(result.recent.length).toBeLessThanOrEqual(20);

		for (let i = 1; i < result.recent.length; i++) {
			expect(
				result.recent[i]!.receivedAt <= result.recent[i - 1]!.receivedAt,
			).toBe(true);
		}
	});
});

describe("platformAdminWebhooks.listEvents", () => {
	it("returns paginated rows with total + page + limit", async () => {
		const handler = getHandler<{
			rows: Array<{ eventId: string; receivedAt: string }>;
			total: number;
			page: number;
			limit: number;
		}>(platformAdminWebhooksRouter.listEvents);

		const result = await handler({
			context: fakeContext(),
			input: { days: 7, limit: 5, page: 1 },
		});

		expect(result.page).toBe(1);
		expect(result.limit).toBe(5);
		expect(result.rows.length).toBeLessThanOrEqual(5);
		expect(result.total).toBeGreaterThanOrEqual(result.rows.length);
		// Within 7d, our fixtures alone provide 10 rows.
		expect(result.total).toBeGreaterThanOrEqual(10);

		// Order DESC.
		for (let i = 1; i < result.rows.length; i++) {
			expect(
				result.rows[i]!.receivedAt <= result.rows[i - 1]!.receivedAt,
			).toBe(true);
		}
	});

	it("eventType filter narrows result set", async () => {
		const handler = getHandler<{
			rows: Array<{ eventId: string; eventType: string }>;
			total: number;
		}>(platformAdminWebhooksRouter.listEvents);

		const result = await handler({
			context: fakeContext(),
			input: {
				eventType: "checkout.session.completed",
				days: 7,
				limit: 50,
				page: 1,
			},
		});

		expect(result.total).toBeGreaterThanOrEqual(3);
		for (const r of result.rows) {
			expect(r.eventType).toBe("checkout.session.completed");
		}
	});

	it("days filter excludes events older than the window", async () => {
		const handler = getHandler<{
			rows: Array<{ eventId: string }>;
			total: number;
		}>(platformAdminWebhooksRouter.listEvents);

		const narrow = await handler({
			context: fakeContext(),
			input: { days: 1, limit: 200, page: 1 },
		});
		// id 11 (10d old) + id 12 (40d old) must NOT appear in a 1-day window.
		expect(narrow.rows.find((r) => r.eventId === ID(11))).toBeUndefined();
		expect(narrow.rows.find((r) => r.eventId === ID(12))).toBeUndefined();

		const wide = await handler({
			context: fakeContext(),
			input: { days: 90, limit: 200, page: 1 },
		});
		// 90d window includes ID(11) but ID(12) is 40d ago → included.
		expect(wide.total).toBeGreaterThanOrEqual(narrow.total);
		expect(wide.rows.find((r) => r.eventId === ID(11))).toBeDefined();
	});

	it("page offset advances correctly", async () => {
		const handler = getHandler<{
			rows: Array<{ eventId: string }>;
			total: number;
		}>(platformAdminWebhooksRouter.listEvents);

		const p1 = await handler({
			context: fakeContext(),
			input: { days: 90, limit: 3, page: 1 },
		});
		const p2 = await handler({
			context: fakeContext(),
			input: { days: 90, limit: 3, page: 2 },
		});

		// Different pages must not return overlapping eventIds.
		const ids1 = new Set(p1.rows.map((r) => r.eventId));
		for (const r of p2.rows) {
			expect(ids1.has(r.eventId)).toBe(false);
		}
	});
});
