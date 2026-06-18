/**
 * Journey: Create trainer via "Invite Trainer" dialog on /dashboard/trainers/view
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Steps:
 *   1. Navigate to /dashboard/trainers/view
 *   2. Click "Invite Trainer"
 *   3. Fill email (required), hierarchy scope (required), display name, specialization, phone
 *   4. Submit → toast "Trainer added successfully."
 *   5. Assert trainer appears in the list
 *   6. Cleanup: deactivate via members.deactivate
 *
 * Run: bunx playwright test e2e/trainer-create.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";
import { TEST_ORG_ID, pickFirstBranchId } from "./helpers/seed-data";

// ─── Random helpers ───────────────────────────────────────────────────────────

const FIRST_NAMES = [
	"Azri",
	"Hafiz",
	"Danial",
	"Irfan",
	"Syafiq",
	"Luqman",
	"Izzat",
	"Farid",
];
const LAST_NAMES = [
	"Malik",
	"Razali",
	"Fadzil",
	"Salleh",
	"Zulkifli",
	"Hamid",
	"Karim",
	"Noor",
];
const SPECS = [
	"Strength & Conditioning",
	"Yoga & Mobility",
	"HIIT & Cardio",
	"Pilates",
	"CrossFit",
];

function randomItem<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone(): string {
	const prefix = ["11", "12", "13", "16", "17", "18"][
		Math.floor(Math.random() * 6)
	];
	const mid = String(Math.floor(Math.random() * 9000) + 1000);
	const end = String(Math.floor(Math.random() * 9000) + 1000);
	return `+60 ${prefix}-${mid} ${end}`;
}

function randomEmail(first: string, last: string): string {
	const id = String(Math.floor(Math.random() * 9000) + 1000);
	return `trainer.${first.toLowerCase()}.${last.toLowerCase()}${id}@e2e.test`;
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Register a new user in the control-panel DB via Better-Auth sign-up.
 * Returns the userId on success, or null if it fails.
 */
async function registerUser(
	page: Parameters<typeof orpcCall>[0],
	email: string,
	name: string,
): Promise<string | null> {
	type SignUpResult = {
		user?: { id: string };
		token?: string;
		error?: { message: string };
	};
	try {
		const result = (await (page as import("@playwright/test").Page).evaluate(
			async ({ email, name }) => {
				const resp = await fetch("/api/auth/sign-up/email", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email, password: "E2eTest1234!", name }),
				});
				return resp.json();
			},
			{ email, name },
		)) as SignUpResult;
		return result?.user?.id ?? null;
	} catch {
		return null;
	}
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

async function deactivateTrainer(
	page: Parameters<typeof orpcCall>[0],
	memberId: string,
): Promise<void> {
	try {
		await orpcCall(page, "members", "deactivate", {
			organizationId: TEST_ORG_ID,
			memberId,
		});
	} catch (err) {
		if (
			err instanceof OrpcClientError &&
			(err.code === "NOT_FOUND" || err.code === "FORBIDDEN")
		)
			return;
		// swallow — cleanup errors don't affect test result
	}
}

// ─── Spec ─────────────────────────────────────────────────────────────────────

test("Create trainer via Invite Trainer dialog → appears in trainer list", {
	tag: ["@p1"],
}, async ({ page }) => {
	const firstName = randomItem(FIRST_NAMES);
	const lastName = randomItem(LAST_NAMES);
	const displayName = `${firstName} ${lastName}`;
	const email = randomEmail(firstName, lastName);
	const phone = randomPhone();
	const spec = randomItem(SPECS);
	let createdMemberId = "";

	// ── 0. Pre-register the user (trainer must already exist in auth DB) ────────
	await page.goto("/dashboard");
	const userId = await registerUser(page, email, displayName);
	test.skip(!userId, "Could not pre-register test user via sign-up — skip");

	// ── 1. Navigate to Trainers page ──────────────────────────────────────────
	await page.goto("/dashboard/trainers/view");
	await page.waitForLoadState("networkidle");

	// ── 2. Open Invite Trainer dialog ─────────────────────────────────────────
	const inviteBtn = page.getByRole("button", { name: /invite trainer/i });
	await expect(inviteBtn).toBeVisible({ timeout: 10_000 });
	await inviteBtn.click();

	const dialog = page.locator('[role="dialog"]');
	await expect(dialog).toBeVisible({ timeout: 5_000 });
	await expect(
		dialog.getByText(/invite trainer|add trainer/i).first(),
	).toBeVisible();

	// ── 3. Fill required fields ───────────────────────────────────────────────

	// Email
	await dialog.locator("#trainer-email").fill(email);

	// Hierarchy Scope — Radix Select
	const scopeTrigger = dialog.locator("#trainer-scope");
	await expect(scopeTrigger).toBeVisible({ timeout: 5_000 });
	await scopeTrigger.click();
	const firstScopeOption = page.getByRole("option").first();
	await expect(firstScopeOption).toBeVisible({ timeout: 5_000 });
	await firstScopeOption.click();

	// ── 4. Fill optional profile fields ──────────────────────────────────────
	// Profile section may be collapsed — click to expand
	const profileToggle = dialog
		.locator("button")
		.filter({ hasText: /profile/i })
		.first();
	if (await profileToggle.isVisible()) {
		await profileToggle.click();
	}

	const displayNameInput = dialog.locator("#trainer-display-name");
	if (await displayNameInput.isVisible()) {
		await displayNameInput.fill(displayName);
	}

	const specInput = dialog.locator("#trainer-specialization");
	if (await specInput.isVisible()) {
		await specInput.fill(spec);
	}

	const phoneInput = dialog.locator("#trainer-phone");
	if (await phoneInput.isVisible()) {
		await phoneInput.fill(phone);
	}

	// ── 5. Submit ─────────────────────────────────────────────────────────────
	const submitBtn = dialog.getByRole("button", { name: /add trainer/i });
	await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
	await submitBtn.click();

	// Toast
	await expect(page.getByText(/trainer added successfully/i)).toBeVisible({
		timeout: 10_000,
	});

	// Dialog closes
	await expect(dialog).not.toBeVisible({ timeout: 8_000 });

	// ── 6. Assert trainer in the list ─────────────────────────────────────────
	// Target the TRAINER-LIST search box (placeholder "Search…"), NOT the
	// sidebar "Power search…" box. Exact match disambiguates the two.
	const searchBox = page.getByPlaceholder("Search…", { exact: true });
	await expect(searchBox).toBeVisible({ timeout: 5_000 });
	await searchBox.fill(firstName);
	await page.waitForTimeout(600); // 300ms debounce + refetch

	await expect(
		page
			.getByText(displayName, { exact: false })
			.or(page.getByText(email, { exact: false }))
			.first(),
	).toBeVisible({ timeout: 8_000 });

	// ── 7. Resolve memberId for cleanup ───────────────────────────────────────
	// Match on the userId returned by registerUser — robust against parallel data.
	type MemberRow = { id: string; userId: string; role: string; status: string };
	try {
		const rows = await orpcCall<object, MemberRow[]>(page, "members", "list", {
			organizationId: TEST_ORG_ID,
			role: "trainer",
			status: "active",
		});
		createdMemberId = rows.find((r) => r.userId === userId)?.id ?? "";
	} catch {
		// non-fatal
	}

	// ── 8. Cleanup ────────────────────────────────────────────────────────────
	if (createdMemberId) await deactivateTrainer(page, createdMemberId);
});
