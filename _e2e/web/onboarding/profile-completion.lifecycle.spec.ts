import {
	test,
	expect,
	request as pwRequest,
	type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import {
	getOrgId,
	getBranchId,
	rpc,
	rpcRaw,
	testId,
	Cleanup,
} from "../_safe-mutation";

/**
 * Web member-registration — PROFILE-COMPLETION mode (GHL approval hand-off).
 *
 * A GHL-approved contact is materialized by staff as a client member with a
 * null user role and no profile. The /register wizard must detect that state,
 * swap step 3 for a read-only branch Confirm, and submit
 * registration.completeProfile (no invite token) — the flow that used to dead-
 * end in "already a member" (409).
 *
 * Fixture: members/create as admin links an EXISTING auth user by email and
 * creates a client membership — the same shape GHL materialization produces,
 * but with a password so the browser can log in.
 *
 * Cleanup: members/remove (both DBs) + SQL delete of the auth rows.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

function controlPanelSql() {
	const devVars = readFileSync("apps/server/.dev.vars", "utf8");
	const m = devVars.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
	if (!m) throw new Error("DATABASE_URL not found in apps/server/.dev.vars");
	return neon(m[1]);
}

const PROFILE_FIELDS = {
	phone: "+60123456789",
	idPassportNo: "990101-14-5678",
	addressType: "home" as const,
	streetAddress: "12 Jalan E2E",
	city: "Kota Kinabalu",
	state: "Sabah",
	country: "Malaysia",
	postalCode: "88000",
	dateOfBirth: "2000-01-15",
	emergencyContactName: "Siti Aminah",
	emergencyContactRelationship: "Spouse",
	emergencyContactPhone: "+60198765432",
};

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

/** Sign up + verify a fresh user; returns { email, password, userId }. */
async function createVerifiedUser(
	cleanup: Cleanup,
	adminReq: APIRequestContext,
	organizationId: string,
	sql: ReturnType<typeof controlPanelSql>,
) {
	const email = `${testId("ghl-member").toLowerCase()}@e2e.test`;
	const password = "password123!";
	const anonReq = await pwRequest.newContext({ baseURL: BASE });
	const signup = await anonReq.post("/api/auth/sign-up/email", {
		data: {
			name: "E2E Ghl Member",
			email,
			password,
			firstName: "E2E",
			lastName: "Ghl Member",
		},
	});
	expect(signup.ok(), `sign-up -> ${signup.status()}`).toBeTruthy();
	const userId = (await signup.json())?.user?.id as string;
	expect(userId).toBeTruthy();
	await anonReq.dispose();

	cleanup.add(`member+auth rows for ${email}`, async () => {
		const memberId = await findClientMemberId(
			adminReq,
			organizationId,
			userId,
		).catch(() => null);
		if (memberId) {
			await rpcRaw(adminReq, "members/remove", { organizationId, memberId });
		}
		await sql`DELETE FROM session WHERE user_id = ${userId}`;
		await sql`DELETE FROM account WHERE user_id = ${userId}`;
		await sql`DELETE FROM "user" WHERE id = ${userId}`;
	});

	await sql`UPDATE "user" SET email_verified = true WHERE id = ${userId}`;
	return { email, password, userId };
}

test.describe("registration web — profile-completion mode (GHL hand-off)", () => {
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

	test("GHL-shaped member completes their profile through the Confirm wizard", async ({
		page,
	}) => {
		test.setTimeout(240_000);
		const organizationId = getOrgId();
		const sql = controlPanelSql();

		// ── Arrange: a client member with a null role (the GHL-approval shape) ──
		const { email, password, userId } = await createVerifiedUser(
			cleanup,
			adminReq,
			organizationId,
			sql,
		);
		const branchNodeId = await getBranchId(adminReq);
		await rpc(adminReq, "members/create", {
			organizationId,
			email,
			role: "client",
			hierarchyScopeId: branchNodeId,
		});

		// profileStatus must flag the completion mode + surface the branch name.
		const userReq = await pwRequest.newContext({ baseURL: BASE });
		const signin = await userReq.post("/api/auth/sign-in/email", {
			data: { email, password },
		});
		expect(signin.ok()).toBeTruthy();
		const status = await rpc(userReq, "registration/profileStatus", {
			organizationId,
		});
		expect(status.isMember).toBe(true);
		expect(status.needsProfileCompletion).toBe(true);
		expect(status.branchName, "branch name resolves for Confirm").toBeTruthy();
		await userReq.dispose();

		// ── Act: log in through the UI and complete the wizard ────────────────
		await page.goto("/login", { waitUntil: "domcontentloaded" });
		await page.getByRole("textbox", { name: /email/i }).fill(email);
		await page.getByRole("textbox", { name: /password/i }).fill(password);
		await page.getByRole("button", { name: /^login$/i }).click();
		await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

		await page.goto("/register", { waitUntil: "domcontentloaded" });

		// Completion mode: no invite-token notice, step 3 is "Confirm".
		await expect(page.getByTestId("reg-first-name")).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId("reg-missing-token-notice")).toHaveCount(0);
		await expect(page.getByText("Confirm", { exact: true })).toBeVisible();

		// Step 1 — personal (name/email prefilled from the session).
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

		// Step 3 — read-only Confirm: fixed branch card, no country/branch inputs.
		await expect(page.getByTestId("reg-confirm-branch")).toBeVisible();
		await expect(page.getByTestId("reg-confirm-branch")).toHaveText(
			status.branchName,
		);
		await expect(page.getByTestId("reg-branch-select")).toHaveCount(0);
		await expect(page.getByTestId("reg-next-button")).toHaveText(
			"Complete registration",
		);
		await page.getByTestId("reg-next-button").click();

		// ── Assert: success + API-boundary post-conditions ─────────────────────
		await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
		const session = await (
			await page.request.get("/api/auth/get-session")
		).json();
		expect(session?.user?.role, "role flips to 'user'").toBe("user");
		expect(session?.user?.phone).toBe("+60123456789");

		// Re-running completeProfile must now CONFLICT — no double completion.
		const again = await rpcRaw(page.request, "registration/completeProfile", {
			organizationId,
			...PROFILE_FIELDS,
		});
		expect(again.status(), "second completion -> CONFLICT").toBe(409);
	});

	test("completeProfile is FORBIDDEN for staff/admin members and non-members", async () => {
		const organizationId = getOrgId();
		const sql = controlPanelSql();

		// Admin (franchisee) is a member — but role admin, not client.
		const asAdmin = await rpcRaw(adminReq, "registration/completeProfile", {
			organizationId,
			...PROFILE_FIELDS,
		});
		expect(asAdmin.status(), "admin member -> FORBIDDEN").toBe(403);
		expect(JSON.stringify(await asAdmin.json())).toContain("client members");

		// A fresh user with NO membership at all.
		const { email, password } = await createVerifiedUser(
			cleanup,
			adminReq,
			organizationId,
			sql,
		);
		const userReq = await pwRequest.newContext({ baseURL: BASE });
		const signin = await userReq.post("/api/auth/sign-in/email", {
			data: { email, password },
		});
		expect(signin.ok()).toBeTruthy();
		const asNonMember = await rpcRaw(userReq, "registration/completeProfile", {
			organizationId,
			...PROFILE_FIELDS,
		});
		expect(asNonMember.status(), "non-member -> FORBIDDEN").toBe(403);
		expect(JSON.stringify(await asNonMember.json())).toContain("No membership");
		await userReq.dispose();
	});
});
