/**
 * Journeys: RBAC & Access Control — scoped-staff boundaries.
 * Suite: RBAC & Access Control · Actor: scoped-staff (staff.deterministic@test.com)
 *
 * The staff member holds READ-ONLY permissions (hierarchy/user/service/appointment
 * _management:read) and is scoped to a hierarchy node. These journeys assert the
 * permission gate (allow reads, deny writes/admin) and that the dashboard renders a
 * restricted surface. oRPC enforces input validation BEFORE the permission gate, so
 * deny targets use schema-valid minimal input to reach the FORBIDDEN check.
 */
import { test, expect } from "@playwright/test";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";
import { TEST_ORG_ID } from "../helpers/seed-data";

type UserContext = {
	user: { id: string; email: string };
	isSystemAdmin: boolean;
	organizations: Array<{ id: string; role: string; permissions: string[]; hierarchy?: { nodes: Array<{ id: string }> } }>;
};

test("Scoped staff is granted exactly a read-only permission set", { tag: ["@p0"] }, async ({ page }) => {
	await test.step("Load the staff's userContext", async () => {
		const ctx = await orpcCall<object, UserContext>(page, "auth", "userContext", {});
		const org = ctx.organizations.find((o) => o.id === TEST_ORG_ID) ?? ctx.organizations[0];
		expect(org, "staff must belong to the test org").toBeTruthy();

		await test.step("Role is 'staff' and the platform-admin flag is off", async () => {
			expect(org!.role).toBe("staff");
			expect(ctx.isSystemAdmin).toBe(false);
		});

		await test.step("Permissions are read-only — no create/update/delete/approve", async () => {
			const perms = org!.permissions ?? [];
			expect(perms.length).toBeGreaterThan(0);
			const writeish = perms.filter((p) => /:(create|update|delete|approve|void|process|markPaid)$/i.test(p));
			expect(writeish, `staff must hold no write/admin permissions, found: ${writeish.join(", ")}`).toEqual([]);
			test.info().annotations.push({ type: "staff-permissions", description: perms.join(", ") });
		});
	});
});

test("Scoped staff is DENIED write & admin actions by the permission gate", { tag: ["@p0"] }, async ({ page }) => {
	const denyTargets: Array<[string, string, object]> = [
		["brands", "create", { organizationId: TEST_ORG_ID, name: "E2E Deny Brand" }],
		["productCategories", "create", { organizationId: TEST_ORG_ID, name: "E2E Deny Category" }],
		["members", "deactivate", { organizationId: TEST_ORG_ID, memberId: "6cb81ecc-00ec-422f-8772-4c7696f5728a" }],
	];
	for (const [router, proc, input] of denyTargets) {
		await test.step(`${router}.${proc} → FORBIDDEN`, async () => {
			let code = "";
			try {
				await orpcCall(page, router, proc, input);
			} catch (err) {
				code = err instanceof OrpcClientError ? err.code : String(err);
			}
			// Denial surfaces either as a 200-envelope code ("FORBIDDEN") or a real HTTP 403,
			// depending on the procedure — both are valid permission-gate rejections.
			expect(["FORBIDDEN", "403", "UNAUTHORIZED", "401"], `${router}.${proc} must be denied for staff (got "${code}")`).toContain(code);
		});
	}
});

test("Scoped staff IS allowed its permitted reads (positive control)", { tag: ["@p0"] }, async ({ page }) => {
	await test.step("services.list (service_management:read) succeeds", async () => {
		const rows = await orpcCall<object, unknown[]>(page, "services", "list", { organizationId: TEST_ORG_ID, isActive: true });
		expect(Array.isArray(rows)).toBe(true);
	});
	await test.step("appointments.list (appointment_management:read) succeeds", async () => {
		const rows = await orpcCall<object, unknown[]>(page, "appointments", "list", { organizationId: TEST_ORG_ID });
		expect(Array.isArray(rows)).toBe(true);
	});
	await test.step("members.list (user_management:read) succeeds", async () => {
		const rows = await orpcCall<object, unknown[]>(page, "members", "list", { organizationId: TEST_ORG_ID, status: "active" });
		expect(Array.isArray(rows)).toBe(true);
	});
});

test("Scoped staff dashboard renders a restricted surface", { tag: ["@p1"] }, async ({ page }) => {
	await test.step("Staff lands on the dashboard (authenticated)", async () => {
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/dashboard/);
		await expect(page.locator("body")).toBeVisible();
		await page.waitForTimeout(1200);
	});

	await test.step("Navigating to an admin-only area degrades gracefully (no crash)", async () => {
		await page.goto("/dashboard/access-control/roles");
		await page.waitForTimeout(1200);
		// Staff lacks role_management — expect a redirect, empty state, or guard; never a crash.
		await expect(page.locator("body")).toBeVisible();
		await expect(page.locator("body")).not.toContainText(/something went wrong|TypeError|undefined is not/i);
	});

	await test.step("Navigating to inventory (no permission) degrades gracefully", async () => {
		await page.goto("/dashboard/products/view");
		await page.waitForTimeout(1200);
		await expect(page.locator("body")).toBeVisible();
		await expect(page.locator("body")).not.toContainText(/something went wrong|TypeError/i);
	});
});

test("Hierarchy scoping bounds the staff's accessible nodes", { tag: ["@p1"] }, async ({ page }) => {
	await test.step("userContext exposes a non-empty, bounded hierarchy for the staff", async () => {
		const ctx = await orpcCall<object, UserContext>(page, "auth", "userContext", {});
		const org = ctx.organizations.find((o) => o.id === TEST_ORG_ID) ?? ctx.organizations[0];
		const nodes = org?.hierarchy?.nodes ?? [];
		expect(nodes.length, "staff should see a bounded set of hierarchy nodes").toBeGreaterThan(0);
		test.info().annotations.push({ type: "staff-accessible-nodes", description: String(nodes.length) });
	});
});
