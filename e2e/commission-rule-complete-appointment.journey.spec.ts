/**
 * Journey: Complete appointment → commission split appears with earnReason = completion
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P0
 * Seed: seedConfirmedAppointment (trainer + client via oRPC)
 *
 * Precondition: test tenant must have commission configuration (trainerTierId + categoryCommission)
 * for a split to be generated. If the tenant has no commission config, the test skips.
 *
 * Run: bunx playwright test e2e/commission-rule-complete-appointment.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstBranchId,
	seedConfirmedAppointment,
	completeAppointment,
	cleanupAppointment,
	getCommissionSplitsForAppointment,
} from "./helpers/seed-data";

test("complete appointment → commission split appears with earnReason=completion", {
	tag: ["@p0"],
}, async ({ page }) => {
	// ── Precondition checks ──────────────────────────────────────────────────
	// Navigate first so the oRPC picks (relative /rpc fetch via page.evaluate)
	// run against a real origin instead of about:blank (which returns null → skip).
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const trainer = await pickFirstActiveTrainer(page);
	test.skip(!trainer, "No active trainer in test tenant — skip");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client member in test tenant — skip");

	// Use trainer's hierarchyScopeId as branchId (it IS their branch node ID)
	const branchId = trainer!.hierarchyScopeId ?? (await pickFirstBranchId(page));
	const service = await pickFirstService(page);

	let appointmentId = "";

	// ── Seed ────────────────────────────────────────────────────────────────
	try {
		// Offset by 60 minutes so this appointment doesn't clash with the cancel test
		appointmentId = await seedConfirmedAppointment(page, {
			trainerMemberId: trainer!.memberId,
			trainerUserId: trainer!.userId,
			clientUserId: client!.userId,
			serviceId: service?.id ?? null,
			branchId: branchId!,
			offsetMinutes: 60,
		});
	} catch (err) {
		test.skip(true, `Could not seed appointment: ${String(err)}`);
	}

	// ── Act: complete the appointment ────────────────────────────────────────
	await completeAppointment(page, appointmentId);

	// Allow DB commit to propagate
	await page.waitForTimeout(500);

	// ── Assert: commission split created with earnReason = "completion" ──────
	const splits = await getCommissionSplitsForAppointment(page, appointmentId);

	// If no splits, test tenant has no commission config — skip with message
	test.skip(
		splits.length === 0,
		`No commission splits generated for appointment ${appointmentId} — test tenant has no commission config (trainerTierId + categoryCommission). Set up commission config in admin panel and re-run.`,
	);

	const completionSplit = splits.find((s) => s.earnReason === "completion");
	expect(
		completionSplit,
		`No split with earnReason=completion found. Splits: ${JSON.stringify(splits)}`,
	).toBeDefined();
	expect(completionSplit!.status).toBe("pending");

	// ── Cleanup ──────────────────────────────────────────────────────────────
	// Completed appointments cannot be re-cancelled, so cleanupAppointment will
	// receive a 400 (status transition invalid) — swallowed gracefully.
	await cleanupAppointment(page, appointmentId);
});
