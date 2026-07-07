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
 * "Add Customer" → onboarding (staff choice: quick self-complete vs full now).
 *
 * createUnclaimed now optionally accepts the full onboarding profile:
 *   - quick add (no profile fields) → user.role stays null; the customer
 *     self-completes later via a sign-in link + the /register wizard.
 *   - full details (all profile fields) → the customer is created
 *     registration-complete (user.role = "user"), profile persisted.
 *
 * Assertions read the control-panel user row directly (role + fields), since
 * that's what the onboarding wizard also writes. Each created member is torn
 * down (members/remove + SQL auth-row delete).
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

function controlPanelSql() {
	const devVars = readFileSync("apps/server/.dev.vars", "utf8");
	const m = devVars.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
	if (!m) throw new Error("DATABASE_URL not found in apps/server/.dev.vars");
	return neon(m[1]);
}

const FULL_PROFILE = {
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

test.describe("add customer — onboarding modes", () => {
	const cleanup = new Cleanup();
	let admin: APIRequestContext;
	let sql: ReturnType<typeof controlPanelSql>;

	test.beforeAll(async () => {
		admin = await pwRequest.newContext({
			baseURL: BASE,
			storageState: "_e2e/.auth/admin.json",
		});
		sql = controlPanelSql();
	});
	test.afterAll(async () => {
		await cleanup.runAll();
		await admin.dispose();
	});

	function registerCleanup(organizationId: string, userId: string) {
		cleanup.add(`customer ${userId}`, async () => {
			const list = await rpc(admin, "members/list", {
				organizationId,
				role: "client",
			}).catch(() => []);
			const arr = Array.isArray(list) ? list : (list?.members ?? []);
			const memberId = arr.find((m: any) => m.userId === userId)?.id;
			if (memberId) {
				await rpcRaw(admin, "members/remove", { organizationId, memberId });
			}
			await sql`DELETE FROM session WHERE user_id = ${userId}`;
			await sql`DELETE FROM account WHERE user_id = ${userId}`;
			await sql`DELETE FROM "user" WHERE id = ${userId}`;
		});
	}

	test("quick add leaves the customer registration-incomplete (role null)", async () => {
		const organizationId = getOrgId();
		const hierarchyScopeId = await getBranchId(admin);
		const created = await rpc(admin, "customerProfiles/createUnclaimed", {
			organizationId,
			firstName: "E2E",
			lastName: testId("QuickCust"),
			phone: `+601${Date.now().toString().slice(-8)}`,
			hierarchyScopeId,
		});
		expect(created.userId).toBeTruthy();
		registerCleanup(organizationId, created.userId);

		const [row] = await sql`
			SELECT role, id_passport_no, emergency_contact_name
			FROM "user" WHERE id = ${created.userId}`;
		expect(row.role, "quick add stays incomplete").toBeNull();
		expect(row.id_passport_no).toBeNull();
		expect(row.emergency_contact_name).toBeNull();
	});

	test("full details creates a registration-complete customer (role user, profile persisted)", async () => {
		const organizationId = getOrgId();
		const hierarchyScopeId = await getBranchId(admin);
		const created = await rpc(admin, "customerProfiles/createUnclaimed", {
			organizationId,
			firstName: "E2E",
			lastName: testId("FullCust"),
			phone: `+601${Date.now().toString().slice(-8)}`,
			hierarchyScopeId,
			...FULL_PROFILE,
		});
		expect(created.userId).toBeTruthy();
		registerCleanup(organizationId, created.userId);

		const [row] = await sql`
			SELECT role, id_passport_no, street_address, city, state, country,
			       postal_code, emergency_contact_name, emergency_contact_phone,
			       address_type, date_of_birth
			FROM "user" WHERE id = ${created.userId}`;
		expect(row.role, "full details completes registration").toBe("user");
		expect(row.id_passport_no).toBe(FULL_PROFILE.idPassportNo);
		expect(row.street_address).toBe(FULL_PROFILE.streetAddress);
		expect(row.city).toBe(FULL_PROFILE.city);
		expect(row.state).toBe(FULL_PROFILE.state);
		expect(row.postal_code).toBe(FULL_PROFILE.postalCode);
		expect(row.address_type).toBe("home");
		expect(row.emergency_contact_name).toBe(FULL_PROFILE.emergencyContactName);
		expect(row.emergency_contact_phone).toBe(
			FULL_PROFILE.emergencyContactPhone,
		);
	});

	test("full details on an EXISTING (incomplete) phone completes that customer — no silent drop", async () => {
		const organizationId = getOrgId();
		const hierarchyScopeId = await getBranchId(admin);
		const phone = `+601${Date.now().toString().slice(-8)}`;

		// 1) Quick-add creates an incomplete customer (role null).
		const first = await rpc(admin, "customerProfiles/createUnclaimed", {
			organizationId,
			firstName: "E2E",
			lastName: testId("DedupCust"),
			phone,
			hierarchyScopeId,
		});
		registerCleanup(organizationId, first.userId);
		const [before] = await sql`
			SELECT role FROM "user" WHERE id = ${first.userId}`;
		expect(before.role).toBeNull();

		// 2) Full-details create with the SAME phone must dedup AND apply the
		//    captured profile to the existing incomplete customer (not drop it).
		const second = await rpc(admin, "customerProfiles/createUnclaimed", {
			organizationId,
			firstName: "E2E",
			lastName: testId("DedupCust"),
			phone,
			hierarchyScopeId,
			...FULL_PROFILE,
		});
		// Same customer (dedup), not a new one.
		expect(second.userId).toBe(first.userId);

		const [after] = await sql`
			SELECT role, id_passport_no, emergency_contact_name
			FROM "user" WHERE id = ${first.userId}`;
		expect(after.role, "existing customer completed, not dropped").toBe("user");
		expect(after.id_passport_no).toBe(FULL_PROFILE.idPassportNo);
		expect(after.emergency_contact_name).toBe(
			FULL_PROFILE.emergencyContactName,
		);
	});

	test("a partial profile does NOT complete registration (all-or-nothing role flip)", async () => {
		const organizationId = getOrgId();
		const hierarchyScopeId = await getBranchId(admin);
		// IC + address but no emergency contact — must stay incomplete.
		const created = await rpc(admin, "customerProfiles/createUnclaimed", {
			organizationId,
			firstName: "E2E",
			lastName: testId("PartialCust"),
			phone: `+601${Date.now().toString().slice(-8)}`,
			hierarchyScopeId,
			idPassportNo: "990101-14-0000",
			streetAddress: "1 Partial Rd",
		});
		registerCleanup(organizationId, created.userId);

		const [row] = await sql`
			SELECT role, id_passport_no FROM "user" WHERE id = ${created.userId}`;
		expect(row.role, "partial profile stays incomplete").toBeNull();
		// The partial field it DID supply is still stored.
		expect(row.id_passport_no).toBe("990101-14-0000");
	});
});
