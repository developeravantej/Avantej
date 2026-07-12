import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { expectForbidden, getOrgId } from "../_safe-mutation";

// RBAC boundary: a non-admin staff user must not be able to move commission
// money. Server layer: payouts/runBatch is double-gated for non-admins —
// assertStaffWithinScope fails CLOSED (any staff id that doesn't resolve to an
// in-scope member → FORBIDDEN) and commission_payout:process is required.
// Either gate yields 403 for the seeded staff role. UI layer: the Run Batch
// affordance is permission-gated (canRunBatch) and must not render.
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("payouts (RBAC — staff API)", () => {
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

	test("staff is FORBIDDEN from running a payout batch", async () => {
		const organizationId = getOrgId();
		await expectForbidden(staff, "payouts/runBatch", {
			organizationId,
			// Out-of-scope/unknown staff target: the fail-closed scope guard
			// rejects non-admin callers before any money moves.
			staffIds: ["e2e-rbac-not-a-real-staff-id"],
			periodStart: new Date(Date.now() - 3_600_000).toISOString(),
			periodEnd: new Date().toISOString(),
			paymentMethod: "bank_transfer",
		});
	});

	test("staff is FORBIDDEN from previewing a payout batch for out-of-scope staff", async () => {
		const organizationId = getOrgId();
		await expectForbidden(staff, "payouts/previewBatch", {
			organizationId,
			staffIds: ["e2e-rbac-not-a-real-staff-id"],
			periodStart: new Date(Date.now() - 3_600_000).toISOString(),
			periodEnd: new Date().toISOString(),
		});
	});

	test("staff is FORBIDDEN from processing a single recipient payout", async () => {
		const organizationId = getOrgId();
		await expectForbidden(staff, "payouts/processForRecipient", {
			organizationId,
			recipientId: "e2e-rbac-not-a-real-staff-id",
			paymentMethod: "cash",
		});
	});
});

// UI defence-in-depth: as staff, the payouts tab must not offer "Run Batch".
test.describe("payouts (RBAC — staff UI)", () => {
	test.skip(!existsSync(STAFF_STATE), "no staff session");
	test.use({ storageState: STAFF_STATE });

	test("staff does not see the Run Batch control on the payouts tab", async ({
		page,
	}) => {
		await page.goto("/dashboard/commissions/view?tab=payouts", {
			waitUntil: "domcontentloaded",
		});
		await page
			.locator('[data-sidebar="content"]')
			.first()
			.waitFor({ state: "visible", timeout: 20_000 });
		await expect(
			page.getByRole("heading", { name: "Something went wrong" }),
		).toHaveCount(0);
		// Whether the tab renders a permission-denied panel or a read-only list,
		// the money-moving affordance must be absent.
		await expect(page.getByRole("button", { name: "Run Batch" })).toHaveCount(
			0,
		);
	});
});
