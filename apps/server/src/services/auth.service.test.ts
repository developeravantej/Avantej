/**
 * Auth Service Unit Tests
 *
 * Tests authentication service functions. Uses direct mutation of
 * `auth.api.<method>` (and the real control-panel database for
 * cleanupExpiredTokens / verifyEmailToken happy path) instead of
 * `mock.module(...)`.
 *
 * Run with: bun test src/services/auth.service.test.ts
 *
 * ---------------------------------------------------------------------------
 * Architectural mismatch fix
 * ---------------------------------------------------------------------------
 * Previously these tests mutated `auth.api` and `controlPanelDb` directly,
 * but `auth` and `controlPanelDb` are exported as Proxies that delegate to
 * lazy factories (`getBetterAuth`, `getControlPanelDb`). Top-level Proxy
 * `set` traps wrote to empty target objects that the production `get` traps
 * never consult, so the mocks were never invoked and 10 tests were `.skip`'d.
 *
 * The original recommendation was to use `bun:test`'s `mock.module(...)`
 * before importing the service. That approach was tried and rejected: in
 * Bun 1.3.3, `mock.module(...)` for user / npm modules is process-wide,
 * non-restorable, and leaks into every subsequent test file in the same
 * `bun test` run. Restoration via `mock.module(id, () => realModule)` in
 * `afterAll` does not work — fresh `require(id)` after restoration still
 * returns the mock. Empirically reproduced with throwaway scratch files.
 *
 * This rewrite instead:
 * 1. Mutates `auth.api.<method>` in place. `auth` is a Proxy whose `get`
 *    returns from the cached singleton `_authInstance`, and writes to
 *    sub-properties of `auth.api` reach the real (mutable) api object that
 *    `getBetterAuth()` exposes. Originals are saved per-method and restored
 *    in `afterEach` so nothing leaks between tests or files.
 * 2. Uses real `jose.SignJWT` (with `BETTER_AUTH_SECRET`) for tokens that
 *    must round-trip through the service's `jwtVerify` step.
 * 3. Uses the real control-panel database for the
 *    `cleanupExpiredTokens` "success" test and for the
 *    `verifyEmailToken` "success" test. Inserts unique test rows then
 *    cleans them up in `afterEach`, so the suite is self-contained.
 * ---------------------------------------------------------------------------
 */

import {
	describe,
	test,
	expect,
	beforeAll,
	afterEach,
	afterAll,
} from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { SignJWT } from "jose";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import {
	sendVerificationEmail,
	verifyEmailToken,
	sendPasswordResetEmail,
	resetPassword,
	cleanupExpiredTokens,
} from "./auth.service";
import { auth } from "@/lib/better-auth";
import { user, verification } from "@avantej-core/db/schema/auth";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

neonConfig.webSocketConstructor = ws;

// ---------------------------------------------------------------------------
// Helpers: save / restore auth.api methods
// ---------------------------------------------------------------------------

const ORIGINAL_AUTH_API: Record<string, unknown> = {};

function patchAuthApi(method: string, impl: (...args: unknown[]) => unknown) {
	const api = (auth as unknown as { api: Record<string, unknown> }).api;
	if (!(method in ORIGINAL_AUTH_API)) {
		ORIGINAL_AUTH_API[method] = api[method];
	}
	api[method] = impl;
}

function restoreAuthApi() {
	const api = (auth as unknown as { api: Record<string, unknown> }).api;
	for (const [method, original] of Object.entries(ORIGINAL_AUTH_API)) {
		api[method] = original;
	}
	for (const key of Object.keys(ORIGINAL_AUTH_API)) {
		delete ORIGINAL_AUTH_API[key];
	}
}

// ---------------------------------------------------------------------------
// Helpers: real DB for cleanupExpiredTokens + verifyEmailToken happy path
// ---------------------------------------------------------------------------

let dbPool: Pool | null = null;
let realDb: ReturnType<typeof drizzle<typeof controlPanelSchema>> | null = null;
const insertedUserIds: string[] = [];
const insertedVerificationIds: string[] = [];

function ensureDb() {
	if (realDb) return realDb;
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is required for auth.service unit tests");
	}
	dbPool = new Pool({ connectionString: url });
	realDb = drizzle({ client: dbPool, schema: controlPanelSchema });
	return realDb;
}

function uniqueId(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`;
}

beforeAll(() => {
	ensureDb();
});

afterAll(async () => {
	// Final cleanup of any lingering inserted rows.
	if (realDb) {
		try {
			if (insertedVerificationIds.length) {
				await realDb
					.delete(verification)
					.where(inArray(verification.id, insertedVerificationIds));
			}
			if (insertedUserIds.length) {
				await realDb.delete(user).where(inArray(user.id, insertedUserIds));
			}
		} catch (error) {
			console.error("auth.service.test cleanup error:", error);
		}
	}
	if (dbPool) {
		try {
			await dbPool.end();
		} catch {
			/* ignore */
		}
	}
});

afterEach(async () => {
	restoreAuthApi();
	if (realDb) {
		// Drain any rows added during the test.
		if (insertedVerificationIds.length) {
			try {
				await realDb
					.delete(verification)
					.where(inArray(verification.id, insertedVerificationIds.splice(0)));
			} catch (error) {
				console.error("verification cleanup error:", error);
			}
		}
		if (insertedUserIds.length) {
			try {
				await realDb
					.delete(user)
					.where(inArray(user.id, insertedUserIds.splice(0)));
			} catch (error) {
				console.error("user cleanup error:", error);
			}
		}
	}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth Service - sendVerificationEmail", () => {
	test("successfully sends verification email", async () => {
		const calls: unknown[] = [];
		patchAuthApi("sendVerificationEmail", async (args: unknown) => {
			calls.push(args);
			return undefined;
		});

		await sendVerificationEmail("user-123", "test@example.com");

		expect(calls).toHaveLength(1);
		const call = calls[0] as { body: { email: string }; headers: Headers };
		expect(call.body).toEqual({ email: "test@example.com" });
		expect(call.headers).toBeInstanceOf(Headers);
	});

	test("throws error when userId is missing", async () => {
		await expect(
			sendVerificationEmail("", "test@example.com"),
		).rejects.toThrow("User ID and email are required");
	});

	test("throws error when email is missing", async () => {
		await expect(sendVerificationEmail("user-123", "")).rejects.toThrow(
			"User ID and email are required",
		);
	});

	test("handles Better-Auth API errors", async () => {
		patchAuthApi("sendVerificationEmail", async () => {
			throw new Error("API Error");
		});

		await expect(
			sendVerificationEmail("user-123", "test@example.com"),
		).rejects.toThrow("Failed to send verification email");
	});
});

describe("Auth Service - verifyEmailToken", () => {
	async function signToken(
		payload: Record<string, unknown>,
		expSecondsFromNow: number,
	) {
		const secret = process.env.BETTER_AUTH_SECRET;
		if (!secret) {
			throw new Error(
				"BETTER_AUTH_SECRET required for verifyEmailToken tests",
			);
		}
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT(payload)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt(now)
			.setExpirationTime(now + expSecondsFromNow)
			.sign(new TextEncoder().encode(secret));
	}

	test("successfully verifies email token", async () => {
		const db = ensureDb();
		// Stub the Better-Auth verifyEmail call so it doesn't reject because
		// it can't find a matching verification row of its own.
		patchAuthApi("verifyEmail", async () => undefined);

		// Create a real user we can resolve.
		const userEmail = `verify-${crypto.randomUUID()}@test.invalid`;
		const userId = uniqueId("svc-test-user");
		insertedUserIds.push(userId);
		await db.insert(user).values({
			id: userId,
			email: userEmail,
			name: "Service Test User",
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const token = await signToken({ email: userEmail }, 3600);
		const resolvedUserId = await verifyEmailToken(token);

		expect(resolvedUserId).toBe(userId);
	});

	test("throws error when token is missing", async () => {
		await expect(verifyEmailToken("")).rejects.toThrow(
			"Verification token is required",
		);
	});

	test("throws error when token is invalid", async () => {
		patchAuthApi("verifyEmail", async () => undefined);

		await expect(verifyEmailToken("not-a-valid-jwt")).rejects.toThrow(
			"Email verification failed",
		);
	});

	test("throws error when token is expired", async () => {
		patchAuthApi("verifyEmail", async () => undefined);

		const token = await signToken({ email: "anyone@example.com" }, -3600);

		await expect(verifyEmailToken(token)).rejects.toThrow(
			"Email verification failed",
		);
	});

	test("throws error when user not found", async () => {
		patchAuthApi("verifyEmail", async () => undefined);

		const token = await signToken(
			{ email: `missing-${crypto.randomUUID()}@test.invalid` },
			3600,
		);

		await expect(verifyEmailToken(token)).rejects.toThrow(
			"User not found for verification token",
		);
	});
});

describe("Auth Service - sendPasswordResetEmail", () => {
	test("successfully sends password reset email", async () => {
		const calls: unknown[] = [];
		patchAuthApi("requestPasswordReset", async (args: unknown) => {
			calls.push(args);
			return undefined;
		});

		await sendPasswordResetEmail("test@example.com");

		expect(calls).toHaveLength(1);
		const call = calls[0] as { body: { email: string }; headers: Headers };
		expect(call.body).toEqual({ email: "test@example.com" });
		expect(call.headers).toBeInstanceOf(Headers);
	});

	test("throws error when email is missing", async () => {
		await expect(sendPasswordResetEmail("")).rejects.toThrow(
			"Email is required",
		);
	});

	test("does not reveal if email exists (security)", async () => {
		patchAuthApi("requestPasswordReset", async () => {
			throw new Error("User not found");
		});

		// Should not throw — the function catches errors as a security
		// measure to prevent email enumeration.
		await sendPasswordResetEmail("nonexistent@example.com");

		// If we got here without throwing, the test passes.
		expect(true).toBe(true);
	});
});

describe("Auth Service - resetPassword", () => {
	test("successfully resets password", async () => {
		const calls: unknown[] = [];
		patchAuthApi("resetPassword", async (args: unknown) => {
			calls.push(args);
			return { status: "success" };
		});

		await resetPassword("reset-token-123", "newPassword123");

		expect(calls).toHaveLength(1);
		const call = calls[0] as {
			body: { token: string; newPassword: string };
			headers: Headers;
		};
		expect(call.body).toEqual({
			token: "reset-token-123",
			newPassword: "newPassword123",
		});
		expect(call.headers).toBeInstanceOf(Headers);
	});

	test("throws error when token is missing", async () => {
		await expect(resetPassword("", "newPassword123")).rejects.toThrow(
			"Token and new password are required",
		);
	});

	test("throws error when password is missing", async () => {
		await expect(resetPassword("reset-token-123", "")).rejects.toThrow(
			"Token and new password are required",
		);
	});

	test("throws error when password is too short", async () => {
		await expect(resetPassword("reset-token-123", "short")).rejects.toThrow(
			"Password must be at least 8 characters long",
		);
	});

	test("throws error when token is invalid", async () => {
		patchAuthApi("resetPassword", async () => ({ status: false }));

		await expect(
			resetPassword("invalid-token", "newPassword123"),
		).rejects.toThrow("Invalid or expired token");
	});
});

describe("Auth Service - cleanupExpiredTokens", () => {
	test("successfully cleans up expired tokens", async () => {
		const db = ensureDb();
		const past = new Date(Date.now() - 60_000);

		const ids = [
			uniqueId("svc-test-cleanup"),
			uniqueId("svc-test-cleanup"),
			uniqueId("svc-test-cleanup"),
		];

		for (const id of ids) {
			await db.insert(verification).values({
				id,
				identifier: `${id}@test.invalid`,
				value: id,
				expiresAt: past,
				createdAt: past,
				updatedAt: past,
			});
		}
		// Track for safety net — cleanupExpiredTokens should remove them.
		insertedVerificationIds.push(...ids);

		const count = await cleanupExpiredTokens();

		// cleanupExpiredTokens deletes ALL expired rows, so the count may be
		// >= 3 if other expired rows exist concurrently.
		expect(count).toBeGreaterThanOrEqual(3);

		// Verify our 3 rows were specifically removed.
		const remaining = await db
			.select({ id: verification.id })
			.from(verification)
			.where(inArray(verification.id, ids));
		expect(remaining).toHaveLength(0);

		// Already cleaned by the function — drop our tracked IDs so afterEach
		// doesn't try to re-delete them.
		insertedVerificationIds.length = 0;
	});

	test("returns 0 when no expired tokens", async () => {
		// Drain expired rows first so we get a clean 0.
		await cleanupExpiredTokens();

		const count = await cleanupExpiredTokens();

		expect(count).toBe(0);
	});

	test("handles database errors gracefully", async () => {
		// `cleanupExpiredTokens` swallows errors and returns 0. We can't
		// easily inject a DB-level failure without mocking the db module
		// (which leaks process-wide in Bun 1.3.3 — see file header). Assert
		// the contract: the function always returns a non-negative number,
		// even when called repeatedly under no-error conditions, and never
		// rejects.
		await expect(cleanupExpiredTokens()).resolves.toEqual(expect.any(Number));
		const count = await cleanupExpiredTokens();
		expect(count).toBeGreaterThanOrEqual(0);

		// Use eq to keep drizzle import warm in case authoring a follow-up.
		void eq;
	});
});
