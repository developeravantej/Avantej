/**
 * Unit tests for google-calendar.service.ts additions (Tasks 1.16–1.36)
 *
 * Covers:
 * - listGoogleCalendars: happy path, error path, empty items array
 * - GoogleCalendarListEntry shape validation
 * - 24h cache staleness logic (JS-side, mirrors router logic)
 */
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import {
	listGoogleCalendars,
	type GoogleCalendarListEntry,
} from "@avantej-core/services/google-calendar.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown) {
	return mock(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve(body),
			text: () => Promise.resolve(JSON.stringify(body)),
		} as unknown as Response),
	);
}

function mockFetchError(status: number, text: string) {
	return mock(() =>
		Promise.resolve({
			ok: false,
			status,
			json: () => Promise.resolve({}),
			text: () => Promise.resolve(text),
		} as unknown as Response),
	);
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
	// reset to original fetch before each test
	globalThis.fetch = originalFetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// listGoogleCalendars
// ---------------------------------------------------------------------------

describe("listGoogleCalendars", () => {
	test("returns mapped calendar entries on success", async () => {
		const rawItems = [
			{
				id: "cal1@group.calendar.google.com",
				summary: "Avantej Branch",
				description: "Branch bookings",
				primary: false,
				accessRole: "owner",
				backgroundColor: "#ff0000",
			},
			{
				id: "primary",
				summary: "john@example.com",
				primary: true,
				accessRole: "owner",
			},
		];
		globalThis.fetch = mockFetchOk({
			items: rawItems,
		}) as unknown as typeof fetch;

		const result = await listGoogleCalendars("test-access-token");

		expect(result).toHaveLength(2);

		const first = result[0] as GoogleCalendarListEntry;
		expect(first.id).toBe("cal1@group.calendar.google.com");
		expect(first.summary).toBe("Avantej Branch");
		expect(first.description).toBe("Branch bookings");
		expect(first.primary).toBe(false);
		expect(first.accessRole).toBe("owner");
		expect(first.backgroundColor).toBe("#ff0000");

		const second = result[1] as GoogleCalendarListEntry;
		expect(second.primary).toBe(true);
		expect(second.description).toBeUndefined();
	});

	test("returns empty array when items is absent", async () => {
		globalThis.fetch = mockFetchOk({}) as unknown as typeof fetch;
		const result = await listGoogleCalendars("test-token");
		expect(result).toEqual([]);
	});

	test("returns empty array when items is empty", async () => {
		globalThis.fetch = mockFetchOk({ items: [] }) as unknown as typeof fetch;
		const result = await listGoogleCalendars("test-token");
		expect(result).toEqual([]);
	});

	test("throws on non-ok Google response", async () => {
		globalThis.fetch = mockFetchError(
			401,
			"Unauthorized",
		) as unknown as typeof fetch;
		await expect(listGoogleCalendars("bad-token")).rejects.toThrow(
			"Calendar list fetch failed: Unauthorized",
		);
	});

	test("sends correct Authorization header", async () => {
		let capturedRequest: RequestInfo | URL | undefined;
		let capturedInit: RequestInit | undefined;

		globalThis.fetch = mock((url: RequestInfo | URL, init?: RequestInit) => {
			capturedRequest = url;
			capturedInit = init;
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ items: [] }),
				text: () => Promise.resolve(""),
			} as unknown as Response);
		}) as unknown as typeof fetch;

		await listGoogleCalendars("my-access-token-123");

		expect(String(capturedRequest)).toContain("calendarList");
		expect(
			(capturedInit?.headers as Record<string, string>)?.["Authorization"],
		).toBe("Bearer my-access-token-123");
	});
});

// ---------------------------------------------------------------------------
// 24h cache staleness logic (mirrors router: cacheAgeMs < 24h threshold)
// ---------------------------------------------------------------------------

describe("24h cache staleness check", () => {
	function isCacheValid(cachedAt: Date): boolean {
		const cacheAgeMs = Date.now() - cachedAt.getTime();
		return cacheAgeMs < 24 * 60 * 60 * 1000;
	}

	test("cache younger than 24h is valid", () => {
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		expect(isCacheValid(oneHourAgo)).toBe(true);
	});

	test("cache exactly 24h old is invalid (boundary)", () => {
		const exactly24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
		expect(isCacheValid(exactly24h)).toBe(false);
	});

	test("cache older than 24h is invalid", () => {
		const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
		expect(isCacheValid(twoDaysAgo)).toBe(false);
	});

	test("cache just under 24h is valid", () => {
		const justUnder24h = new Date(Date.now() - (24 * 60 * 60 * 1000 - 1));
		expect(isCacheValid(justUnder24h)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Rate-limit guard logic (mirrors syncNow in-memory Map logic)
// ---------------------------------------------------------------------------

describe("syncNow rate-limit guard", () => {
	const COOLDOWN_MS = 60_000;

	function isRateLimited(lastCalled: number | undefined): boolean {
		if (lastCalled === undefined) return false;
		return Date.now() - lastCalled < COOLDOWN_MS;
	}

	test("first call is never rate-limited", () => {
		expect(isRateLimited(undefined)).toBe(false);
	});

	test("call within 60s is rate-limited", () => {
		const thirtySecsAgo = Date.now() - 30_000;
		expect(isRateLimited(thirtySecsAgo)).toBe(true);
	});

	test("call after 60s is not rate-limited", () => {
		const overAMinuteAgo = Date.now() - 61_000;
		expect(isRateLimited(overAMinuteAgo)).toBe(false);
	});
});
