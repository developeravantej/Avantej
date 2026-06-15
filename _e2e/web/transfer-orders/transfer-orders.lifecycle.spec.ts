import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
	getUomId,
	expectRejected,
} from "../_safe-mutation";

// Deep, API-driven + API-verified, self-cleaning transfer-order tests.
//
// A transfer order requires line items with a real productId (product needs a
// uomId) and an issuedByMemberId (a members.id). The same-branch rejection rule
// is a pure zod refine and needs no DB, so it is exercised first and cheaply.
//
// Status machine (transfer-orders.service.ts):
//   create -> "pending"
//   markInTransit -> "in_transit"  (unconditional update)
//   cancel -> "cancelled"          (unconditional update)
test.describe("transfer-orders", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	// Resolve the caller's own member row id (issuedByMemberId is a members.id uuid).
	async function getSelfMemberId(
		request: import("@playwright/test").APIRequestContext,
	) {
		const organizationId = getOrgId();
		const rows = await rpc(request, "members/list", {
			organizationId,
			scope: "self",
		});
		const self = Array.isArray(rows) ? rows[0] : undefined;
		expect(self?.id, `members/list self: ${JSON.stringify(rows)}`).toBeTruthy();
		return self.id as string;
	}

	// Resolve up to two DISTINCT branch node ids (deepest first). Returns null
	// when the tenant hierarchy has fewer than two distinct nodes.
	async function getTwoDistinctBranches(
		request: import("@playwright/test").APIRequestContext,
	): Promise<{ from: string; to: string } | null> {
		const organizationId = getOrgId();
		const nodes = await rpc(request, "hierarchy/listNodes", { organizationId });
		const arr: Array<{ id?: string; nodeId?: string; depth?: number }> =
			Array.isArray(nodes) ? nodes : (nodes?.nodes ?? []);
		const ids = Array.from(
			new Set(arr.map((n) => n.id ?? n.nodeId).filter(Boolean) as string[]),
		);
		if (ids.length < 2) return null;
		// Pick deepest two by sorting on depth desc, fallback to first two.
		const sorted = [...arr]
			.filter((n) => n.id ?? n.nodeId)
			.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0));
		const from = (sorted[0]!.id ?? sorted[0]!.nodeId) as string;
		const to = ids.find((x) => x !== from)!;
		return { from, to };
	}

	test("Transfer rule — source branch equals destination branch is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);
		const issuedByMemberId = await getSelfMemberId(page.request);

		// Same fromBranchId/toBranchId fails the zod .refine() before any handler
		// logic runs. We need a syntactically valid productId (uuid) for the items
		// array; a random uuid is fine since validation rejects before any insert.
		await expectRejected(
			page.request,
			"transferOrders/create",
			{
				organizationId,
				dateIssued: new Date().toISOString(),
				fromBranchId: branchId,
				toBranchId: branchId,
				issuedByMemberId,
				items: [
					{
						productId: "00000000-0000-0000-0000-000000000001",
						quantityTransferred: 1,
					},
				],
			},
			[400],
		);
	});

	test("Transfer lifecycle — create(pending) -> markInTransit (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branches = await getTwoDistinctBranches(page.request);
		test.skip(
			branches === null,
			"tenant hierarchy has fewer than two distinct branch nodes — cannot exercise a cross-branch transfer happy path",
		);
		const issuedByMemberId = await getSelfMemberId(page.request);

		// Dependency: reuse an existing UOM -> product (line item needs a productId)
		const uomId = await getUomId(page.request);

		const product = await rpc(page.request, "products/create", {
			organizationId,
			sku: testId("sku"),
			name: testId("product"),
			uomId,
			price: 1000,
		});
		const productId = product?.id ?? product?.product?.id;
		cleanup.add(`product ${productId}`, async () => {
			await rpcRaw(page.request, "products/update", {
				organizationId,
				id: productId,
				status: "discontinued",
			});
		});

		// CREATE (pending)
		const created = await rpc(page.request, "transferOrders/create", {
			organizationId,
			dateIssued: new Date().toISOString(),
			fromBranchId: branches!.from,
			toBranchId: branches!.to,
			issuedByMemberId,
			items: [{ productId, quantityTransferred: 1 }],
		});
		const id = created?.id ?? created?.order?.id;
		expect(
			id,
			`transfer create returned: ${JSON.stringify(created)}`,
		).toBeTruthy();
		// Teardown: cancel the transfer (no stock has moved at pending/in_transit).
		cleanup.add(`transfer-order ${id}`, async () => {
			await rpcRaw(page.request, "transferOrders/cancel", {
				organizationId,
				id,
			});
		});
		expect(created?.status).toBe("pending");

		// markInTransit (pending -> in_transit), then re-query to assert.
		await rpc(page.request, "transferOrders/markInTransit", {
			organizationId,
			id,
		});
		const got = await rpc(page.request, "transferOrders/getById", {
			organizationId,
			id,
		});
		expect(got?.status).toBe("in_transit");
	});
});
