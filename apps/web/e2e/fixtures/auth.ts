/**
 * E2E Auth Helpers
 *
 * Better-Auth sign-up + sign-in via HTTP, bypassing the browser UI.
 * Used to create fresh test users directly in the control panel database.
 *
 * The sign-up endpoint is at POST /api/auth/sign-up/email (Better-Auth default).
 * The response body has shape: { user: { id: string; email: string; ... }, session: {...} }
 */

import type { Page } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import {
	user as userTable,
	session as sessionTable,
	account as accountTable,
} from "@avantej-core/db/schema/auth";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { getControlPanelDb } from "./db";

const AUTH_BASE_URL =
	process.env.E2E_SERVER_BASE_URL ?? "http://localhost:3000";
const WEB_ORIGIN = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3001";

export interface SignedUpUser {
	email: string;
	password: string;
	userId: string;
}

type ControlPanelDb = ReturnType<typeof getControlPanelDb>;

/**
 * Every userId minted by signUpUser during this Playwright worker process.
 * Populated automatically so specs can tear down their throwaway
 * `@test.local` accounts (and any platform-admin grant issued to them) from a
 * single afterAll without threading the id through their own scope.
 *
 * Motivation: plan-f ship specs seed super_admin grants on these throwaway
 * users and historically never revoked them — a 2026-07-12 sweep removed 88
 * stale privileged grants from the dev control-panel DB. Cleared by
 * cleanupSeededTestUsers().
 */
const seededUserIds = new Set<string>();

/** Emails that must NEVER be revoked/deleted by teardown (real durable admins). */
const PROTECTED_EMAILS = new Set(
	[process.env.E2E_SUPER_ADMIN_EMAIL, "developer.avantej@gmail.com"]
		.filter((e): e is string => Boolean(e))
		.map((e) => e.toLowerCase()),
);

/** Manually register an externally-created throwaway userId for teardown. */
export function trackSeededUserId(userId: string): void {
	if (userId) seededUserIds.add(userId);
}

/**
 * Belt-and-braces teardown for throwaway `@test.local` users seeded via
 * signUpUser — deletes their platform_admins grant, sessions, accounts, and
 * finally the user row. Safe to call from test.afterEach/afterAll even after a
 * failed assertion; never throws (cleanup failures are logged, not fatal).
 *
 * Cascade note: platform_admins / session / account are all ON DELETE CASCADE
 * from user, so deleting the user row alone suffices — the explicit grant
 * delete is a redundant guard in case the user delete is skipped or fails.
 */
export async function cleanupSeededTestUsers(
	cp?: ControlPanelDb,
): Promise<void> {
	const wantsSweep = process.env.E2E_SWEEP_STALE_ADMINS === "1";
	// Nothing seeded and no sweep requested → no DB work, so never construct a
	// connection (which would throw when DATABASE_URL is absent). Keeps the
	// "never fails the suite" contract even in envs without control-panel access.
	if (seededUserIds.size === 0 && !wantsSweep) return;

	// Lazily resolve the DB inside try so a missing DATABASE_URL degrades to a
	// logged warning rather than an unhandled throw from a default-arg.
	let db: ControlPanelDb;
	try {
		db = cp ?? getControlPanelDb();
	} catch (e) {
		console.warn(
			"[e2e-cleanup] control-panel DB unavailable, skipping teardown:",
			e,
		);
		seededUserIds.clear();
		return;
	}

	if (seededUserIds.size === 0) {
		if (wantsSweep) await sweepStaleE2ePlatformAdmins(db);
		return;
	}
	const ids = [...seededUserIds];
	seededUserIds.clear();
	for (const userId of ids) {
		try {
			// Never touch a protected/durable admin, even if one slipped in.
			const [row] = await db
				.select({ email: userTable.email })
				.from(userTable)
				.where(eq(userTable.id, userId));
			if (row && PROTECTED_EMAILS.has(row.email.toLowerCase())) continue;
			await db.delete(platformAdmins).where(eq(platformAdmins.userId, userId));
			await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
			await db.delete(accountTable).where(eq(accountTable.userId, userId));
			await db.delete(userTable).where(eq(userTable.id, userId));
		} catch (e) {
			console.warn(`[e2e-cleanup] failed to tear down user ${userId}:`, e);
		}
	}
	// Opt-in self-correcting sweep so a normal run only removes ids it seeded.
	if (wantsSweep) {
		await sweepStaleE2ePlatformAdmins(db);
	}
}

/**
 * Self-correcting sweep: revoke every platform-admin grant held by a throwaway
 * `%@test.local` user (except protected durable admins). Guards against a
 * future regression re-accumulating stale grants like the 88 removed on
 * 2026-07-12.
 *
 * NOT run by default — opt in with E2E_SWEEP_STALE_ADMINS=1 so a normal test
 * run only ever removes the ids it seeded. Provided as the teardown code path;
 * this module never executes it against a DB on import. Returns the number of
 * grants revoked.
 */
export async function sweepStaleE2ePlatformAdmins(
	cp: ControlPanelDb = getControlPanelDb(),
): Promise<number> {
	const stale = await cp
		.select({ userId: platformAdmins.userId, email: userTable.email })
		.from(platformAdmins)
		.innerJoin(userTable, eq(platformAdmins.userId, userTable.id))
		.where(like(userTable.email, "%@test.local"));
	let removed = 0;
	for (const r of stale) {
		if (PROTECTED_EMAILS.has(r.email.toLowerCase())) continue;
		try {
			await cp
				.delete(platformAdmins)
				.where(eq(platformAdmins.userId, r.userId));
			removed++;
		} catch (e) {
			console.warn(`[e2e-sweep] failed to revoke ${r.userId}:`, e);
		}
	}
	if (removed > 0) {
		console.log(
			`[e2e-sweep] revoked ${removed} stale @test.local platform-admin grant(s)`,
		);
	}
	return removed;
}

/**
 * Create a fresh user account via Better-Auth.
 * Uses a Date.now() suffix so re-runs never collide.
 */
export async function signUpUser(
	suffix: string | number,
	role: "admin" | "client" = "client",
): Promise<SignedUpUser> {
	const email = `e2e-${role}-${suffix}@test.local`;
	const password = "TestPass123!";
	const name = `E2E ${role.charAt(0).toUpperCase() + role.slice(1)} ${suffix}`;

	const res = await fetch(`${AUTH_BASE_URL}/api/auth/sign-up/email`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// Better-Auth rejects requests without an Origin (CORS gate).
			Origin: WEB_ORIGIN,
		},
		body: JSON.stringify({
			email,
			password,
			name,
			firstName: `E2E${role}`,
			lastName: String(suffix),
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`signUp failed for ${email}: ${res.status} ${body}`);
	}

	const json = (await res.json()) as { user: { id: string } };
	// Track for teardown so the throwaway user (and any platform-admin grant a
	// spec issues to it) never accumulates in the shared control-panel DB.
	seededUserIds.add(json.user.id);
	return { email, password, userId: json.user.id };
}

/**
 * Log in as the dev admin via browser UI and wait for the post-login redirect.
 * Reusable across all GHL E2E demo specs.
 */
export async function loginAsAdmin(
	page: Page,
	email: string,
	password: string,
): Promise<void> {
	await page.goto("/login");
	await page.fill('input[type="email"]', email);
	await page.fill('input[type="password"]', password);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/(dashboard|customers|home|onboarding)/, {
		timeout: 15_000,
	});
}
