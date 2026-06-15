/**
 * Customer journey (UI, video): trainer delivers a session → earns a DELIVERY
 * commission → manager approves it.
 *
 * The on_completion path (vs the on_sale origination shown in the installment
 * chapter): completing an appointment fires a delivery commission to the trainer
 * (earnReason=completion, roleType=trainer). The showcase opens the commission
 * ledger, switches to the "All Staff" view, and the manager approves the
 * trainer's freshly-earned delivery commission.
 *
 * Plumbing (seed + complete) is API-driven; the showcase is the ledger UI.
 *
 * Record: PW_VIDEO=on bunx playwright test e2e/customer-journey-delivery.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstBranchId,
	pickFirstService,
	seedConfirmedAppointment,
	completeAppointment,
	getCommissionSplitsForAppointment,
	cleanupAppointment,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

type UserCtx = { currentOrganizationId?: string };

test("customer journey — completed session earns the trainer a delivery commission (approved)", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;

	// ── Plumbing: confirmed appointment → complete it → delivery commission ───
	const trainer = await pickFirstActiveTrainer(page);
	const client = await pickFirstActiveClient(page);
	test.skip(!trainer || !client, "Missing trainer/client fixtures");
	const service = await pickFirstService(page, { hasSessions: true });
	const branchId = trainer!.hierarchyScopeId ?? (await pickFirstBranchId(page));

	const appointmentId = await seedConfirmedAppointment(page, {
		trainerMemberId: trainer!.memberId,
		trainerUserId: trainer!.userId,
		clientUserId: client!.userId,
		serviceId: service?.id ?? null,
		branchId,
	});
	await completeAppointment(page, appointmentId);
	await page.waitForTimeout(1000);

	const splits = await getCommissionSplitsForAppointment(page, appointmentId);
	const delivery = splits.find(
		(s) => s.earnReason === "completion" && s.status === "pending",
	);
	test.skip(
		!delivery,
		"No delivery commission generated — tenant has no on_completion config",
	);
	const splitId = (delivery as { id: string }).id;

	try {
		// ── Showcase: the trainer's delivery commission in the ledger ──────────
		await page.goto("/dashboard/commissions/view?tab=all");
		await page.waitForLoadState("networkidle");
		await page.waitForSelector("table", { timeout: 15_000 });

		// Pending filter, then the "All Staff" view so every staff's splits show.
		const statusBar = page
			.locator("div", { has: page.getByRole("button", { name: /^Pending$/ }) })
			.filter({ has: page.getByRole("button", { name: /^Approved$/ }) })
			.last();
		await statusBar.getByRole("button", { name: /^Pending$/ }).click();
		await page.waitForTimeout(700);
		await page.locator("aside").getByText("All Staff", { exact: true }).click();
		await page.waitForTimeout(900);

		const cb = page.locator(`[aria-label="Select commission ${splitId}"]`);
		await expect(cb).toBeVisible({ timeout: 10_000 });
		await cb.scrollIntoViewIfNeeded();
		await page.waitForTimeout(1000); // show the earned delivery commission
		await cb.check({ force: true });
		await page.waitForTimeout(600);

		// Manager approves the trainer's delivery commission.
		await page.getByRole("button", { name: /approve selected/i }).click();
		await expect(
			page.getByRole("heading", { name: /approve commission splits/i }),
		).toBeVisible({ timeout: 5_000 });
		await page.waitForTimeout(500);
		await page
			.locator('[role="dialog"]')
			.getByRole("button", { name: /^Approve$/ })
			.click();
		await page.waitForTimeout(1500); // hold the approved state for the video

		// ── Verify (API): the delivery commission is now approved ─────────────
		const ledger = await orpcCall<object, { rows?: Array<{ id: string }> }>(
			page,
			"commissionSplits",
			"listLedger",
			{
				organizationId: orgId,
				status: "approved",
				staffId: (delivery as { staffId: string }).staffId,
				limit: 200,
			},
		);
		expect(
			(ledger.rows ?? []).some((r) => r.id === splitId),
			"the trainer's delivery commission must be approved",
		).toBe(true);
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
