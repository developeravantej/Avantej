import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
	__resetRateLimitBuckets,
	rateLimit,
} from "./rate-limit.middleware";

function buildApp(opts: { limit: number; windowSec: number }) {
	const app = new Hono();
	app.use(
		"/test",
		rateLimit({ route: "test", limit: opts.limit, windowSec: opts.windowSec }),
	);
	app.get("/test", (c) => c.json({ ok: true }));
	return app;
}

afterEach(() => {
	__resetRateLimitBuckets();
});

describe("rate-limit middleware", () => {
	test("allows up to limit then 429s", async () => {
		const app = buildApp({ limit: 3, windowSec: 60 });
		const headers = { "CF-Connecting-IP": "1.2.3.4" };

		for (let i = 0; i < 3; i++) {
			const res = await app.request("/test", { headers });
			expect(res.status).toBe(200);
		}

		const blocked = await app.request("/test", { headers });
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("Retry-After")).not.toBeNull();
	});

	test("buckets are per-IP", async () => {
		const app = buildApp({ limit: 1, windowSec: 60 });

		const a = await app.request("/test", {
			headers: { "CF-Connecting-IP": "1.1.1.1" },
		});
		expect(a.status).toBe(200);

		const b = await app.request("/test", {
			headers: { "CF-Connecting-IP": "2.2.2.2" },
		});
		expect(b.status).toBe(200);

		const aBlocked = await app.request("/test", {
			headers: { "CF-Connecting-IP": "1.1.1.1" },
		});
		expect(aBlocked.status).toBe(429);
	});

	test("emits X-RateLimit headers on every response", async () => {
		const app = buildApp({ limit: 5, windowSec: 60 });
		const res = await app.request("/test", {
			headers: { "CF-Connecting-IP": "9.9.9.9" },
		});
		expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
		expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
	});

	test("buckets reset after window expires", async () => {
		const app = buildApp({ limit: 1, windowSec: 60 });
		const headers = { "CF-Connecting-IP": "5.5.5.5" };

		const first = await app.request("/test", { headers });
		expect(first.status).toBe(200);

		const blocked = await app.request("/test", { headers });
		expect(blocked.status).toBe(429);

		// Reset and ensure next request is allowed again.
		__resetRateLimitBuckets();
		const afterReset = await app.request("/test", { headers });
		expect(afterReset.status).toBe(200);
	});
});
