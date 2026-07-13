import { test, expect } from "@playwright/test";
import { rpc, getOrgId, getBranchId, testId } from "../_safe-mutation";

/**
 * AVANTEJ-9 regression — "Net Collected goes negative after a full refund".
 *
 * Root cause: processRefund flipped the sales order to status='cancelled' on a
 * FULL refund. The Sales KPI excludes 'cancelled' orders from revenue / count /
 * collected while still summing refunded_amount_cents, so a fully-refunded sale
 * vanished from revenue AND was subtracted again as a refund (double-count):
 *   Net Collected = 0 − 12,240 = −12,240,  Revenue = RM 0,  0 transactions.
 *
 * Fix: a refund is no longer a cancellation — order.status is left untouched and
 * the refund is tracked via refund_status='processed' + refunded_amount_cents.
 *
 * This spec drives the real oRPC boundary on a DISPOSABLE, test-prefixed sale we
 * create and fully refund ourselves — never a pre-existing real sale. Assertions
 * are delta-based so they are immune to other tenant data:
 *
 *  1. after a full refund the order stays non-cancelled (status unchanged,
 *     refund_status='processed', refunded_amount_cents=total);
 *  2. KPI revenue and transaction count are UNCHANGED by the refund (before the
 *     fix they dropped — the sale disappeared);
 *  3. the refund is subtracted EXACTLY ONCE: (revenue − refunded) falls by the
 *     refund amount, not 2× it (the double-count that drove Net Collected
 *     negative).
 */
test.describe("sales — AVANTEJ-9 full refund must not double-count / cancel", () => {
	test("full refund keeps the sale in revenue and is subtracted once", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);
		test.skip(!branchId, "no branch node");

		const TOTAL = 12_240; // mirror the ticket (RM 7,200 + RM 5,040)
		const customerName = testId("cust");
		const customerId = testId("customer"); // refund derives customerId from the order

		// A confirmed sale dated in the current month so the "month" KPI includes it.
		const created = await rpc(page.request, "salesOrders/create", {
			organizationId,
			date: new Date().toISOString(),
			customerId,
			customerName,
			createdBy: "E2E-DEEP",
			branchId,
			totalAmount: TOTAL,
			status: "confirmed",
		});
		const orderId = created?.id ?? created?.order?.id;
		expect(orderId, `create: ${JSON.stringify(created)}`).toBeTruthy();

		const kpi = () =>
			rpc(page.request, "salesOrders/kpiSummary", {
				organizationId,
				branchId,
				period: "month",
			});

		// Baseline already includes the confirmed sale above.
		const before = await kpi();

		// Full refund lifecycle: request -> approve -> process.
		const requested = await rpc(page.request, "refunds/request", {
			organizationId,
			salesOrderId: orderId,
			amountCents: TOTAL,
			reason: "E2E-DEEP AVANTEJ-9 full refund",
			customerName,
			branchId,
		});
		const refundId = requested?.id;
		expect(refundId, `request: ${JSON.stringify(requested)}`).toBeTruthy();

		await rpc(page.request, "refunds/approve", {
			organizationId,
			id: refundId,
		});
		await rpc(page.request, "refunds/process", {
			organizationId,
			id: refundId,
			refundMethod: "cash",
			refundReference: "E2E-DEEP-CASH",
		});

		// (1) The order must NOT have become 'cancelled' — the root cause.
		const order = await rpc(page.request, "salesOrders/getById", {
			organizationId,
			id: orderId,
		});
		const row = order?.order ?? order;
		expect(
			row?.status,
			`order status after full refund: ${row?.status}`,
		).not.toBe("cancelled");
		expect(row?.refundStatus).toBe("processed");
		expect(row?.refundedAmountCents ?? row?.cancelledAmount).toBe(TOTAL);

		const after = await kpi();

		// (2) Revenue and transaction count are retained (the sale still counts).
		//     Before the fix these dropped by TOTAL / by 1 respectively.
		expect(after.totalSalesCents).toBe(before.totalSalesCents);
		expect(after.salesCount).toBe(before.salesCount);

		// (3) The refund is counted exactly once.
		expect(after.totalRefundedCents).toBe(before.totalRefundedCents + TOTAL);

		// (3b) Net of revenue vs refunds falls by EXACTLY the refund, not 2×.
		//      before fix: revenue−TOTAL and refunded+TOTAL => net drops by 2×TOTAL.
		const netBefore = before.totalSalesCents - before.totalRefundedCents;
		const netAfter = after.totalSalesCents - after.totalRefundedCents;
		expect(netAfter).toBe(netBefore - TOTAL);

		// Best-effort visual proof: load the real Sales Overview and screenshot the
		// KPI tiles in the fixed state. Wrapped so a flaky dashboard load never fails
		// the (already-proven) assertions above.
		try {
			await page.addInitScript((oid) => {
				localStorage.setItem("current_organization_id", oid);
			}, organizationId);
			await page.goto("/dashboard/sales/view", {
				waitUntil: "domcontentloaded",
			});
			await page
				.locator('[data-testid="sales-kpi-strip"]')
				.waitFor({ state: "visible", timeout: 20_000 });
			// Let the KPI numbers settle, then capture.
			await page.locator('[data-testid="sales-kpi-confirmed"]').waitFor({
				state: "visible",
				timeout: 10_000,
			});
			await page.waitForTimeout(1_500);
			await page.screenshot({
				path: "_e2e/results/avantej9-artifacts/sales-overview-kpi.png",
				fullPage: false,
			});
		} catch (err) {
			console.warn(
				`[avantej-9] visual capture skipped (assertions already passed): ${err}`,
			);
		}
	});
});
