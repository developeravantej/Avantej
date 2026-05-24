/**
 * In-memory rate-limit middleware.
 *
 * Phase 8.2 minimum: protects pre-auth endpoints from single-IP brute force
 * using a per-isolate Map keyed by `${route}:${ip}`. Cloudflare runs a bounded
 * number of isolates per colo, so this gives meaningful protection for the
 * low-volume pre-launch period.
 *
 * The Cloudflare-native rate-limiting binding is the upgrade target — when
 * an account-level binding is configured in wrangler.jsonc, this middleware
 * should switch to checking that binding instead. The function signature
 * stays the same so callers don't change.
 *
 * Client IP is read from CF-Connecting-IP (Cloudflare-injected, IPv6-safe,
 * immune to X-Forwarded-For spoofing). Falls back to a static key when the
 * header is absent (local dev).
 */

import type { Context, MiddlewareHandler } from "hono";

type Bucket = {
	count: number;
	resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Workers forbid timers in global scope; sweep expired buckets on requests instead.
let requestCount = 0;
function maybeEvictExpired(now: number) {
	requestCount++;
	if (requestCount % 50 !== 0 && buckets.size < 500) return;
	for (const [k, v] of buckets) {
		if (v.resetAt <= now) buckets.delete(k);
	}
}

function getClientIp(c: Context): string {
	return (
		c.req.header("CF-Connecting-IP") ??
		c.req.header("X-Real-IP") ??
		"local"
	);
}

export interface RateLimitOptions {
	/** Logical route name — becomes part of the bucket key. */
	route: string;
	/** Number of requests allowed in the window. */
	limit: number;
	/** Window length in seconds. */
	windowSec: number;
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
	const windowMs = opts.windowSec * 1000;

	return async (c, next) => {
		const now = Date.now();
		maybeEvictExpired(now);
		const ip = getClientIp(c);
		const key = `${opts.route}:${ip}`;
		const bucket = buckets.get(key);

		if (!bucket || bucket.resetAt <= now) {
			buckets.set(key, { count: 1, resetAt: now + windowMs });
			c.header("X-RateLimit-Limit", String(opts.limit));
			c.header("X-RateLimit-Remaining", String(opts.limit - 1));
			return next();
		}

		if (bucket.count >= opts.limit) {
			const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
			c.header("Retry-After", String(retryAfter));
			c.header("X-RateLimit-Limit", String(opts.limit));
			c.header("X-RateLimit-Remaining", "0");
			return c.json(
				{
					error: "TOO_MANY_REQUESTS",
					message: `Rate limit exceeded. Retry in ${retryAfter}s.`,
				},
				429,
			);
		}

		bucket.count++;
		c.header("X-RateLimit-Limit", String(opts.limit));
		c.header("X-RateLimit-Remaining", String(opts.limit - bucket.count));
		return next();
	};
}

// Test-only helpers — not exported from the package barrel.
export function __resetRateLimitBuckets() {
	buckets.clear();
}
