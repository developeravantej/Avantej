import { describe, test, expect } from "bun:test";
import { corsOriginsFromEnv } from "../../../lib/better-auth";

// AVANTEJ-18 regression: better-auth trustedOrigins must split CORS_ORIGIN on
// commas (the Hono CORS layer already does). Before the fix, a multi-origin
// CORS_ORIGIN was treated as one bogus origin and every sign-in 403'd.
describe("corsOriginsFromEnv (AVANTEJ-18)", () => {
	test("splits a comma-separated CORS_ORIGIN into each origin", () => {
		expect(corsOriginsFromEnv("https://a.com,https://b.com")).toEqual([
			"https://a.com",
			"https://b.com",
		]);
	});

	test("trims whitespace around each origin", () => {
		expect(corsOriginsFromEnv("https://a.com ,  https://b.com")).toEqual([
			"https://a.com",
			"https://b.com",
		]);
	});

	test("a single origin stays a one-element list", () => {
		expect(corsOriginsFromEnv("https://move.avantej.com")).toEqual([
			"https://move.avantej.com",
		]);
	});

	test("undefined falls back to the localhost default", () => {
		expect(corsOriginsFromEnv(undefined)).toEqual(["http://localhost:3001"]);
	});

	// Empty string previously slipped past `|| default` as a single "" origin.
	test("empty string falls back to the localhost default (not [''])", () => {
		expect(corsOriginsFromEnv("")).toEqual(["http://localhost:3001"]);
		expect(corsOriginsFromEnv("  ,  ")).toEqual(["http://localhost:3001"]);
	});
});
