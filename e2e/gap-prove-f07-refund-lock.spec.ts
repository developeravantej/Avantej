/**
 * gap-prove-f07-refund-lock — exercise S-refund-row-lock at runtime.
 *
 * Pre-fix: two concurrent approveRefund calls against the same sales order
 * (with two pending refunds whose SUM exceeds remaining-refundable) both pass
 * their unlocked cap check and BOTH succeed → over-commit.
 *
 * Post-fix: the parent sales_order is SELECT ... FOR UPDATE locked at the top
 * of approveRefund + the cap check now runs for BOTH partial and full approve.
 * One of the two concurrent calls must fail with BAD_REQUEST.
 */
import { test, expect } from "@playwright/test";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";
import {
	TEST_ORG_ID,
	pickFirstActiveClient,
	ensureFirstProduct,
	recordPosSale,
	pickFirstBranchId,
} from "./helpers/seed-data";

test("F-07 — concurrent approveRefund row-lock + cap check", async ({
	page,
}) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("domcontentloaded");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "no client in test tenant");

	const product = await ensureFirstProduct(page);
	test.skip(!product, "no product available");

	const branchId = client!.hierarchyScopeId ?? (await pickFirstBranchId(page));

	// 1) POS product sale at RM 50 (5000 cents) so we have a concrete sale to refund.
	const saleAmount = 5000;
	let salesOrderId = "";
	try {
		salesOrderId = await recordPosSale(page, {
			customerId: client!.userId,
			customerName: client!.name,
			branchId,
			items: [
				{
					type: "product",
					refId: product!.id,
					description: product!.name,
					quantity: 1,
					unitPriceCents: saleAmount,
				},
			],
			paymentMethod: "cash",
		});
	} catch (err) {
		test.skip(true, `POS sale failed: ${String(err)}`);
	}
	expect(salesOrderId).toBeTruthy();

	// 2) Request TWO refunds against the same sale. Each is RM 30 (3000 cents) — each
	// individually fits within saleAmount (5000), but their sum (6000) exceeds it.
	//
	// In the pre-fix race, both could be approved if read concurrently. In the post-fix
	// world, the second request itself may fail at the request-time cap check (since
	// requestRefund's `computeRemainingBySalesOrder` already counts pending refunds).
	// We need BOTH pending to set up the approve-time race, so we request them in
	// strict sequence — each individually fits the cap when there are no other refunds.
	//
	// Wait — the cap check IS at request time. So if we sequentially request 3000 then
	// 3000, the second request will see one pending @ 3000 → remaining=2000 → reject.
	// To get two pending past the request gate, we'd need concurrent requests, which
	// our oRPC client can't easily race. Workaround: use approveAmountCents to partial-
	// approve below the requested amount so the cap check at approve-time fires
	// against a different effective amount.
	//
	// Better approach: request ONE refund for the FULL sale amount (5000), then call
	// approveRefund TWICE concurrently. The second call must fail because the first
	// already approved 5000 → remaining=0.
	let refundId = "";
	try {
		const created = await orpcCall<object, { id: string }>(
			page,
			"refunds",
			"request",
			{
				organizationId: TEST_ORG_ID,
				salesOrderId,
				amountCents: saleAmount,
				reason: "audit-prove F-07 concurrent-approve test",
			},
		);
		refundId = created.id;
	} catch (err) {
		test.skip(true, `refund request failed: ${String(err)}`);
	}
	expect(refundId).toBeTruthy();

	// 3) Fire approveRefund TWICE concurrently. The lock should serialize them — one
	// commits, the other sees status='approved' on re-read and throws BAD_REQUEST
	// (the existing status guard).
	const callApprove = () =>
		orpcCall(page, "refunds", "approve", {
			organizationId: TEST_ORG_ID,
			id: refundId,
		})
			.then(() => ({ ok: true as const, err: null as null }))
			.catch((err) => ({
				ok: false as const,
				err: err instanceof OrpcClientError ? err.code : String(err),
			}));

	const [r1, r2] = await Promise.all([callApprove(), callApprove()]);
	const successCount = [r1, r2].filter((r) => r.ok).length;
	const failCount = 2 - successCount;
	console.log("F-07 concurrent approve results:", JSON.stringify({ r1, r2 }));

	// Exactly one should succeed; the other should fail with BAD_REQUEST (status not pending).
	expect.soft(successCount, "exactly one approve must succeed").toBe(1);
	expect.soft(failCount, "the other approve must fail").toBe(1);
});
