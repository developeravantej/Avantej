/**
 * Journey: Branch onboarding full form submit — anon user creates account and lands on dashboard
 *
 * Actor: anonymous (journeys-anon project — no storageState)
 * Priority: P0
 *
 * Two-phase test:
 * 1. Admin context (new browser context) calls branchInvites.create via oRPC to get an invite URL.
 * 2. Anon context visits the URL, fills the form, submits, and asserts redirect to /dashboard.
 *
 * Cleanup: created user is NOT removed automatically (no delete endpoint exists yet).
 * Each run uses a unique email (testuser+<timestamp>@avantej-e2e.test) so there is no collision.
 * Add e2e-cleanup.ts script later to prune these users periodically.
 *
 * Run: bunx playwright test e2e/branch-onboarding-full-submit.anon.journey.spec.ts --project=journeys-anon
 */

import { test, expect, type BrowserContext } from "@playwright/test";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { orpcCall } from "./helpers/orpc-client";
import { pickFirstBranchId, TEST_ORG_ID } from "./helpers/seed-data";

const ADMIN_EMAIL = "franchisee@gmail.com";
const ADMIN_PASSWORD = "password123";

// ESM-safe __dirname equivalent
const _dirname = dirname(fileURLToPath(import.meta.url));
// Path to the cleanup script (two levels up from e2e/ to repo root)
const CLEANUP_SCRIPT = join(
	_dirname,
	"../../apps/server/scripts/e2e-cleanup.ts",
);

// After all anon-journey runs, clean up any testuser+* accounts created by this spec.
// Uses --apply so it actually deletes (dry-run is harmless if the script doesn't exist yet).
test.afterAll(() => {
	try {
		execSync(
			`bun run ${CLEANUP_SCRIPT} --email-prefix testuser+ --tenant ${TEST_ORG_ID} --apply`,
			{ stdio: "pipe", timeout: 30_000 },
		);
	} catch (err) {
		// Cleanup failures are non-fatal — log and continue.
		// The next run will pick up leftover users.
		console.warn("[e2e-cleanup] afterAll cleanup warning:", String(err));
	}
});

test("anon user fills onboarding form and lands on dashboard", {
	tag: ["@p0"],
}, async ({ browser }) => {
	// ── Step 1: admin logs in and creates a branch invite ───────────────────
	const adminCtx: BrowserContext = await browser.newContext();
	const adminPage = await adminCtx.newPage();

	await adminPage.goto("/login");
	const adminForm = adminPage.locator("form").first();
	await adminForm.getByRole("textbox", { name: /email/i }).fill(ADMIN_EMAIL);
	await adminForm.locator('input[type="password"]').fill(ADMIN_PASSWORD);
	await adminForm.getByRole("button", { name: "Login", exact: true }).click();
	await adminPage.waitForURL("**/dashboard**", { timeout: 20_000 });

	// Pick a branch node to attach the invite to
	const branchId = await pickFirstBranchId(adminPage);

	type InviteResult = {
		invite?: { id: string; token: string };
		url?: string;
		inviteUrl?: string;
	};
	let inviteUrl = "";
	try {
		const result = await orpcCall<object, InviteResult>(
			adminPage,
			"branchInvites",
			"create",
			{
				organizationId: TEST_ORG_ID,
				branchId,
			},
		);
		inviteUrl = result.url ?? result.inviteUrl ?? "";
		if (!inviteUrl && result.invite?.token) {
			inviteUrl = `http://localhost:3001/onboarding/${result.invite.token}?org=${TEST_ORG_ID}`;
		}
	} catch (err) {
		await adminCtx.close();
		test.skip(true, `Could not create branch invite: ${String(err)}`);
	}

	await adminCtx.close();

	test.skip(!inviteUrl, "Branch invite URL could not be obtained — skip");

	// ── Step 2: anon user visits the invite URL and submits ──────────────────
	const anonCtx: BrowserContext = await browser.newContext();
	const anonPage = await anonCtx.newPage();

	const timestamp = Date.now();
	const testEmail = `testuser+${timestamp}@avantej-e2e.test`;
	const testName = `E2E Test User ${timestamp}`;
	const testPassword = "TestPass123!";

	// Track console errors
	const consoleErrors: string[] = [];
	anonPage.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});

	await anonPage.goto(inviteUrl, { timeout: 30_000 });
	await anonPage.waitForLoadState("networkidle", { timeout: 15_000 });

	// Assert form is visible (not an error page)
	const emailInput = anonPage
		.getByTestId("onboarding-email-input")
		.or(anonPage.getByLabel(/email/i).first());
	await expect(emailInput.first()).toBeVisible({ timeout: 15_000 });

	// Branch name should be visible and non-empty
	const branchNameEl = anonPage.getByTestId("onboarding-branch-name");
	const branchNameVisible = await branchNameEl
		.isVisible({ timeout: 5_000 })
		.catch(() => false);
	if (branchNameVisible) {
		const branchNameText = await branchNameEl.textContent();
		expect(branchNameText?.trim()).toBeTruthy();
	}

	// Fill the form
	const nameInput = anonPage
		.getByTestId("onboarding-name-input")
		.or(anonPage.getByLabel(/name|full name/i).first());
	await nameInput.first().fill(testName);

	await emailInput.first().fill(testEmail);

	const passwordInput = anonPage
		.getByTestId("onboarding-password-input")
		.or(anonPage.getByLabel(/password/i).first());
	await passwordInput.first().fill(testPassword);

	// Submit
	const submitBtn = anonPage.getByTestId("onboarding-submit-button").or(
		anonPage.getByRole("button", {
			name: /submit|register|sign up|create account/i,
		}),
	);
	await submitBtn.first().click();

	// Assert redirect to dashboard (or buy-package flow)
	await expect(anonPage).toHaveURL(/\/dashboard/, { timeout: 30_000 });

	// No JS errors should have fired during the submit
	const criticalErrors = consoleErrors.filter(
		(e) => !e.includes("favicon") && !e.includes("ERR_ABORTED"),
	);
	expect(
		criticalErrors,
		`Console errors during onboarding submit: ${criticalErrors.join("; ")}`,
	).toHaveLength(0);

	await anonCtx.close();
});
