/**
 * Journeys: Customers & Trainers.
 * Suite: Customers & Trainers · Tier: P1 · Actor: tenant-admin
 *
 * Routers in scope: customerDirectory, customerProfiles, memberProfiles,
 * serviceMembers, walkInCustomers.
 * Pages in scope: customers/view (→ customers/v2/view), customers/$id (Customer 360),
 * customers/walk-in/view (redirects to customers/v2/view), trainers/view,
 * my-services/view.
 *
 * Each journey SEEDS/ASSERTS state via oRPC (deterministic + robust) then
 * navigates the relevant dashboard page with a tolerant UI assertion so the
 * recorded video demonstrates the end-user-visible result.
 */
import { test, expect } from "@playwright/test";
import { ensureJourneyFixtures } from "../helpers/seed-journey-fixtures";
import { TEST_ORG_ID, pickFirstActiveClient, pickFirstActiveTrainer, pickFirstService } from "../helpers/seed-data";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";

// ─── Shared response shapes ──────────────────────────────────────────────────
type DirectoryList = { rows: Array<{ memberId: string; name: string; email: string | null }>; total: number };
type CustomerDetail = { member: { id: string; hierarchyScopeId: string }; user?: { id: string; name: string } };

test("Customer directory lists customers and opens the Customer 360 detail", { tag: ["@p1"] }, async ({ page }) => {
	let customerMemberId = "";
	let customerName = "";

	await test.step("List registered customers via customerDirectory.list", async () => {
		const list = await orpcCall<object, DirectoryList>(page, "customerDirectory", "list", {
			organizationId: TEST_ORG_ID,
			limit: 50,
			offset: 0,
		});
		expect(Array.isArray(list.rows), "directory must return a rows array").toBe(true);
		const first = list.rows[0];
		expect(first, "tenant must have at least one registered customer").toBeTruthy();
		customerMemberId = first!.memberId;
		customerName = first!.name;
		test.info().annotations.push({ type: "customer-count", description: String(list.total) });
	});

	await test.step("Open the Customers directory page — heading + list render", async () => {
		await page.goto("/dashboard/customers/v2/view?tab=customers");
		await expect(page.getByRole("heading", { name: /customers/i }).first()).toBeVisible();
		await expect(page).toHaveURL(/customers\/v2\/view/);
		await page.waitForTimeout(1200);
		await expect(page.locator("body")).not.toContainText(/something went wrong/i);
	});

	await test.step("Fetch the Customer 360 detail via customerDirectory.getById", async () => {
		const detail = await orpcCall<object, CustomerDetail>(page, "customerDirectory", "getById", {
			organizationId: TEST_ORG_ID,
			memberId: customerMemberId,
		});
		expect(detail.member.id, "detail must resolve the requested member").toBe(customerMemberId);
	});

	await test.step("Open the Customer 360 page", async () => {
		await page.goto(`/dashboard/customers/${customerMemberId}`);
		await expect(page).toHaveURL(new RegExp(`/dashboard/customers/${customerMemberId}`));
		await page.waitForTimeout(1200);
		await expect(page.locator("body")).toBeVisible();
		await expect(page.locator("body")).not.toContainText(/something went wrong/i);
	});
});

test("Admin upserts a customer profile (customerProfiles.upsertForCustomer)", { tag: ["@p1"] }, async ({ page }) => {
	await test.step("Resolve an active client to edit", async () => {
		const client = await pickFirstActiveClient(page);
		expect(client, "an active client must exist to edit").toBeTruthy();

		await test.step("Upsert the client's profile via the admin-scoped procedure", async () => {
			// upsertForCustomer keys on targetUserId = control-panel userId; handler
			// verifies it's a 'client' member within the admin's accessible scope.
			const updated = await orpcCall<object, { id?: string }>(
				page,
				"customerProfiles",
				"upsertForCustomer",
				{
					organizationId: TEST_ORG_ID,
					targetUserId: client!.userId,
					notes: `E2E admin note ${Date.now()}`,
					fitnessGoals: ["e2e-strength"],
				},
			);
			// The service returns the persisted profile row.
			expect(updated, "upsert must return a profile row").toBeTruthy();
		});

		await test.step("Open the Customer 360 page so the edited profile is visible", async () => {
			await page.goto(`/dashboard/customers/${client!.memberId}`);
			await expect(page).toHaveURL(new RegExp(`/dashboard/customers/${client!.memberId}`));
			await page.waitForTimeout(1200);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	});
});

test("Walk-in customers list surface renders", { tag: ["@p1"] }, async ({ page }) => {
	await test.step("Fetch the walk-in customers list via walkInCustomers.list", async () => {
		// This procedure is an intentional stub returning { items: [], total: 0 }
		// (walk-in customers were superseded by the anonymous walk-in flow). Assert
		// the shape — do NOT skip on empty, the emptiness is by design.
		const result = await orpcCall<object, { items: unknown[]; total: number }>(
			page,
			"walkInCustomers",
			"list",
			{ organizationId: TEST_ORG_ID },
		);
		expect(Array.isArray(result.items), "walk-in list must return an items array").toBe(true);
		expect(typeof result.total).toBe("number");
	});

	await test.step("Open the walk-in page — it redirects to the Customers directory", async () => {
		await page.goto("/dashboard/customers/walk-in/view");
		// The walk-in route is a tab-redirect onto the unified customers directory.
		await expect(page).toHaveURL(/customers\/v2\/view/);
		await expect(page.getByRole("heading", { name: /customers/i }).first()).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(/something went wrong/i);
	});
});

test("Assign a member to a service, list, then remove (serviceMembers)", { tag: ["@p1"] }, async ({ page }) => {
	let memberId = "";
	let serviceId = "";
	let assigned = false;

	type ServiceMemberRow = { memberId: string; isPrimary: boolean; displayName: string };

	await test.step("Resolve a trainer member + a service", async () => {
		const [trainer, service] = await Promise.all([
			pickFirstActiveTrainer(page),
			pickFirstService(page),
		]);
		expect(trainer, "an active trainer must exist").toBeTruthy();
		expect(service, "a service must exist").toBeTruthy();
		memberId = trainer!.memberId;
		serviceId = service!.id;
	});

	await test.step("Assign the member to the service via serviceMembers.assign", async () => {
		await orpcCall<object, { success: boolean }>(page, "serviceMembers", "assign", {
			organizationId: TEST_ORG_ID,
			memberId,
			serviceId,
		});
		assigned = true;
	});

	await test.step("listForService includes the assigned member", async () => {
		const rows = await orpcCall<object, ServiceMemberRow[]>(page, "serviceMembers", "listForService", {
			organizationId: TEST_ORG_ID,
			serviceId,
		});
		expect(rows.some((r) => r.memberId === memberId), "assigned member must appear in listForService").toBe(true);
	});

	await test.step("Open the My Services page (renders the logged-in admin's assignments)", async () => {
		// my-services/view renders serviceMembers.listMine (the caller's own services),
		// so it is a tolerant "renders without error" surface for this admin journey.
		await page.goto("/dashboard/my-services/view");
		await expect(page.getByRole("heading", { name: /my services/i }).first()).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(/something went wrong/i);
	});

	await test.step("Remove the member from the service and confirm it's gone", async () => {
		await orpcCall<object, { success: boolean }>(page, "serviceMembers", "remove", {
			organizationId: TEST_ORG_ID,
			memberId,
			serviceId,
		});
		assigned = false;
		const rows = await orpcCall<object, ServiceMemberRow[]>(page, "serviceMembers", "listForService", {
			organizationId: TEST_ORG_ID,
			serviceId,
		});
		expect(rows.some((r) => r.memberId === memberId), "member must no longer be assigned").toBe(false);
	});

	await test.step("Cleanup — ensure the assignment is removed", async () => {
		if (!assigned) return;
		try {
			await orpcCall(page, "serviceMembers", "remove", {
				organizationId: TEST_ORG_ID,
				memberId,
				serviceId,
			});
		} catch (err) {
			if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
			throw err;
		}
	});
});

test("Trainers directory renders", { tag: ["@p1"] }, async ({ page }) => {
	await test.step("Confirm at least one trainer exists via members.list (trainer role)", async () => {
		// Reuse the suite's fixture resolver — trainer is picked from members.list.
		const fx = await ensureJourneyFixtures(page);
		expect(fx.trainer, "an active trainer must exist for the directory").toBeTruthy();
	});

	await test.step("Open the Trainers directory page — heading renders", async () => {
		await page.goto("/dashboard/trainers/view");
		await expect(page.getByRole("heading", { name: /trainers/i }).first()).toBeVisible();
		await expect(page).toHaveURL(/trainers\/view/);
		await page.waitForTimeout(1200);
		await expect(page.locator("body")).not.toContainText(/something went wrong/i);
	});
});
