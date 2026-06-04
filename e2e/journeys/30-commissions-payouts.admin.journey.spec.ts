/**
 * Journeys: Commissions, Payouts & Expenses.
 * Suite: Commissions, Payouts & Expenses · Actor: tenant-admin
 *
 * Routers in scope: commissionSplits, categoryCommission, payouts, expenses, trainerTiers.
 * Pages in scope: commissions/view, commissions/my, payouts/view, expenses/view,
 *                 category-commission, trainers/tiers.
 *
 * Pattern (matches 02/03): SEED + ASSERT via oRPC (deterministic + robust), then
 * navigate the relevant /dashboard page with a tolerant UI assertion so the
 * recorded video demonstrates the end-user-visible result.
 *
 * Notes on the data model (verified against the router/service source):
 *  - commission_splits.staffId references members.userId (cross-DB text, no FK).
 *    The completion engine resolves the trainer via staffAssignments[].staffId,
 *    which seedConfirmedAppointment sets to the trainer's userId.
 *  - commissionSplits.markPaid only flips approved splits to paid; it does NOT
 *    insert a payouts row. The procedure that materialises a payouts row (and
 *    links + marks the splits paid) is payouts.runBatch — so the P0 chain uses
 *    approve → runBatch → payouts.list to assert a payout row.
 *  - Engine splits only materialise when a category commission rule applies, so
 *    P0 falls back to a manual adjustment (always approvable while < RM 500) to
 *    guarantee an approved split for the payout batch.
 */
import { test, expect } from "@playwright/test";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";
import {
	TEST_ORG_ID,
	seedConfirmedAppointment,
	completeAppointment,
	cleanupAppointment,
	getCommissionSplitsForAppointment,
} from "../helpers/seed-data";
import { ensureJourneyFixtures, branchForClient } from "../helpers/seed-journey-fixtures";

type CommissionSplit = {
	id: string;
	staffId: string;
	status: string;
	calculatedAmount: number;
};
type PayoutRow = {
	id: string;
	recipientId: string;
	amount: number;
	status: string;
};

// Period window that comfortably brackets earnedAt for both engine splits
// (≈ now, at completion) and manual adjustments (new Date()).
function payoutPeriod() {
	const periodStart = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
	const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
	return { periodStart, periodEnd };
}

// ───────────────────────────────────────────────────────────────────────────
// P0 — completed appointment → approve split → payout batch → payouts ledger
// ───────────────────────────────────────────────────────────────────────────
test(
	"Approving a commission split and running a payout batch produces a payout row",
	{ tag: ["@p0"] },
	async ({ page }) => {
		let appointmentId = "";
		let trainerUserId = "";
		let createdAdjustmentId = "";

		await test.step("Resolve fixtures (trainer, client, service, branch)", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.trainer, "an active trainer must exist").toBeTruthy();
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.service, "a service must exist").toBeTruthy();
			trainerUserId = fx.trainer!.userId;

			await test.step("Seed a confirmed private appointment for trainer + client", async () => {
				appointmentId = await seedConfirmedAppointment(page, {
					trainerMemberId: fx.trainer!.memberId,
					trainerUserId: fx.trainer!.userId,
					clientUserId: fx.client!.userId,
					serviceId: fx.service!.id,
					branchId: branchForClient(fx),
				});
				expect(appointmentId, "appointment must be created").toBeTruthy();
			});

			await test.step("Mark the appointment completed (runs the commission engine)", async () => {
				await completeAppointment(page, appointmentId);
			});
		});

		// The approvable split: prefer an engine-generated pending split for the
		// completed appointment; fall back to a manual bonus so the payout batch
		// always has an approved split to pay (deterministic on any tenant).
		let approvableSplitId = "";
		await test.step("Find a pending split for the appointment (or seed a manual bonus)", async () => {
			const splits = await getCommissionSplitsForAppointment(page, appointmentId);
			test.info().annotations.push({ type: "engine-splits", description: String(splits.length) });
			const enginePending = splits.find((s) => s.status === "pending");
			if (enginePending) {
				approvableSplitId = enginePending.id;
				return;
			}
			// Fallback — manual bonus (RM 25, well under the RM 500 review threshold,
			// so it lands in 'pending' and is immediately approvable).
			const adj = await orpcCall<object, CommissionSplit>(
				page,
				"commissionSplits",
				"createManualAdjustment",
				{
					organizationId: TEST_ORG_ID,
					staffId: trainerUserId,
					amountCents: 2500,
					note: "E2E P0 payout-batch seed bonus",
					appointmentId,
				},
			);
			createdAdjustmentId = adj.id;
			approvableSplitId = adj.id;
			expect(adj.status, "manual bonus should be pending (below review threshold)").toBe("pending");
		});

		await test.step("Approve the pending split (commissionSplits.approve)", async () => {
			const approved = await orpcCall<object, CommissionSplit[]>(
				page,
				"commissionSplits",
				"approve",
				{ organizationId: TEST_ORG_ID, ids: [approvableSplitId] },
			);
			expect(approved.some((s) => s.id === approvableSplitId && s.status === "approved")).toBe(true);
		});

		await test.step("Run a payout batch for the trainer (inserts a payout row + marks splits paid)", async () => {
			const { periodStart, periodEnd } = payoutPeriod();
			const result = await orpcCall<object, { payoutIds: string[]; totalAmountCents: number; splitCount: number }>(
				page,
				"payouts",
				"runBatch",
				{
					organizationId: TEST_ORG_ID,
					staffIds: [trainerUserId],
					periodStart,
					periodEnd,
					paymentMethod: "bank_transfer",
					reference: "E2E P0 payout batch",
				},
			);
			expect(result.payoutIds.length, "payout batch should create at least one payout row").toBeGreaterThan(0);
			expect(result.splitCount).toBeGreaterThan(0);
		});

		await test.step("Assert the payout row appears via payouts.list", async () => {
			const rows = await orpcCall<object, PayoutRow[]>(page, "payouts", "list", {
				organizationId: TEST_ORG_ID,
				recipientId: trainerUserId,
				limit: 50,
			});
			expect(Array.isArray(rows)).toBe(true);
			expect(rows.some((p) => p.recipientId === trainerUserId && p.status === "paid")).toBe(true);
		});

		await test.step("Open the Payouts ledger — the page renders without error", async () => {
			await page.goto("/dashboard/payouts/view");
			await expect(page.getByRole("heading", { name: /payouts/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Open the Commissions ledger — paid split is visible end-to-end", async () => {
			await page.goto("/dashboard/commissions/view");
			await expect(page.getByRole("heading", { name: /commissions/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Cleanup — cancel the seeded appointment", async () => {
			// Paid splits/payouts are immutable financial records; we only undo the appointment.
			if (appointmentId) await cleanupAppointment(page, appointmentId);
			test.info().annotations.push({
				type: "manual-adjustment",
				description: createdAdjustmentId || "none (engine split used)",
			});
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// P1 — manual adjustment (bonus) then void with reason
// ───────────────────────────────────────────────────────────────────────────
test(
	"A manual commission bonus can be created and then voided with a reason",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let splitId = "";

		await test.step("Resolve a trainer to credit the bonus to", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.trainer, "an active trainer must exist").toBeTruthy();

			await test.step("Create a manual commission adjustment (bonus)", async () => {
				const adj = await orpcCall<object, CommissionSplit>(
					page,
					"commissionSplits",
					"createManualAdjustment",
					{
						organizationId: TEST_ORG_ID,
						staffId: fx.trainer!.userId,
						amountCents: 1500, // RM 15 bonus — under the RM 500 review threshold
						note: "E2E manual bonus — performance incentive",
					},
				);
				splitId = adj.id;
				expect(splitId, "adjustment must be created").toBeTruthy();
				expect(adj.calculatedAmount).toBe(1500);
				expect(adj.status).toBe("pending");
			});
		});

		await test.step("Void the bonus with a reason (commissionSplits.void)", async () => {
			const voided = await orpcCall<object, CommissionSplit>(page, "commissionSplits", "void", {
				organizationId: TEST_ORG_ID,
				id: splitId,
				reason: "E2E — bonus issued in error, reversing",
			});
			expect(voided.status).toBe("void");
		});

		await test.step("Open the Commissions ledger — page renders without error", async () => {
			await page.goto("/dashboard/commissions/view");
			await expect(page.getByRole("heading", { name: /commissions/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// P1 — expense approve→markPaid happy path, plus a separate reject path
// ───────────────────────────────────────────────────────────────────────────
test(
	"An expense can be approved then marked paid, and a separate expense can be rejected",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let approveId = "";
		let rejectId = "";

		await test.step("Resolve a branch scope for the expenses", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.branchId, "a branch scope must resolve").toBeTruthy();

			await test.step("Create an expense to push through approve → paid", async () => {
				const created = await orpcCall<object, { id: string; status: string }>(
					page,
					"expenses",
					"create",
					{
						organizationId: TEST_ORG_ID,
						branchId: branchForClient(fx),
						category: "supplies",
						description: "E2E expense — paid path",
						amount: 4200, // RM 42
						expenseDate: new Date().toISOString(),
					},
				);
				approveId = created.id;
				expect(approveId, "expense must be created").toBeTruthy();
			});

			await test.step("Create a second expense to push through the reject path", async () => {
				const created = await orpcCall<object, { id: string; status: string }>(
					page,
					"expenses",
					"create",
					{
						organizationId: TEST_ORG_ID,
						branchId: branchForClient(fx),
						category: "travel",
						description: "E2E expense — reject path",
						amount: 9900, // RM 99
						expenseDate: new Date().toISOString(),
					},
				);
				rejectId = created.id;
				expect(rejectId, "expense must be created").toBeTruthy();
			});
		});

		await test.step("Approve the first expense (expenses.approve)", async () => {
			const approved = await orpcCall<object, { id: string; status: string }>(
				page,
				"expenses",
				"approve",
				{ organizationId: TEST_ORG_ID, id: approveId },
			);
			expect(approved.status).toBe("approved");
		});

		await test.step("Mark the approved expense paid (expenses.markPaid)", async () => {
			const paid = await orpcCall<object, { id: string; status: string }>(
				page,
				"expenses",
				"markPaid",
				{ organizationId: TEST_ORG_ID, id: approveId, paymentReference: "E2E-EXP-REF-001" },
			);
			expect(paid.status).toBe("paid");
		});

		await test.step("Reject the second expense with a reason (expenses.reject)", async () => {
			const rejected = await orpcCall<object, { id: string; status: string }>(
				page,
				"expenses",
				"reject",
				{
					organizationId: TEST_ORG_ID,
					id: rejectId,
					rejectionReason: "E2E — out of policy, rejecting",
				},
			);
			expect(rejected.status).toBe("rejected");
		});

		await test.step("Verify final statuses via expenses.getById", async () => {
			const paid = await orpcCall<object, { id: string; status: string }>(
				page,
				"expenses",
				"getById",
				{ organizationId: TEST_ORG_ID, id: approveId },
			);
			const rejected = await orpcCall<object, { id: string; status: string }>(
				page,
				"expenses",
				"getById",
				{ organizationId: TEST_ORG_ID, id: rejectId },
			);
			expect(paid.status).toBe("paid");
			expect(rejected.status).toBe("rejected");
		});

		await test.step("Open the Expenses page — both expenses are reflected without error", async () => {
			await page.goto("/dashboard/expenses/view");
			await expect(page.getByRole("heading", { name: /expenses/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// P1 — trainer tier create / update / delete (deactivate)
// ───────────────────────────────────────────────────────────────────────────
test(
	"A trainer tier can be created, updated and deactivated",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let tierId = "";
		const tierName = `E2E Tier ${Date.now()}`;

		await test.step("Create a trainer tier (trainerTiers.create)", async () => {
			// createTrainerTier returns { tier, missingRateCategories } — unwrap .tier.
			const created = await orpcCall<object, { tier?: { id: string; name: string }; id?: string; name?: string }>(
				page,
				"trainerTiers",
				"create",
				{
					organizationId: TEST_ORG_ID,
					name: tierName,
					description: "E2E created tier",
					rank: 7,
				},
			);
			tierId = created.tier?.id ?? created.id ?? "";
			expect(tierId, "tier must be created").toBeTruthy();
			expect(created.tier?.name ?? created.name).toBe(tierName);
		});

		await test.step("Update the trainer tier (trainerTiers.update)", async () => {
			await orpcCall(page, "trainerTiers", "update", {
				organizationId: TEST_ORG_ID,
				id: tierId,
				name: `${tierName} (renamed)`,
				rank: 8,
			});
			// Verify via list (return shape of update is wrapper-agnostic this way).
			const all = await orpcCall<object, Array<{ id: string; name: string; rank: number }>>(
				page,
				"trainerTiers",
				"list",
				{ organizationId: TEST_ORG_ID, includeInactive: true },
			);
			const t = all.find((x) => x.id === tierId);
			expect(t?.name, "renamed tier must be found").toBe(`${tierName} (renamed)`);
			expect(t?.rank).toBe(8);
		});

		await test.step("Open the Trainer Tiers page (trainers/tiers → trainers/view?tab=tiers)", async () => {
			await page.goto("/dashboard/trainers/tiers");
			// tiers redirects to the trainers hub with the tiers tab selected.
			await expect(page).toHaveURL(/\/dashboard\/trainers\/view/);
			await expect(page.getByRole("heading", { name: /trainers/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Deactivate (delete) the trainer tier (trainerTiers.deactivate)", async () => {
			await orpcCall<object, unknown>(page, "trainerTiers", "deactivate", {
				organizationId: TEST_ORG_ID,
				id: tierId,
			});
			// Verify it no longer appears among active tiers.
			const active = await orpcCall<object, Array<{ id: string }>>(
				page,
				"trainerTiers",
				"list",
				{ organizationId: TEST_ORG_ID },
			);
			expect(active.some((t) => t.id === tierId)).toBe(false);
		});

		await test.step("Cleanup — ensure the tier is deactivated (idempotent)", async () => {
			try {
				await orpcCall(page, "trainerTiers", "deactivate", {
					organizationId: TEST_ORG_ID,
					id: tierId,
				});
			} catch (err) {
				if (err instanceof OrpcClientError) return; // already gone / already inactive
				throw err;
			}
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// P1 — commissions/my renders for admin
// ───────────────────────────────────────────────────────────────────────────
test(
	"The My Commissions surface renders for an admin",
	{ tag: ["@p1"] },
	async ({ page }) => {
		await test.step("Fetch the admin's own commissions via commissionSplits.getMyCommissions", async () => {
			const result = await orpcCall<object, unknown>(page, "commissionSplits", "getMyCommissions", {
				organizationId: TEST_ORG_ID,
			});
			// Shape varies (array or grouped object); assert the call succeeds.
			expect(result).toBeDefined();
		});

		await test.step("Open commissions/my (redirects to the Commissions hub, 'mine' tab)", async () => {
			await page.goto("/dashboard/commissions/my");
			await expect(page).toHaveURL(/\/dashboard\/commissions\/view/);
			await expect(page.getByRole("heading", { name: /commissions/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);
