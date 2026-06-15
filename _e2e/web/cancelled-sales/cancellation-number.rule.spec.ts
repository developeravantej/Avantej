import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, getOrgId } from "../_safe-mutation";

// Cancellation-number invariants:
//  (1) numbers come from nextval('tenant_cancellation_seq'), so two cancellations
//      produce DISTINCT, monotonically-increasing CAN-YYYYMMDD-NNNN numbers
//      (no COUNT()+1 race);
//  (2) re-cancelling an order REUSES its existing cancellationNumber — an order
//      never gets two numbers.
// Exercised on DISPOSABLE sales orders we create and cancel ourselves — never on
// pre-existing real sales.
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

	test("re-cancelling an order reuses its existing cancellation number (never two)", async ({
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

		// Create one disposable order.
		const so = await rpc(page.request, "salesOrders/create", {
			organizationId,
			date: new Date(Date.UTC(2026, 0, 5)).toISOString(),
			customerName: testId("cust"),
			createdBy: "E2E-DEEP",
			branchId: branch.id,
			totalAmount: 1000,
			status: "completed",
		});
		const id = so?.id ?? so?.order?.id;
		expect(id, `create: ${JSON.stringify(so)}`).toBeTruthy();

		const cancelOnce = async () => {
			const c = await rpc(page.request, "salesOrders/cancel", {
				organizationId,
				id,
				cancelledBy: "E2E-DEEP",
				refundAmount: 0,
				reason: "E2E-DEEP reuse test",
			});
			return c?.cancellationNumber ?? c?.order?.cancellationNumber;
		};

		const first = await cancelOnce();
		const second = await cancelOnce();
		expect(first, `first=${first}`).toMatch(/^CAN-\d{8}-\d{4}$/);
		// Re-cancel must REUSE the same number, not mint a second one.
		expect(second).toBe(first);
	});
});
