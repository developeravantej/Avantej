// apps/server/src/services/ghl/http-client.test.ts
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { ghlFetch } from "./http-client";

describe("ghlFetch", () => {
	beforeEach(() => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ ok: true }), { status: 200 }),
			),
		);
	});

	test("sends Authorization header with Bearer token", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ ok: true }), { status: 200 }),
			),
		);
		(globalThis as any).fetch = fetchMock;

		await ghlFetch({
			method: "GET",
			path: "/contacts/abc",
			apiKey: "key_xyz",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const callArgs = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const url = callArgs[0];
		const init = callArgs[1];
		expect(url).toBe("https://services.leadconnectorhq.com/contacts/abc");
		const headers = init.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer key_xyz");
		expect(headers["Version"]).toBe("2021-07-28");
	});

	test("returns parsed JSON body on 2xx", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ id: "ct_1", email: "a@b.com" }), {
					status: 200,
				}),
			),
		);
		const result = await ghlFetch({
			method: "POST",
			path: "/contacts/",
			apiKey: "key",
			body: { email: "a@b.com" },
		});
		expect(result).toEqual({ id: "ct_1", email: "a@b.com" });
	});

	test("throws GhlApiError 'unauthorized' on 401", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ message: "Invalid token" }), {
					status: 401,
				}),
			),
		);
		await expect(
			ghlFetch({ method: "GET", path: "/x", apiKey: "k" }),
		).rejects.toMatchObject({ name: "GhlApiError", code: "unauthorized" });
	});

	test("throws GhlApiError 'rate_limited' on 429", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(new Response("", { status: 429 })),
		);
		await expect(
			ghlFetch({ method: "GET", path: "/x", apiKey: "k" }),
		).rejects.toMatchObject({ name: "GhlApiError", code: "rate_limited" });
	});

	test("throws GhlApiError 'timeout' if request exceeds timeout", async () => {
		(globalThis as any).fetch = mock(
			() =>
				new Promise((resolve) =>
					setTimeout(() => resolve(new Response("", { status: 200 })), 50),
				),
		);
		await expect(
			ghlFetch({ method: "GET", path: "/x", apiKey: "k", timeoutMs: 10 }),
		).rejects.toMatchObject({ name: "GhlApiError", code: "timeout" });
	});

	test("throws GhlApiError 'network' on fetch reject", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.reject(new Error("ECONNRESET")),
		);
		await expect(
			ghlFetch({ method: "GET", path: "/x", apiKey: "k" }),
		).rejects.toMatchObject({ name: "GhlApiError", code: "network" });
	});

	test("includes locationId query param when provided for GET", async () => {
		const fetchMock = mock(() =>
			Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
		);
		(globalThis as any).fetch = fetchMock;

		await ghlFetch({
			method: "GET",
			path: "/contacts/search/duplicate",
			apiKey: "k",
			query: { locationId: "loc_1", email: "a@b.com" },
		});

		const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
		expect(url).toContain("?locationId=loc_1");
		expect(url).toContain("&email=a%40b.com");
	});
});
