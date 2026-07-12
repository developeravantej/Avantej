import {
	test,
	expect,
	request as pwRequest,
	type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { rpc, rpcRaw, testId } from "../_safe-mutation";

/**
 * Platform-admins grant/revoke lifecycle — CONTROL-PANEL (shared) DB.
 *
 * Safety contract (plan-6):
 *   - Grants/revokes ONLY a purpose-seeded throwaway user created by this spec
 *     (sign-up + full SQL teardown of user/account/session/platform_admins rows).
 *   - NEVER revokes developer.avantej@gmail.com — except the self-lockout test,
 *     which asserts that the attempt FAILS (403) by design
 *     (users.procedures.ts:213 → "Cannot revoke your own platform admin role").
 *   - afterEach revokes any leftover grant even when an assertion failed
 *     (API revoke first, raw SQL delete as belt-and-braces).
 *
 * Auth: signs in via /api/auth/sign-in/email as the control-panel super admin —
 * Radix Selects can't be UI-automated, and the API boundary is the invariant.
 * Skips (not fails) when the super-admin session can't be established.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";
const SUPER_EMAIL =
	process.env.E2E_SUPER_ADMIN_EMAIL ?? "developer.avantej@gmail.com";
const SUPER_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? "password123";

function controlPanelSql() {
	const devVars = readFileSync("apps/server/.dev.vars", "utf8");
	const m = devVars.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
	if (!m) throw new Error("DATABASE_URL not found in apps/server/.dev.vars");
	return neon(m[1]);
}

test.describe("platform-admin — grant/revoke lifecycle (super admin)", () => {
	// API-only suite: no browser storageState needed.
	test.use({ storageState: { cookies: [], origins: [] } });

	let superReq: APIRequestContext | null = null;
	let superUserId: string | null = null;
	let targetUserId: string | null = null;
	let targetEmail: string | null = null;
	let skipReason = "";
	/** userIds granted in the current test — revoked in afterEach no matter what. */
	const pendingGrants = new Set<string>();

	test.beforeAll(async () => {
		// 1. Super-admin API session.
		try {
			const ctx = await pwRequest.newContext({ baseURL: BASE });
			const signin = await ctx.post("/api/auth/sign-in/email", {
				data: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
			});
			if (!signin.ok()) {
				skipReason = `super-admin sign-in failed (${signin.status()})`;
				await ctx.dispose();
				return;
			}
			const me = await rpc(ctx, "admin/me", {});
			if (!me?.isPlatformAdmin || me.role !== "super_admin") {
				skipReason = `${SUPER_EMAIL} is not a super_admin platform admin in this env`;
				await ctx.dispose();
				return;
			}
			const session = await ctx.get("/api/auth/get-session");
			superUserId = (await session.json())?.user?.id ?? null;
			if (!superUserId) {
				skipReason = "could not resolve super-admin userId from get-session";
				await ctx.dispose();
				return;
			}
			superReq = ctx;
		} catch (e) {
			skipReason = `dev server unreachable at ${BASE}: ${e instanceof Error ? e.message : e}`;
			return;
		}

		// 2. Purpose-seeded grant target (throwaway auth user, no org membership).
		targetEmail = `${testId("pa-target").toLowerCase()}@e2e.test`;
		const anon = await pwRequest.newContext({ baseURL: BASE });
		const signup = await anon.post("/api/auth/sign-up/email", {
			data: {
				name: "E2E PA Target",
				email: targetEmail,
				password: "password123!",
				firstName: "E2E",
				lastName: "PA Target",
			},
		});
		if (signup.ok()) {
			targetUserId = (await signup.json())?.user?.id ?? null;
		}
		await anon.dispose();
		if (!targetUserId) {
			skipReason = "could not seed a throwaway grant-target user";
		}
	});

	test.afterEach(async () => {
		// Guaranteed cleanup of grants, even on assertion failure mid-test.
		if (!pendingGrants.size) return;
		const sql = controlPanelSql();
		for (const userId of pendingGrants) {
			if (userId === superUserId) continue; // NEVER touch the real super admin
			if (superReq) {
				await rpcRaw(superReq, "admin/revokePlatformAdmin", { userId }).catch(
					() => {},
				);
			}
			// Belt-and-braces: the row must not survive this spec.
			await sql`DELETE FROM platform_admins WHERE user_id = ${userId}`.catch(
				(e: unknown) => console.warn("[cleanup] platform_admins delete:", e),
			);
		}
		pendingGrants.clear();
	});

	test.afterAll(async () => {
		// Tear down the throwaway user entirely (control-panel shared DB hygiene).
		if (targetUserId) {
			const sql = controlPanelSql();
			try {
				await sql`DELETE FROM platform_admins WHERE user_id = ${targetUserId}`;
				await sql`DELETE FROM session WHERE user_id = ${targetUserId}`;
				await sql`DELETE FROM account WHERE user_id = ${targetUserId}`;
				await sql`DELETE FROM "user" WHERE id = ${targetUserId}`;
			} catch (e) {
				console.warn("[cleanup] target user teardown failed:", e);
			}
		}
		await superReq?.dispose();
	});

	test("grant → appears in listAdmins → revoke → removed", async () => {
		test.skip(!superReq || !targetUserId, skipReason || "no seeded target");
		const req = superReq!;
		const userId = targetUserId!;

		// Grant (support role) — server upserts platform_admins + mirrors user.role.
		pendingGrants.add(userId);
		const granted = await rpc(req, "admin/grantPlatformAdmin", {
			userId,
			role: "support",
		});
		expect(granted).toMatchObject({ success: true, role: "support" });

		// Appears in the list with grantor attribution.
		const admins = await rpc(req, "admin/listAdmins", {});
		const row = (admins as Array<Record<string, unknown>>).find(
			(a) => a.userId === userId,
		);
		expect(row, "granted user must appear in listAdmins").toBeTruthy();
		expect(row).toMatchObject({
			role: "support",
			email: targetEmail,
			grantedByEmail: SUPER_EMAIL,
		});

		// Revoke — row disappears.
		const revoked = await rpc(req, "admin/revokePlatformAdmin", { userId });
		expect(revoked).toMatchObject({ success: true });
		const after = await rpc(req, "admin/listAdmins", {});
		expect(
			(after as Array<Record<string, unknown>>).some(
				(a) => a.userId === userId,
			),
			"revoked user must be gone from listAdmins",
		).toBe(false);
		pendingGrants.delete(userId);
	});

	test("re-granting an existing admin upserts the role (no duplicate row)", async () => {
		test.skip(!superReq || !targetUserId, skipReason || "no seeded target");
		const req = superReq!;
		const userId = targetUserId!;

		pendingGrants.add(userId);
		await rpc(req, "admin/grantPlatformAdmin", { userId, role: "support" });
		// Second grant with a different role — onConflictDoUpdate path.
		const regrant = await rpc(req, "admin/grantPlatformAdmin", {
			userId,
			role: "billing",
		});
		expect(regrant).toMatchObject({ success: true, role: "billing" });

		const admins = await rpc(req, "admin/listAdmins", {});
		const rows = (admins as Array<Record<string, unknown>>).filter(
			(a) => a.userId === userId,
		);
		expect(rows, "upsert must not create a duplicate row").toHaveLength(1);
		expect(rows[0].role).toBe("billing");

		await rpc(req, "admin/revokePlatformAdmin", { userId });
		pendingGrants.delete(userId);
	});

	test("self-lockout guard: revoking your OWN admin role is rejected (403) and access survives", async () => {
		test.skip(!superReq || !superUserId, skipReason || "no super session");
		const req = superReq!;

		// The attempt must FAIL — this is the only permitted "revoke" against the
		// real super admin, and it must be a no-op by design.
		const res = await rpcRaw(req, "admin/revokePlatformAdmin", {
			userId: superUserId,
		});
		expect(res.status(), "self-revoke must be rejected with FORBIDDEN").toBe(
			403,
		);

		// Access is intact: still a super_admin, still listed.
		const me = await rpc(req, "admin/me", {});
		expect(me).toMatchObject({ isPlatformAdmin: true, role: "super_admin" });
		const admins = await rpc(req, "admin/listAdmins", {});
		expect(
			(admins as Array<Record<string, unknown>>).some(
				(a) => a.userId === superUserId,
			),
			"super admin must still be in the admins list after the blocked attempt",
		).toBe(true);
	});

	test("granting a non-existent user returns NOT_FOUND", async () => {
		test.skip(!superReq, skipReason);
		const res = await rpcRaw(superReq!, "admin/grantPlatformAdmin", {
			userId: "e2e-no-such-user-000",
			role: "support",
		});
		expect(res.status()).toBe(404);
	});
});
