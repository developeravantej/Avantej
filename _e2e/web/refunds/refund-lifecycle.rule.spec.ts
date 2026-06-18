import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	getOrgId,
	expectRejected,
} from "../_safe-mutation";

// Refund state machine — API-driven + API-verified. Refunds do NOT call Stripe
// (processing only writes payment rows), so the full request→approve→process and
// request→reject flows are exercisable against DISPOSABLE sales orders we create.
test.describe("refunds — state machine + invariants", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	async function disposableOrder(
		request: any,
		organizationId: string,
		total = 10000,
	) {
		const nodesRes = await rpc(request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodes = Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? []);
		const branch = nodes
			.filter((n: any) => n.type === "branch")
			.sort((a: any, b: any) => (b.depth ?? 0) - (a.depth ?? 0))[0];
		// A real customer so the refund can auto-derive customerId/customerName.
		const dir = await rpc(request, "customerDirectory/list", {
			organizationId,
			limit: 1,
		});
		const customer = (
			Array.isArray(dir) ? dir : (dir?.rows ?? dir?.items ?? [])
		)[0];
		const so = await rpc(request, "salesOrders/create", {
			organizationId,
			date: new Date(Date.UTC(2026, 0, 5)).toISOString(),
			customerId: customer?.userId,
			customerName: customer?.name ?? testId("cust"),
			createdBy: "E2E-DEEP",
			branchId: branch.id,
			totalAmount: total,
			status: "completed",
		});
		return so?.id ?? so?.order?.id;
	}

	const statusOf = (r: any) => r?.status ?? r?.refund?.status;
	const idOf = (r: any) => r?.id ?? r?.refund?.id;

	test("request → approve → process walks pending → approved → processed", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const salesOrderId = await disposableOrder(
			page.request,
			organizationId,
			10000,
		);
		expect(salesOrderId).toBeTruthy();

		const requested = await rpc(page.request, "refunds/request", {
			organizationId,
			salesOrderId,
			amountCents: 3000,
			reason: "E2E-DEEP refund lifecycle",
		});
		const id = idOf(requested);
		expect(id, `request: ${JSON.stringify(requested)}`).toBeTruthy();
		expect(statusOf(requested)).toBe("pending");

		const approved = await rpc(page.request, "refunds/approve", {
			organizationId,
			id,
		});
		expect(statusOf(approved)).toBe("approved");

		const processed = await rpc(page.request, "refunds/process", {
			organizationId,
			id,
			refundMethod: "cash",
			refundReference: "E2E-DEEP-ref",
		});
		expect(statusOf(processed)).toBe("processed");
	});

	test("request → reject moves a pending refund to rejected", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const salesOrderId = await disposableOrder(
			page.request,
			organizationId,
			10000,
		);
		const requested = await rpc(page.request, "refunds/request", {
			organizationId,
			salesOrderId,
			amountCents: 2000,
			reason: "E2E-DEEP refund reject",
		});
		const id = idOf(requested);
		expect(statusOf(requested)).toBe("pending");

		const rejected = await rpc(page.request, "refunds/reject", {
			organizationId,
			id,
			reviewNotes: "E2E-DEEP rejected",
		});
		expect(statusOf(rejected)).toBe("rejected");

		// A non-pending refund can no longer be approved.
		await expectRejected(
			page.request,
			"refunds/approve",
			{ organizationId, id },
			[400],
		);
	});

	test("a refund cannot exceed the remaining-refundable amount", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const total = 5000;
		const salesOrderId = await disposableOrder(
			page.request,
			organizationId,
			total,
		);

		// Request more than the order total → BAD_REQUEST (exceeds remaining).
		await expectRejected(
			page.request,
			"refunds/request",
			{
				organizationId,
				salesOrderId,
				amountCents: total + 100000,
				reason: "E2E-DEEP over-refund",
			},
			[400],
		);
	});
});
