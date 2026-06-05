import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
	getUomId,
} from "../_safe-mutation";

// Deep, API-driven + API-verified, self-cleaning stock-request lifecycle.
//
// A stock request requires line items with a real productId (product needs a
// uomId) and an issuedByMemberId (members.id). toBranchId is the destination.
//
// Status machine (stock-requests.service.ts):
//   create -> "pending"
//   approve -> "approved"   (unconditional update)
//   reject  -> "rejected"   (unconditional update — used as soft teardown since
//                            there is no delete/cancel procedure on this router)
test.describe("stock-requests", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Stock request lifecycle — create(pending) -> approve (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// Resolve caller's own member id for issuedByMemberId (members.id uuid).
		const selfRows = await rpc(page.request, "members/list", {
			organizationId,
			scope: "self",
		});
		const issuedByMemberId = Array.isArray(selfRows)
			? selfRows[0]?.id
			: undefined;
		expect(
			issuedByMemberId,
			`members/list self: ${JSON.stringify(selfRows)}`,
		).toBeTruthy();

		// Dependency: reuse an existing UOM -> product
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
		const created = await rpc(page.request, "stockRequests/create", {
			organizationId,
			dateIssued: new Date().toISOString(),
			issuedByMemberId,
			toBranchId: branchId,
			items: [{ productId, quantityRequested: 3 }],
		});
		const id = created?.id ?? created?.request?.id;
		expect(
			id,
			`stock request create returned: ${JSON.stringify(created)}`,
		).toBeTruthy();
		// Teardown: reject the request (no stock moves on reject).
		cleanup.add(`stock-request ${id}`, async () => {
			await rpcRaw(page.request, "stockRequests/reject", {
				organizationId,
				id,
			});
		});
		expect(created?.status).toBe("pending");

		// APPROVE (pending -> approved), then re-query to assert the transition.
		await rpc(page.request, "stockRequests/approve", { organizationId, id });
		const got = await rpc(page.request, "stockRequests/getById", {
			organizationId,
			id,
		});
		expect(got?.status).toBe("approved");
	});
});
