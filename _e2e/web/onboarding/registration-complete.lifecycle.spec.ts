import {
	test,
	expect,
	request as pwRequest,
	type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { getOrgId, rpc, rpcRaw, testId, Cleanup } from "../_safe-mutation";

/**
 * Web member-registration (/register) — full lifecycle.
 *
 * Journey: admin creates a branch self-signup invite → a FRESH user account is
 * created (test-prefixed email), email-verified directly in the dev
 * control-panel DB (Better-Auth blocks unverified sign-ins and the
 * verification email goes nowhere) → the user logs in via
 * /login?registrationToken=<invite> (asserting the token-forwarding invariant)
 * → completes the 3-step wizard through the real UI → submit → dashboard.
 * Post-conditions are verified at the API boundary: session role flips to
 * "user", a client-role membership exists in userContext, phone persisted
 * dial-code-prefixed.
 *
 * Cleanup (registered the moment each fixture exists):
 *  - member: members/remove as admin (removes tenant + control-panel rows)
 *  - auth user: SQL delete session/account/user rows (control-panel dev DB)
 *  - invite: branchInvites/revoke as admin
 *
 * Data target: local dev (Test Fitness Franchise tenant) — confirmed in
 * _e2e/config.json. All writes are E2E-DEEP- prefixed and self-cleaning.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

function controlPanelSql() {
	const devVars = readFileSync("apps/server/.dev.vars", "utf8");
	const m = devVars.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
	if (!m) throw new Error("DATABASE_URL not found in apps/server/.dev.vars");
	return neon(m[1]);
}

async function findClientMemberId(
	adminReq: APIRequestContext,
	organizationId: string,
	userId: string,
): Promise<string | null> {
	const list = await rpc(adminReq, "members/list", {
		organizationId,
		role: "client",
	});
	const arr = Array.isArray(list) ? list : (list?.members ?? []);
	return arr.find((m: any) => m.userId === userId)?.id ?? null;
}

test.describe("registration web — complete lifecycle", () => {
	// The member-to-be starts logged out; the admin side runs on its own
	// APIRequestContext so the two identities never mix.
	test.use({ storageState: { cookies: [], origins: [] } });

	const cleanup = new Cleanup();
	let adminReq: APIRequestContext;

	test.beforeAll(async () => {
		adminReq = await pwRequest.newContext({
			baseURL: BASE,
			storageState: "_e2e/.auth/admin.json",
		});
	});
	test.afterAll(async () => {
		await cleanup.runAll();
		await adminReq.dispose();
	});

	test("fresh user + valid invite → wizard → member created (API-verified), then torn down", async ({
		page,
	}) => {
		test.setTimeout(240_000);
		const organizationId = getOrgId();
		const sql = controlPanelSql();

		// ── Arrange: the tenant's public branch + a real invite for its node ──
		const branches = await rpc(page.request, "registration/listBranches", {
			country: "Malaysia",
		});
		const branch = (Array.isArray(branches) ? branches : []).find(
			(b: any) => b.organizationId === organizationId,
		);
		test.skip(!branch, "tenant has no Malaysia branch in listBranches");

		const inviteRows = await rpc(adminReq, "branchInvites/listAll", {
			organizationId,
		});
		const nodeRow = (Array.isArray(inviteRows) ? inviteRows : []).find(
			(r: any) => r.branchName === branch.name,
		);
		test.skip(!nodeRow, `no hierarchy node maps to branch "${branch.name}"`);

		const invite = await rpc(adminReq, "branchInvites/create", {
			organizationId,
			branchId: nodeRow.branchId,
		});
		expect(invite?.token, "invite create returns the token").toBeTruthy();
		cleanup.add(`branch invite ${invite.id}`, async () => {
			await rpcRaw(adminReq, "branchInvites/revoke", {
				organizationId,
				id: invite.id,
			});
		});

		// ── Arrange: a fresh, email-verified user account ─────────────────────
		const email = `${testId("reg-user").toLowerCase()}@e2e.test`;
		const password = "password123!";
		const anonReq = await pwRequest.newContext({ baseURL: BASE });
		const signup = await anonReq.post("/api/auth/sign-up/email", {
			data: {
				name: "E2E Reg User",
				email,
				password,
				firstName: "E2E",
				lastName: "Reg User",
			},
		});
		expect(signup.ok(), `sign-up -> ${signup.status()}`).toBeTruthy();
		const userId = (await signup.json())?.user?.id as string;
		expect(userId, "sign-up returns the new user id").toBeTruthy();
		await anonReq.dispose();

		cleanup.add(`member+auth rows for ${email}`, async () => {
			// App-level first: removes tenant member + control-panel membership.
			const memberId = await findClientMemberId(
				adminReq,
				organizationId,
				userId,
			).catch(() => null);
			if (memberId) {
				await rpcRaw(adminReq, "members/remove", {
					organizationId,
					memberId,
				});
			}
			// Then the Better-Auth rows (dev control-panel DB, test-prefixed email).
			await sql`DELETE FROM session WHERE user_id = ${userId}`;
			await sql`DELETE FROM account WHERE user_id = ${userId}`;
			await sql`DELETE FROM "user" WHERE id = ${userId}`;
		});

		// Better-Auth requires a verified email to sign in; the verification mail
		// goes to a fake address, so flip the flag directly (dev DB).
		await sql`UPDATE "user" SET email_verified = true WHERE id = ${userId}`;

		// ── Act 1: login with the invite token in the URL (forwarding invariant) ──
		await page.goto(`/login?registrationToken=${invite.token}`, {
			waitUntil: "domcontentloaded",
		});
		// getByRole textbox, not getByLabel — the router devtools panel adds
		// aria-labelled "/set-password" route buttons that collide with a bare
		// label regex.
		await page.getByRole("textbox", { name: /email/i }).fill(email);
		await page.getByRole("textbox", { name: /password/i }).fill(password);
		await page.getByRole("button", { name: /^login$/i }).click();
		await page.waitForURL(/\/register\?token=/, { timeout: 30_000 });
		expect(
			new URL(page.url()).searchParams.get("token"),
			"login must forward registrationToken to /register",
		).toBe(invite.token);

		// ── Act 2: the 3-step wizard through the real UI ──────────────────────
		// Step 1 — personal details (name/email prefilled from the session).
		await expect(page.getByTestId("reg-email")).toHaveValue(email);
		await page.getByTestId("reg-phone").fill("123456789");
		await page.getByTestId("reg-id-passport").fill("990101-14-5678");
		await page.getByTestId("reg-street").fill("12 Jalan E2E");
		await page.getByTestId("reg-city").fill("Kota Kinabalu");
		await page.getByTestId("reg-state").fill("Sabah");
		await page.getByTestId("reg-country").fill("Malaysia");
		await page.getByTestId("reg-postal").fill("88000");
		await page.getByTestId("reg-dob").fill("2000-01-15");
		await page.getByTestId("reg-next-button").click();

		// Step 2 — emergency contact.
		await page.getByTestId("reg-emergency-name").fill("Siti Aminah");
		await page.getByTestId("reg-emergency-relationship").fill("Spouse");
		await page.getByTestId("reg-emergency-phone").fill("198765432");
		await page.getByTestId("reg-next-button").click();

		// Step 3 — branch selection (country card + Radix select).
		await page.getByTestId("reg-country-Malaysia").click();
		await page.getByTestId("reg-branch-select").click();
		await page
			.getByRole("option", { name: new RegExp(branch.name, "i") })
			.click();
		await page.getByTestId("reg-next-button").click();

		// ── Assert: submit succeeded ──────────────────────────────────────────
		await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

		// ── Assert at the API boundary (the UI can lie) ───────────────────────
		const session = await (
			await page.request.get("/api/auth/get-session")
		).json();
		expect(session?.user?.role, "role flips to 'user' on completion").toBe(
			"user",
		);
		expect(session?.user?.phone, "phone persisted with the dial code").toBe(
			"+60123456789",
		);

		const ctxRes = await page.request.post("/rpc/auth/userContext", {
			data: { json: {} },
		});
		expect(ctxRes.ok()).toBeTruthy();
		const ctx = (await ctxRes.json())?.json;
		const org = (ctx?.organizations ?? []).find(
			(o: any) => o.id === organizationId,
		);
		expect(org, "new member sees the org in userContext").toBeTruthy();
		expect(org.role, "membership role is client").toBe("client");

		// The tenant-side member row exists (admin view).
		const memberId = await findClientMemberId(adminReq, organizationId, userId);
		expect(memberId, "tenant members row exists for the new user").toBeTruthy();
	});

	test("registration.complete as an existing member is rejected CONFLICT (no double-registration)", async () => {
		const organizationId = getOrgId();
		const branches = await rpc(adminReq, "registration/listBranches", {
			country: "Malaysia",
		});
		const branch = (Array.isArray(branches) ? branches : []).find(
			(b: any) => b.organizationId === organizationId,
		);
		test.skip(!branch, "tenant has no Malaysia branch in listBranches");

		const inviteRows = await rpc(adminReq, "branchInvites/listAll", {
			organizationId,
		});
		const nodeRow = (Array.isArray(inviteRows) ? inviteRows : []).find(
			(r: any) => r.branchName === branch.name,
		);
		test.skip(!nodeRow, `no hierarchy node maps to branch "${branch.name}"`);

		const invite = await rpc(adminReq, "branchInvites/create", {
			organizationId,
			branchId: nodeRow.branchId,
		});
		cleanup.add(`branch invite ${invite.id} (conflict test)`, async () => {
			await rpcRaw(adminReq, "branchInvites/revoke", {
				organizationId,
				id: invite.id,
			});
		});

		// The admin (franchisee) is already a tenant member — the handler must
		// reject at the member check (409), after the invite passes redemption.
		const res = await rpcRaw(adminReq, "registration/complete", {
			inviteToken: invite.token,
			phone: "+60123456789",
			idPassportNo: "990101-14-5678",
			addressType: "home",
			streetAddress: "12 Jalan E2E",
			city: "Kota Kinabalu",
			state: "Sabah",
			country: "Malaysia",
			postalCode: "88000",
			dateOfBirth: "2000-01-15",
			emergencyContactName: "Siti Aminah",
			emergencyContactRelationship: "Spouse",
			emergencyContactPhone: "+60198765432",
			branchId: branch.id,
			organizationId,
		});
		expect(res.status(), "already-a-member -> CONFLICT").toBe(409);
		const body = await res.json().catch(() => null);
		expect(JSON.stringify(body)).toContain("already a member");
	});
});
