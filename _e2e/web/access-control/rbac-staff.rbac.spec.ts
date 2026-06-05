import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { getOrgId, getBranchId, expectForbidden, rpc } from "../_safe-mutation";

// RBAC boundary specs — run as the seeded NON-admin "staff" user
// (staff.deterministic@test.com, role "staff"). Assert the SERVER permission
// layer rejects governance writes the staff role lacks (FORBIDDEN), and that a
// permitted read still works. Skips gracefully if the staff session is absent.
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("access-control (RBAC — staff)", () => {
	let staff: APIRequestContext;

	test.beforeAll(async ({ playwright }) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed` then re-run",
		);
		staff = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
	});
	test.afterAll(async () => {
		await staff?.dispose();
	});

	test("Staff is FORBIDDEN from creating a role (role_management:create)", async () => {
		const organizationId = getOrgId();
		await expectForbidden(staff, "roles/create", {
			organizationId,
			name: "E2E-DEEP-staff-should-not-create",
			priority: 41,
		});
	});

	test("Staff is FORBIDDEN from inviting a user (user_management:create)", async () => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(staff);
		await expectForbidden(staff, "invitations/create", {
			organizationId,
			email: "e2e-deep-staff-invite@test.my",
			role: "staff",
			hierarchyScopeId: branchId,
		});
	});

	// NOTE: the 403s above (not 401) inherently prove the staff session is an
	// authenticated, non-admin MEMBER — an unauthenticated session would 401, and
	// an admin would succeed. So a separate "positive read" is redundant here.
});

// UI layer: as staff, the "New Role" affordance on the roles page should be
// hidden (defence-in-depth — UI hides what the server also blocks).
test.describe("access-control (RBAC — staff UI)", () => {
	test.skip(!existsSync(STAFF_STATE), "no staff session");
	test.use({ storageState: STAFF_STATE });

	test("Staff does not see a create-role control on the roles page", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/roles", {
			waitUntil: "domcontentloaded",
		});
		await page
			.locator('[data-sidebar="content"]')
			.first()
			.waitFor({ state: "visible", timeout: 20_000 });
		await expect(
			page.getByRole("heading", { name: "Something went wrong" }),
		).toHaveCount(0);
		// No "New role" / "Create role" / "Add role" button for a non-privileged user.
		await expect(
			page.getByRole("button", { name: /new role|create role|add role/i }),
		).toHaveCount(0);
	});
});
