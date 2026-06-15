/**
 * Customer journey (UI, video): trainer dispute → manager ADJUSTS.
 *
 * The corrected-amount path (vs the uphold path in customer-journey-dispute):
 * a trainer contests a commission, and the manager resolves it by ADJUSTING —
 * voiding the disputed split and creating a corrected manual split in one step.
 *
 * Record: PW_VIDEO=on bunx playwright test e2e/customer-journey-dispute-adjust.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstBranchId,
	seedConfirmedAppointment,
	cleanupAppointment,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

type UserCtx = { currentOrganizationId?: string; user?: { id?: string } };
type Split = { id: string; status: string };

test("customer journey — trainer disputes, manager adjusts (void + corrected split)", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	const me = ctx.user?.id ?? "";
	test.skip(!me, "no session user id");

	// Seed an admin-owned pending split with a unique amount to locate it.
	const trainer = await pickFirstActiveTrainer(page);
	const client = await pickFirstActiveClient(page);
	test.skip(!trainer || !client, "Missing trainer/client fixtures");
	const branchId = client!.hierarchyScopeId ?? (await pickFirstBranchId(page));
	const appointmentId = await seedConfirmedAppointment(page, {
		trainerMemberId: trainer!.memberId,
		trainerUserId: trainer!.userId,
		clientUserId: client!.userId,
		branchId,
	});

	const amountCents = 1000 + (Date.now() % 8999);
	const rmStr = (amountCents / 100).toFixed(2);

	const created = await orpcCall<object, Split>(
		page,
		"commissionSplits",
		"createManualAdjustment",
		{
			organizationId: orgId,
			staffId: me,
			amountCents,
			note: "UI video dispute-adjust seed",
			appointmentId,
		},
	);
	expect(created.status).toBe("pending");
	const splitId = created.id;

	try {
		// ── 1. MINE TAB — dispute it ─────────────────────────────────────────
		await page.goto("/dashboard/commissions/view?tab=mine");
		await page.waitForLoadState("networkidle");
		await page.waitForSelector("table", { timeout: 15_000 });
		const myRow = page.getByRole("row").filter({ hasText: rmStr }).first();
		await expect(myRow).toBeVisible({ timeout: 10_000 });
		await page.waitForTimeout(800);
		await myRow.getByRole("button", { name: "Dispute" }).click();
		await expect(
			page.getByRole("heading", { name: /dispute this commission/i }),
		).toBeVisible({ timeout: 5_000 });
		await page.waitForTimeout(500);
		await page
			.locator("#dispute-reason")
			.fill("The rate looks off — please correct it.");
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: /submit dispute/i }).click();
		await expect(
			page
				.getByRole("row")
				.filter({ hasText: rmStr })
				.first()
				.getByText("contested"),
		).toBeVisible({ timeout: 10_000 });
		await page.waitForTimeout(900);

		// ── 2. DISPUTES TAB — manager ADJUSTS ────────────────────────────────
		await page.goto("/dashboard/commissions/view?tab=disputes");
		await page.waitForLoadState("networkidle");
		await page.waitForSelector("table", { timeout: 15_000 });
		const dRow = page.getByRole("row").filter({ hasText: rmStr }).first();
		await expect(dRow).toBeVisible({ timeout: 10_000 });
		await page.waitForTimeout(800);
		await dRow.getByRole("button", { name: "Adjust" }).click();

		await expect(
			page.getByRole("heading", { name: /adjust commission/i }),
		).toBeVisible({ timeout: 5_000 });
		await page.waitForTimeout(500);
		const correctedRm = ((amountCents + 500) / 100).toFixed(2);
		await page.locator("#adjust-amount").fill(correctedRm);
		await page.waitForTimeout(500);
		await page
			.locator('[role="dialog"]')
			.getByRole("button", { name: /^Adjust$/ })
			.click();
		await page.waitForTimeout(1500);

		// ── 3. Verify (API): original voided + a corrected manual split exists ─
		const mine = await orpcCall<
			object,
			{
				splits: Array<{ id: string; status: string; calculatedAmount: number }>;
			}
		>(page, "commissionSplits", "getMyCommissions", { organizationId: orgId });
		const original = mine.splits.find((s) => s.id === splitId);
		expect(original?.status, "original disputed split must be voided").toBe(
			"void",
		);
		const corrected = mine.splits.find(
			(s) => s.id !== splitId && s.calculatedAmount === amountCents + 500,
		);
		expect(
			corrected,
			"a corrected manual split must exist at the adjusted amount",
		).toBeTruthy();
		await page.waitForTimeout(1200); // hold for the video
	} finally {
		try {
			await orpcCall(page, "commissionSplits", "voidById", {
				organizationId: orgId,
				id: splitId,
				reason: "E2E cleanup",
			});
		} catch {
			// best-effort
		}
		await cleanupAppointment(page, appointmentId);
	}
});
