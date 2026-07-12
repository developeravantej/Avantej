import { test, expect, type APIRequestContext } from "@playwright/test";
import {
	Cleanup,
	getBranchId,
	getOrgId,
	expectRejected,
	rpc,
	rpcRaw,
	testId,
} from "../_safe-mutation";

// ============================================================================
// Payout batch lifecycle — the highest-risk money-movement flow.
//
// API-driven (page.request → /rpc/...) with a UI cross-check on the Payouts
// tab. Seeds FRESH commissions (manual adjustments against freshly created
// sales orders) so no assertion ever depends on pre-existing ledger rows:
//
//   seed 2 splits (2 staff) → approve → previewBatch → runBatch(pending)
//   → markPaid one recipient → markFailed the other → retry → cancel
//   → assert final states + that the approved-split ledger reconciles.
//
// Server invariants asserted (read from payouts.service / batch.procedures):
//   - previewBatch counts only status='approved' splits in [start, end].
//   - runBatch(confirmImmediately=false) → one payout row PER RECIPIENT at
//     status='pending'; linked splits stay 'approved' (recipient coverage:
//     every seeded staff member receives a payout row — commission reaches
//     ALL recipients in the batch).
//   - markPaid: pending → paid AND settles linked splits (preview drops to 0).
//   - markFailed: pending → failed; splits STAY approved (still owed).
//   - retry: failed → pending only.
//   - cancel: pending|failed → canceled; splits revert to approved with
//     payoutId cleared (re-batchable) — the liability is never lost.
//   - invalid transition (markPaid on a canceled row) is rejected.
//
// Idempotency of runBatch against double-submission is already covered by
// e2e/commission-payout-idempotency.journey.spec.ts — not duplicated here.
//
// NOTE: the markPaid leg permanently settles ONE tiny seeded split (RM 11.11)
// on the test tenant — paid splits are deliberately un-voidable. Everything
// else is torn down (split voided, orders cancelled).
// ============================================================================

const AMOUNT_A = 1111; // integer cents — RM 11.11
const AMOUNT_B = 2222; // integer cents — RM 22.22

type MemberRow = { id: string; userId: string; name: string };

/** Window around "now" — seeded splits get earnedAt = insertion time. */
function windowBounds() {
	return {
		periodStart: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
		periodEnd: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
	};
}

/** Preview a batch for the given staff (admin caller bypasses scope checks). */
async function preview(
	request: APIRequestContext,
	organizationId: string,
	staffIds: string[],
) {
	const { periodStart, periodEnd } = windowBounds();
	return rpc(request, "payouts/previewBatch", {
		organizationId,
		staffIds,
		periodStart,
		periodEnd,
	});
}

test.describe("payouts — batch lifecycle", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("preview → run(pending) → markPaid / markFailed → retry → cancel, ledger reconciles", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// ── 1. Pick two staff with ZERO approved splits in the test window ──────
		// (so every subsequent count/total assertion is exactly ours, never
		// entangled with pre-existing ledger rows).
		const membersRes = await rpc(page.request, "members/list", {
			organizationId,
		});
		const members: MemberRow[] = (
			Array.isArray(membersRes) ? membersRes : (membersRes?.items ?? [])
		).filter((m: MemberRow) => !!m.userId);
		test.skip(members.length < 2, "tenant has fewer than 2 staff members");

		const candidateIds = members.slice(0, 50).map((m) => m.userId);
		const baseline = await preview(page.request, organizationId, candidateIds);
		const busy = new Set(
			(baseline?.byStaff ?? []).map((s: { staffId: string }) => s.staffId),
		);
		const free = members.filter((m) => !busy.has(m.userId)).slice(0, 2);
		test.skip(
			free.length < 2,
			"could not find 2 staff without approved splits in the current window",
		);
		const [staffA, staffB] = free;

		// ── 2. Seed: one fresh sales order + one manual adjustment per staff ───
		async function seedSplit(staff: MemberRow, amountCents: number) {
			const order = await rpc(page.request, "salesOrders/create", {
				organizationId,
				date: new Date().toISOString(),
				customerName: testId("payout-target"),
				createdBy: staff.userId,
				branchId,
				totalAmount: amountCents,
			});
			expect(
				order?.id,
				`salesOrders/create → ${JSON.stringify(order)}`,
			).toBeTruthy();

			const split = await rpc(
				page.request,
				"commissionSplits/createManualAdjustment",
				{
					organizationId,
					staffId: staff.userId,
					amountCents,
					note: testId("payout-lifecycle-seed"),
					salesOrderId: order.id,
				},
			);
			expect(split?.id).toBeTruthy();
			// Below the RM 500 review threshold → status 'pending', approvable.
			expect(split.status).toBe("pending");
			expect(split.calculatedAmount).toBe(amountCents);
			return { orderId: order.id as string, splitId: split.id as string };
		}

		const seedA = await seedSplit(staffA, AMOUNT_A);
		// Teardown intentions (LIFO): order cancels AFTER split voids.
		cleanup.add(`sales order ${seedA.orderId} (A)`, async () => {
			// A's split ends PAID (un-voidable by design) — cancelling its order
			// could enqueue a commission reversal, so leave the order in place.
		});
		const seedB = await seedSplit(staffB, AMOUNT_B);
		cleanup.add(`sales order ${seedB.orderId} (B)`, async () => {
			await rpcRaw(page.request, "salesOrders/cancel", {
				organizationId,
				id: seedB.orderId,
				reason: "E2E teardown",
			});
		});
		cleanup.add(`commission split ${seedB.splitId} (B)`, async () => {
			await rpcRaw(page.request, "commissionSplits/void", {
				organizationId,
				id: seedB.splitId,
				reason: "E2E teardown",
			});
		});

		// ── 3. Approve both splits (pending → approved) ────────────────────────
		// Domain rule: an approval batch must contain splits for a SINGLE staff
		// member (MIXED_BATCH_STAFF) — approve per staff.
		await rpc(page.request, "commissionSplits/approve", {
			organizationId,
			ids: [seedA.splitId],
		});
		await rpc(page.request, "commissionSplits/approve", {
			organizationId,
			ids: [seedB.splitId],
		});

		// ── 4. Preview: exactly our 2 splits, full recipient coverage ──────────
		const previewRes = await preview(page.request, organizationId, [
			staffA.userId,
			staffB.userId,
		]);
		expect(previewRes.count).toBe(2);
		expect(previewRes.totalAmountCents).toBe(AMOUNT_A + AMOUNT_B);
		const previewStaff = new Set(
			previewRes.byStaff.map((s: { staffId: string }) => s.staffId),
		);
		expect(previewStaff.has(staffA.userId)).toBe(true);
		expect(previewStaff.has(staffB.userId)).toBe(true);

		// ── 5. Run the batch WITHOUT immediate confirmation ────────────────────
		const { periodStart, periodEnd } = windowBounds();
		const runRes = await rpc(page.request, "payouts/runBatch", {
			organizationId,
			staffIds: [staffA.userId, staffB.userId],
			periodStart,
			periodEnd,
			paymentMethod: "bank_transfer",
			reference: testId("payout-batch"),
			confirmImmediately: false,
		});
		expect(runRes.splitCount).toBe(2);
		expect(runRes.totalAmountCents).toBe(AMOUNT_A + AMOUNT_B);
		// Recipient coverage: one payout row PER staff member — commission
		// reaches every recipient in the batch.
		expect(runRes.payoutIds).toHaveLength(2);

		// Locate our payout rows and map them to recipients.
		const listRes = await rpc(page.request, "payouts/list", {
			organizationId,
			limit: 100,
		});
		const listRows: Array<{
			id: string;
			recipientId: string;
			amount: number;
			status: string;
		}> = Array.isArray(listRes) ? listRes : (listRes?.items ?? []);
		const ours = listRows.filter((r) => runRes.payoutIds.includes(r.id));
		expect(ours).toHaveLength(2);

		const payoutA = ours.find((r) => r.recipientId === staffA.userId);
		const payoutB = ours.find((r) => r.recipientId === staffB.userId);
		expect(payoutA, "staff A must have a payout row").toBeTruthy();
		expect(payoutB, "staff B must have a payout row").toBeTruthy();
		expect(payoutA!.amount).toBe(AMOUNT_A);
		expect(payoutB!.amount).toBe(AMOUNT_B);
		// State machine entry point: pending (NOT paid) because
		// confirmImmediately=false.
		expect(payoutA!.status).toBe("pending");
		expect(payoutB!.status).toBe("pending");

		// Safety net: if anything below throws, cancel both payouts so the seeded
		// splits are released back to 'approved' (cancel of a non-pending row is
		// a no-op failure that Cleanup logs and ignores).
		for (const p of [payoutA!, payoutB!]) {
			cleanup.add(
				`payout ${p.id} (release splits if still cancellable)`,
				async () => {
					await rpcRaw(page.request, "payouts/cancel", {
						organizationId,
						id: p.id,
						reason: "E2E teardown",
					});
				},
			);
		}

		// Splits stay 'approved' while the payout is pending → still previewable.
		const midPreview = await preview(page.request, organizationId, [
			staffA.userId,
			staffB.userId,
		]);
		expect(midPreview.count).toBe(2);

		// ── 6. markPaid recipient A → paid + splits settled ────────────────────
		const paidRow = await rpc(page.request, "payouts/markPaid", {
			organizationId,
			id: payoutA!.id,
			paymentReference: testId("wire-ref"),
		});
		expect(paidRow.status).toBe("paid");
		expect(paidRow.paidAt).toBeTruthy();

		// Ledger reconciliation: A's split left the approved pool (settled)...
		const afterPaidA = await preview(page.request, organizationId, [
			staffA.userId,
		]);
		expect(afterPaidA.count).toBe(0);
		expect(afterPaidA.totalAmountCents).toBe(0);
		// ...while B's liability is untouched.
		const afterPaidB = await preview(page.request, organizationId, [
			staffB.userId,
		]);
		expect(afterPaidB.count).toBe(1);
		expect(afterPaidB.totalAmountCents).toBe(AMOUNT_B);

		// ── 7. markFailed recipient B → failed (splits stay approved/owed) ─────
		const failedRow = await rpc(page.request, "payouts/markFailed", {
			organizationId,
			id: payoutB!.id,
			reason: "E2E bank rejection",
		});
		expect(failedRow.status).toBe("failed");

		const afterFailB = await preview(page.request, organizationId, [
			staffB.userId,
		]);
		expect(afterFailB.count).toBe(1); // liability preserved

		// Invalid transition guard: a failed row cannot be marked paid…
		await expectRejected(
			page.request,
			"payouts/markPaid",
			{
				organizationId,
				id: payoutB!.id,
				paymentReference: "should-not-apply",
			},
			[400],
		);

		// ── 8. retry the failed payout → back to pending ───────────────────────
		const retriedRow = await rpc(page.request, "payouts/retry", {
			organizationId,
			id: payoutB!.id,
		});
		expect(retriedRow.status).toBe("pending");

		// A paid row can never be retried.
		await expectRejected(
			page.request,
			"payouts/retry",
			{ organizationId, id: payoutA!.id },
			[400],
		);

		// ── 9. cancel the remaining payout → canceled + splits released ────────
		const canceledRow = await rpc(page.request, "payouts/cancel", {
			organizationId,
			id: payoutB!.id,
			reason: "E2E lifecycle cancel",
		});
		expect(canceledRow.status).toBe("canceled");

		// Cancel released B's split back to the approved pool (payoutId cleared)
		// — the liability is never silently lost.
		const afterCancelB = await preview(page.request, organizationId, [
			staffB.userId,
		]);
		expect(afterCancelB.count).toBe(1);
		expect(afterCancelB.totalAmountCents).toBe(AMOUNT_B);

		// Terminal state: a canceled payout accepts no further transitions.
		await expectRejected(
			page.request,
			"payouts/markPaid",
			{ organizationId, id: payoutB!.id, paymentReference: "nope" },
			[400],
		);

		// ── 10. Final list cross-check + UI spot check ──────────────────────────
		const finalList = await rpc(page.request, "payouts/list", {
			organizationId,
			limit: 100,
		});
		const finalRows: Array<{ id: string; status: string }> = Array.isArray(
			finalList,
		)
			? finalList
			: (finalList?.items ?? []);
		expect(finalRows.find((r) => r.id === payoutA!.id)?.status).toBe("paid");
		expect(finalRows.find((r) => r.id === payoutB!.id)?.status).toBe(
			"canceled",
		);

		// UI: the Payouts tab renders our recipients' rows without crashing.
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
		await expect(page.getByText(staffA.name).first()).toBeVisible({
			timeout: 15_000,
		});
	});
});
