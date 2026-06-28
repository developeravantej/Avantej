/**
 * Unit tests for the Google Calendar pull-sync (UAT §6 "Read availability").
 *
 * Covers:
 * - listCalendarEvents: builds the query window + returns items
 * - pullExternalBusyBlocks: upserts ONLY timed busy events (skips cancelled,
 *   transparent/free, and all-day date-only), prunes stale rows, records
 *   lastSyncAt, and returns accurate counts. The Google round-trip is injected
 *   so no real OAuth/credentials are needed.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import {
	listCalendarEvents,
	type GoogleCalendarEvent,
} from "@avantej-core/services/google-calendar.service";
import { pullExternalBusyBlocks } from "@avantej-core/services/google-calendar-sync.service";

const originalFetch = globalThis.fetch;
beforeEach(() => {
	globalThis.fetch = originalFetch;
});
afterEach(() => {
	globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// listCalendarEvents
// ---------------------------------------------------------------------------

describe("listCalendarEvents", () => {
	test("requests the time window with singleEvents and returns items", async () => {
		let calledUrl = "";
		globalThis.fetch = mock((url: string) => {
			calledUrl = String(url);
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						items: [{ id: "e1", start: {}, end: {} }],
					}),
				text: () => Promise.resolve("{}"),
			} as unknown as Response);
		}) as unknown as typeof fetch;

		const items = await listCalendarEvents(
			"tok",
			"primary",
			new Date("2026-07-01T00:00:00Z"),
			new Date("2026-07-08T00:00:00Z"),
		);

		expect(items).toHaveLength(1);
		expect(calledUrl).toContain("/calendars/primary/events");
		expect(calledUrl).toContain("singleEvents=true");
		expect(calledUrl).toContain("timeMin=2026-07-01");
		expect(calledUrl).toContain("timeMax=2026-07-08");
	});

	test("throws on a non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 401,
				json: () => Promise.resolve({}),
				text: () => Promise.resolve("unauthorized"),
			} as unknown as Response),
		) as unknown as typeof fetch;

		await expect(
			listCalendarEvents("tok", "primary", new Date(), new Date()),
		).rejects.toThrow(/List events failed/);
	});
});

// ---------------------------------------------------------------------------
// pullExternalBusyBlocks — fake tenant DB + injected Google read
// ---------------------------------------------------------------------------

type Upsert = { values: Record<string, unknown> };

function makeFakeDb() {
	const upserts: Upsert[] = [];
	const statusUpdates: Record<string, unknown>[] = [];
	let pruneCalls = 0;
	const prunedRows = [{ id: "stale-1" }];

	const db = {
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				onConflictDoUpdate: () => {
					upserts.push({ values });
					return Promise.resolve();
				},
			}),
		}),
		delete: () => ({
			where: () => ({
				returning: () => {
					pruneCalls++;
					return Promise.resolve(prunedRows);
				},
			}),
		}),
		update: () => ({
			set: (set: Record<string, unknown>) => ({
				where: () => {
					statusUpdates.push(set);
					return Promise.resolve();
				},
			}),
		}),
	};

	return {
		db: db as unknown as Parameters<typeof pullExternalBusyBlocks>[0],
		upserts,
		statusUpdates,
		get pruneCalls() {
			return pruneCalls;
		},
	};
}

function makeConnection() {
	return {
		id: "conn-1",
		memberId: "trainer-1",
		calendarId: "primary",
		// Plaintext token + far-future expiry → ensureValidToken skips refresh and
		// decryptToken passes the value through unchanged (legacy passthrough).
		accessToken: "plain-token",
		refreshToken: "plain-refresh",
		tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
		isActive: true,
	} as unknown as Parameters<typeof pullExternalBusyBlocks>[1];
}

const window = {
	windowStart: new Date("2026-07-01T00:00:00Z"),
	windowEnd: new Date("2026-07-31T00:00:00Z"),
};
const config = { clientId: "cid", clientSecret: "secret" };

describe("pullExternalBusyBlocks", () => {
	test("upserts only timed busy events; skips cancelled, free, and all-day", async () => {
		const events: GoogleCalendarEvent[] = [
			{
				id: "busy-1",
				summary: "Client meeting",
				start: { dateTime: "2026-07-02T09:00:00Z" },
				end: { dateTime: "2026-07-02T10:00:00Z" },
			},
			{
				id: "cancelled-1",
				status: "cancelled",
				start: { dateTime: "2026-07-02T11:00:00Z" },
				end: { dateTime: "2026-07-02T12:00:00Z" },
			},
			{
				id: "free-1",
				transparency: "transparent",
				start: { dateTime: "2026-07-03T09:00:00Z" },
				end: { dateTime: "2026-07-03T10:00:00Z" },
			},
			{
				id: "allday-1",
				start: { date: "2026-07-04" },
				end: { date: "2026-07-05" },
			},
		];

		const fake = makeFakeDb();
		const result = await pullExternalBusyBlocks(
			fake.db,
			makeConnection(),
			window,
			config,
			{ listCalendarEvents: async () => events },
		);

		// Only the one timed, busy, non-cancelled event is synced.
		expect(result.synced).toBe(1);
		expect(fake.upserts).toHaveLength(1);
		expect(fake.upserts[0]?.values.googleEventId).toBe("busy-1");
		expect(fake.upserts[0]?.values.trainerId).toBe("trainer-1");
		expect(fake.upserts[0]?.values.connectionId).toBe("conn-1");

		// Prune ran and lastSyncAt was recorded (lastSyncError cleared).
		expect(fake.pruneCalls).toBe(1);
		expect(result.pruned).toBe(1);
		const lastStatus = fake.statusUpdates.at(-1);
		expect(lastStatus?.lastSyncAt).toBeInstanceOf(Date);
		expect(lastStatus?.lastSyncError).toBeNull();
	});

	test("skips zero/negative-length events", async () => {
		const events: GoogleCalendarEvent[] = [
			{
				id: "zero-1",
				start: { dateTime: "2026-07-02T09:00:00Z" },
				end: { dateTime: "2026-07-02T09:00:00Z" }, // end == start
			},
		];
		const fake = makeFakeDb();
		const result = await pullExternalBusyBlocks(
			fake.db,
			makeConnection(),
			window,
			config,
			{ listCalendarEvents: async () => events },
		);
		expect(result.synced).toBe(0);
		expect(fake.upserts).toHaveLength(0);
	});

	test("records lastSyncError and rethrows when the Google read fails", async () => {
		const fake = makeFakeDb();
		await expect(
			pullExternalBusyBlocks(fake.db, makeConnection(), window, config, {
				listCalendarEvents: async () => {
					throw new Error("boom");
				},
			}),
		).rejects.toThrow(/boom/);
		const lastStatus = fake.statusUpdates.at(-1);
		expect(String(lastStatus?.lastSyncError)).toContain("boom");
	});
});
