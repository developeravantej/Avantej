/**
 * Journey (UI, video): Staff commission dispute — full visual flow.
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 *
 * Seeds an admin-owned pending commission split, then drives the real UI:
 *   1. Commissions → Mine: click "Dispute" on the row, fill the reason, submit
 *      (the category Radix select defaults to "Amount is wrong" — no Radix
 *      interaction needed), and watch the row flip to the "contested" badge.
 *   2. Commissions → Disputes: the row appears for the manager; click "Uphold",
 *      confirm, and the dispute clears.
 *   3. Back on Mine: the split is restored to "pending".
 *
 * Record video: PW_VIDEO=on bunx playwright test e2e/commission-dispute-ui.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { orpcCall } from "./helpers/orpc-client";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstBranchId,
	seedConfirmedAppointment,
	cleanupAppointment,
} from "./helpers/seed-data";

type UserCtx = { currentOrganizationId?: string; user?: { id?: string } };
type Split = { id: string; status: string };

test("commission dispute — full UI flow (dispute → manager uphold → restored)", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	const myUserId = ctx.user?.id ?? "";
	test.skip(!myUserId, "no session user id");

	// Seed an appointment target + a pending split OWNED BY ME, with a unique
	// amount so we can locate exactly this row in the table.
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

	// Unique-ish amount: RM 10.00–99.99 so the row text is easy to target.
	const amountCents = 1000 + (Date.now() % 8999);
	const rmStr = (amountCents / 100).toFixed(2); // e.g. "42.71"

	const created = await orpcCall<object, Split>(
		page,
		"commissionSplits",
		"createManualAdjustment",
		{
			organizationId: orgId,
			staffId: myUserId,
			amountCents,
			note: "UI video demo dispute seed",
			appointmentId,
		},
	);
	expect(created.status).toBe("pending");
	const splitId = created.id;

	try {
		// ── 1. MINE TAB — dispute the split ──────────────────────────────────
		await page.goto("/dashboard/commissions/view?tab=mine");
		await page.waitForLoadState("networkidle");
		await page.waitForSelector("table", { timeout: 15_000 });

		const myRow = page.getByRole("row").filter({ hasText: rmStr });
		await expect(myRow.first()).toBeVisible({ timeout: 10_000 });
		await myRow.first().scrollIntoViewIfNeeded();
		await page.waitForTimeout(800); // let the viewer see the pending row

		await myRow.first().getByRole("button", { name: "Dispute" }).click();

		// Dialog opens (category defaults to "Amount is wrong").
		await expect(
			page.getByRole("heading", { name: /dispute this commission/i }),
		).toBeVisible({ timeout: 5_000 });
		await page.waitForTimeout(600);

		await page
			.locator("#dispute-reason")
			.fill("This session was rescheduled — the amount looks wrong.");
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: /submit dispute/i }).click();

		// Row flips to the "contested" badge.
		await expect(
			page
				.getByRole("row")
				.filter({ hasText: rmStr })
				.first()
				.getByText("contested"),
		).toBeVisible({ timeout: 10_000 });
		await page.waitForTimeout(900);

		// ── 2. DISPUTES TAB — manager upholds ────────────────────────────────
		await page.goto("/dashboard/commissions/view?tab=disputes");
		await page.waitForLoadState("networkidle");
		await page.waitForSelector("table", { timeout: 15_000 });

		const disputeRow = page.getByRole("row").filter({ hasText: rmStr });
		await expect(disputeRow.first()).toBeVisible({ timeout: 10_000 });
		await disputeRow.first().scrollIntoViewIfNeeded();
		await page.waitForTimeout(800);

		await disputeRow.first().getByRole("button", { name: "Uphold" }).click();

		await expect(
			page.getByRole("heading", { name: /uphold dispute/i }),
		).toBeVisible({ timeout: 5_000 });
		await page.waitForTimeout(500);
		await page
			.locator("#resolve-note")
			.fill("Reviewed — original commission stands.");
		await page.waitForTimeout(500);
		await page
			.locator('[role="dialog"]')
			.getByRole("button", { name: /^Uphold$/ })
			.click();

		// The dispute clears from the manager queue.
		await expect(page.getByRole("row").filter({ hasText: rmStr })).toHaveCount(
			0,
			{ timeout: 10_000 },
		);
		await page.waitForTimeout(900);

		// ── 3. MINE TAB — restored to pending ────────────────────────────────
		await page.goto("/dashboard/commissions/view?tab=mine");
		await page.waitForLoadState("networkidle");
		await page.waitForSelector("table", { timeout: 15_000 });

		const restored = page.getByRole("row").filter({ hasText: rmStr }).first();
		await expect(restored).toBeVisible({ timeout: 10_000 });
		await expect(restored.getByText("pending")).toBeVisible({
			timeout: 10_000,
		});
		await page.waitForTimeout(1200); // hold the final state for the video
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
