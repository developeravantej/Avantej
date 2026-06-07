import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, getOrgId } from "../_safe-mutation";

// Cancellation-number invariant: numbers come from nextval('tenant_cancellation_seq'),
// so two cancellations produce DISTINCT, monotonically-increasing CAN-YYYYMMDD-NNNN
// numbers (no COUNT()+1 race). Exercised on two DISPOSABLE sales orders we create
// and cancel ourselves — never on pre-existing real sales.
//
// NOTE: the separate "reuse existing cancellationNumber if set" invariant is NOT
// implemented in sales-order.service.ts (cancelSalesOrder always mints a fresh
// number). It is deferred-with-finding in update-ledger.mjs, not asserted here.
test.describe("cancelled-sales — cancellation numbering", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	async function createAndCancel(
		request: any,
		organizationId: string,
		branchId: string,
	) {
		const so = await rpc(request, "salesOrders/create", {
			organizationId,
			date: new Date(Date.UTC(2026, 0, 5)).toISOString(),
			customerName: testId("cust"),
			createdBy: "E2E-DEEP",
			branchId,
			totalAmount: 1000,
			status: "completed",
		});
		const id = so?.id ?? so?.order?.id;
		expect(id, `salesOrders/create: ${JSON.stringify(so)}`).toBeTruthy();
		const cancelled = await rpc(request, "salesOrders/cancel", {
			organizationId,
			id,
			cancelledBy: "E2E-DEEP",
			refundAmount: 0,
			reason: "E2E-DEEP cancellation-number test",
		});
		return (
			cancelled?.cancellationNumber ?? cancelled?.order?.cancellationNumber
		);
	}

	test("two cancellations get distinct, monotonic CAN- numbers from the sequence", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const nodesRes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodes = Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? []);
		const branch = nodes
			.filter((n: any) => n.type === "branch")
			.sort((a: any, b: any) => (b.depth ?? 0) - (a.depth ?? 0))[0];
		test.skip(!branch?.id, "no branch node");

		const n1 = await createAndCancel(page.request, organizationId, branch.id);
		const n2 = await createAndCancel(page.request, organizationId, branch.id);

		const fmt = /^CAN-\d{8}-\d{4}$/;
		expect(n1, `n1=${n1}`).toMatch(fmt);
		expect(n2, `n2=${n2}`).toMatch(fmt);
		expect(n1).not.toBe(n2); // UNIQUE / collision-free
		// Monotonic: the sequence portion strictly increases.
		expect(Number(n2.split("-")[2])).toBeGreaterThan(Number(n1.split("-")[2]));
	});
});
