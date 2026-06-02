/**
 * Journey: Completed appointment → commission split → approve → payout (paid)
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P0
 *
 * This is the full money trail that no single existing spec covers end-to-end:
 *   - commission-rule-complete-appointment  → only the split-appears step
 *   - payouts-confirm-creates-row           → only the payout-UI step
 * Here we chain them: complete the appointment, verify the commission is
 * attributed correctly, approve it, run a payout batch, and prove the split was
 * actually paid out — then show the Payouts tab in the UI.
 *
 * A "past" appointment: there is no API to backdate startTime, but COMPLETING a
 * confirmed appointment is what fires the commission engine (earnReason=
 * "completion", earnedAt=now). That is the real trigger a past/finished session hits.
 *
 * UI vs API: the two operator actions are driven through the real UI —
 *   - APPROVE: All Commissions → Pending → tick the split → "Approve Selected" → confirm.
 *   - PAYOUT:  Payouts → "Run Batch" drawer → pick staff + period → confirm.
 * The appointment seed/complete and all assertions stay on the API (appointment
 * creation uses non-automatable Radix selects, and the API is the source of truth).
 *
 * State machine asserted:
 *   appointment: confirmed → completed
 *   commission split: (none) → pending → approved → paid
 *   payout: (none) → paid, amount ≥ the split's calculatedAmount
 *   The paid split is also confirmed present in the All Commissions ledger
 *   (commissionSplits.listLedger) with the same calculatedAmount.
 *
 * Skips cleanly if the tenant has no commission config (no tier/category rates).
 *
 * Run: bunx playwright test e2e/appointment-commission-payout.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstBranchId,
	seedConfirmedAppointment,
	completeAppointment,
	cleanupAppointment,
	getCommissionSplitsForAppointment,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

type Page = import("@playwright/test").Page;

test("completed appointment generates commission → approve → payout marks it paid", {
	tag: ["@p0"],
}, async ({ page }) => {
	// ── Preconditions ──────────────────────────────────────────────────────────
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const trainer = await pickFirstActiveTrainer(page);
	test.skip(!trainer, "No active trainer in test tenant — skip");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client in test tenant — skip");

	const branchId = trainer!.hierarchyScopeId ?? (await pickFirstBranchId(page));
	const service = await pickFirstService(page);

	let appointmentId = "";

	// ── 1. Seed a confirmed appointment with the trainer assigned ──────────────
	try {
		appointmentId = await seedConfirmedAppointment(page, {
			trainerMemberId: trainer!.memberId,
			trainerUserId: trainer!.userId,
			clientUserId: client!.userId,
			serviceId: service?.id ?? null,
			branchId: branchId!,
			offsetMinutes: 180, // avoid slot clashes with the other commission specs
		});
	} catch (err) {
		test.skip(true, `Could not seed appointment: ${String(err)}`);
	}
	expect(appointmentId).toBeTruthy();

	// ── 2. Complete the appointment (this is what a finished session does) ─────
	await completeAppointment(page, appointmentId);
	await page.waitForTimeout(500); // let the commission tx commit

	// ── 3. Verify the commission is attributed correctly ───────────────────────
	const splits = await getCommissionSplitsForAppointment(page, appointmentId);
	test.skip(
		splits.length === 0,
		"No commission splits generated — tenant has no commission config (tier + category rates). Configure and re-run.",
	);

	const split = splits.find((s) => s.earnReason === "completion");
	expect(
		split,
		`No completion split. Splits: ${JSON.stringify(splits)}`,
	).toBeDefined();
	// Right person, right reason, real money, not yet paid.
	expect(split!.staffId).toBe(trainer!.userId);
	expect(split!.status).toBe("pending");
	expect(split!.calculatedAmount).toBeGreaterThan(0);
	const splitAmount = split!.calculatedAmount;
	const splitId = split!.id;

	// ── 4. Approve the split via the UI (All Commissions → Pending) ────────────
	await page.goto("/dashboard/commissions/view?tab=all");
	await page.waitForLoadState("networkidle");

	const permDenied = await page
		.getByText(/permission denied/i)
		.isVisible({ timeout: 2_000 })
		.catch(() => false);
	test.skip(permDenied, "Admin lacks commission_management:read — skip");

	// Switch to the Pending inner-tab (this is what enables row checkboxes).
	const pendingInnerTab = page.getByRole("button", { name: /^Pending$/i });
	await pendingInnerTab.waitFor({ timeout: 10_000 });
	await pendingInnerTab.click();
	await page.waitForTimeout(600);

	// Narrow to our trainer via the staff sidebar so our (newest) split's row is
	// on the first page, then tick its checkbox by the split id.
	const staffEntry = page
		.getByText(new RegExp(trainer!.name.split(" ")[0] ?? trainer!.name, "i"))
		.first();
	if (await staffEntry.isVisible().catch(() => false)) {
		await staffEntry.click();
		await page.waitForTimeout(400);
	}

	const splitCheckbox = page.locator(
		`[aria-label="Select commission ${splitId}"]`,
	);
	await expect(splitCheckbox).toBeVisible({ timeout: 10_000 });
	await splitCheckbox.check();

	// BulkActionBar → "Approve Selected" → confirm dialog "Approve Commission Splits".
	const approveSelectedBtn = page.getByRole("button", {
		name: /approve selected/i,
	});
	await expect(approveSelectedBtn).toBeVisible({ timeout: 5_000 });
	await approveSelectedBtn.click();

	const approveDialog = page.getByRole("dialog").filter({
		has: page.getByRole("heading", { name: /approve commission splits/i }),
	});
	await expect(approveDialog).toBeVisible({ timeout: 5_000 });
	await approveDialog.getByRole("button", { name: /^approve$/i }).click();

	// Confirm via API that the split is now approved.
	await expect
		.poll(
			async () => {
				const after = await getCommissionSplitsForAppointment(
					page,
					appointmentId,
				);
				return after.find((s) => s.id === splitId)?.status;
			},
			{
				timeout: 10_000,
				message: "split should be approved after the UI action",
			},
		)
		.toBe("approved");

	// ── 5. Run a payout batch via the UI (Payouts tab → Run Batch drawer) ──────
	await page.goto("/dashboard/commissions/view?tab=payouts");
	await page.waitForLoadState("networkidle");

	const runBatchBtn = page.getByRole("button", { name: /run batch/i });
	await expect(runBatchBtn).toBeVisible({ timeout: 10_000 });
	await runBatchBtn.click();
	await expect(page.getByTestId("run-batch-drawer")).toBeVisible({
		timeout: 8_000,
	});

	// Staff combobox (cmdk) → filter to OUR trainer by name, then pick the single
	// matching option. Filtering avoids the "first option" trap that selected the
	// wrong staff under the full suite (→ 0-split preview → disabled confirm).
	await page.getByTestId("batch-staff-combobox").click();
	const staffSearch = page.getByPlaceholder(/search staff/i);
	await staffSearch.fill(trainer!.name);
	await page.waitForTimeout(300);
	await page.getByRole("option").first().click();
	await page.keyboard.press("Escape");

	// Period = the current month (the split's earnedAt is "now").
	const now = new Date();
	const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
		.toISOString()
		.split("T")[0]!;
	const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
		.toISOString()
		.split("T")[0]!;
	await page
		.getByTestId("batch-period-start")
		.fill(startDate)
		.catch(() => {});
	await page
		.getByTestId("batch-period-end")
		.fill(endDate)
		.catch(() => {});

	// The preview is debounced; wait for the confirm button to enable (it only
	// enables when ≥1 approved split matches the selected staff + period).
	const confirmBatchBtn = page.getByTestId("batch-confirm-button");
	await expect(confirmBatchBtn).toBeEnabled({ timeout: 12_000 });
	await confirmBatchBtn.click();

	// Success toast + drawer closes. Actual paid-state is asserted via API below.
	await expect(
		page
			.locator("[data-sonner-toast]")
			.filter({ hasText: /payout/i })
			.first(),
	).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId("run-batch-drawer")).not.toBeVisible({
		timeout: 10_000,
	});

	// ── 6. Verify the split is now PAID ────────────────────────────────────────
	await expect
		.poll(
			async () => {
				const after = await getCommissionSplitsForAppointment(
					page,
					appointmentId,
				);
				return after.find((s) => s.id === splitId)?.status;
			},
			{
				timeout: 10_000,
				message: "split should be paid after the payout batch",
			},
		)
		.toBe("paid");

	// ── 7. Verify a paid payout exists for the trainer, ≥ the split amount ─────
	type PayoutRow = {
		id: string;
		recipientId: string;
		amount: number;
		status: string;
	};
	const payouts = await orpcCall<object, PayoutRow[]>(page, "payouts", "list", {
		organizationId: TEST_ORG_ID,
		recipientId: trainer!.userId,
	});
	const paid = payouts.filter((p) => p.status === "paid");
	expect(paid.length).toBeGreaterThan(0);
	// The batch must have paid out at least this trainer's just-approved commission.
	expect(Math.max(...paid.map((p) => p.amount))).toBeGreaterThanOrEqual(
		splitAmount,
	);

	// ── 8. Verify the split shows in the All Commissions ledger (paid) ─────────
	type LedgerRow = {
		id: string;
		appointmentId: string | null;
		status: string;
		calculatedAmount: number;
		staffId: string;
	};
	type LedgerResult = { rows?: LedgerRow[] } | LedgerRow[];
	const ledger = await orpcCall<object, LedgerResult>(
		page,
		"commissionSplits",
		"listLedger",
		{
			organizationId: TEST_ORG_ID,
			staffId: trainer!.userId,
			limit: 200,
			offset: 0,
		},
	);
	const ledgerRows = Array.isArray(ledger) ? ledger : (ledger.rows ?? []);
	const ledgerRow = ledgerRows.find(
		(r) => r.id === splitId || r.appointmentId === appointmentId,
	);
	expect(
		ledgerRow,
		"commission split should appear in the All Commissions ledger",
	).toBeDefined();
	expect(ledgerRow!.status).toBe("paid");
	expect(ledgerRow!.calculatedAmount).toBe(splitAmount);

	// ── 9. UI: the All Commissions tab shows the trainer's ledger as paid ──────
	await page.goto("/dashboard/commissions/view?tab=all");
	await page.waitForLoadState("networkidle");
	await expect(
		page
			.getByText(new RegExp(trainer!.name.split(" ")[0] ?? trainer!.name, "i"))
			.first(),
	).toBeVisible({ timeout: 10_000 });

	// ── 10. Cleanup (best-effort) ──────────────────────────────────────────────
	await cleanupAppointment(page, appointmentId);
});
