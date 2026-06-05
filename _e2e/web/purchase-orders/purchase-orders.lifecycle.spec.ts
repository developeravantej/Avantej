import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
	expectRejected,
} from "../_safe-mutation";

// Deep, API-driven + API-verified, self-cleaning purchase-order lifecycle.
//
// A purchase order needs a supplier + line items, and each line item needs a
// real productId. A product in turn needs a uomId. So the test stands up the
// full dependency chain (uom -> product -> supplier) as throwaway rows and
// tears everything down in reverse order in afterEach.
//
// Status machine (purchase-orders.service.ts):
//   create -> "draft"
//   approve: only "draft" -> "approved"  (else throws -> BAD_REQUEST 400)
//   cancel:  "draft" | "approved" -> "cancelled"
test.describe("purchase-orders", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("PO lifecycle — create(draft) -> approve -> cancel (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// Dependency: UOM (product requires a uomId)
		const uom = await rpc(page.request, "unitsOfMeasure/create", {
			organizationId,
			name: testId("uom"),
		});
		const uomId = uom?.id ?? uom?.uom?.id;
		expect(uomId, `uom create: ${JSON.stringify(uom)}`).toBeTruthy();
		cleanup.add(`uom ${uomId}`, async () => {
			await rpcRaw(page.request, "unitsOfMeasure/delete", {
				organizationId,
				id: uomId,
			});
		});

		// Dependency: product (PO line item requires a productId)
		const product = await rpc(page.request, "products/create", {
			organizationId,
			sku: testId("sku"),
			name: testId("product"),
			uomId,
			price: 1500,
		});
		const productId = product?.id ?? product?.product?.id;
		expect(
			productId,
			`product create: ${JSON.stringify(product)}`,
		).toBeTruthy();
		cleanup.add(`product ${productId}`, async () => {
			await rpcRaw(page.request, "products/update", {
				organizationId,
				id: productId,
				status: "discontinued",
			});
		});

		// Dependency: supplier
		const supplier = await rpc(page.request, "suppliers/create", {
			organizationId,
			name: testId("supplier"),
		});
		const supplierId = supplier?.id ?? supplier?.supplier?.id;
		expect(
			supplierId,
			`supplier create: ${JSON.stringify(supplier)}`,
		).toBeTruthy();
		cleanup.add(`supplier ${supplierId}`, async () => {
			await rpcRaw(page.request, "suppliers/deactivate", {
				organizationId,
				id: supplierId,
			});
		});

		// CREATE (draft)
		const created = await rpc(page.request, "purchaseOrders/create", {
			organizationId,
			supplierId,
			branchId,
			orderDate: new Date().toISOString(),
			items: [{ productId, orderedQty: 2, unitCost: 1500 }],
		});
		const id = created?.id ?? created?.order?.id;
		expect(id, `PO create returned: ${JSON.stringify(created)}`).toBeTruthy();
		// Register teardown immediately: cancel covers both draft and approved.
		cleanup.add(`purchase-order ${id}`, async () => {
			await rpcRaw(page.request, "purchaseOrders/cancel", {
				organizationId,
				id,
			});
		});
		expect(created?.status).toBe("draft");

		// APPROVE (draft -> approved) and re-query to assert the transition.
		await rpc(page.request, "purchaseOrders/approve", { organizationId, id });
		const afterApprove = await rpc(page.request, "purchaseOrders/getById", {
			organizationId,
			id,
		});
		expect(afterApprove?.order?.status).toBe("approved");

		// CANCEL (approved -> cancelled) and re-query to assert the transition.
		await rpc(page.request, "purchaseOrders/cancel", { organizationId, id });
		const afterCancel = await rpc(page.request, "purchaseOrders/getById", {
			organizationId,
			id,
		});
		expect(afterCancel?.order?.status).toBe("cancelled");
	});

	test("PO rule — approving a non-draft PO is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		const uom = await rpc(page.request, "unitsOfMeasure/create", {
			organizationId,
			name: testId("uom"),
		});
		const uomId = uom?.id ?? uom?.uom?.id;
		cleanup.add(`uom ${uomId}`, async () => {
			await rpcRaw(page.request, "unitsOfMeasure/delete", {
				organizationId,
				id: uomId,
			});
		});

		const product = await rpc(page.request, "products/create", {
			organizationId,
			sku: testId("sku"),
			name: testId("product"),
			uomId,
			price: 1500,
		});
		const productId = product?.id ?? product?.product?.id;
		cleanup.add(`product ${productId}`, async () => {
			await rpcRaw(page.request, "products/update", {
				organizationId,
				id: productId,
				status: "discontinued",
			});
		});

		const supplier = await rpc(page.request, "suppliers/create", {
			organizationId,
			name: testId("supplier"),
		});
		const supplierId = supplier?.id ?? supplier?.supplier?.id;
		cleanup.add(`supplier ${supplierId}`, async () => {
			await rpcRaw(page.request, "suppliers/deactivate", {
				organizationId,
				id: supplierId,
			});
		});

		const created = await rpc(page.request, "purchaseOrders/create", {
			organizationId,
			supplierId,
			branchId,
			orderDate: new Date().toISOString(),
			items: [{ productId, orderedQty: 1, unitCost: 500 }],
		});
		const id = created?.id ?? created?.order?.id;
		expect(id, `PO create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`purchase-order ${id}`, async () => {
			await rpcRaw(page.request, "purchaseOrders/cancel", {
				organizationId,
				id,
			});
		});

		// First approval moves draft -> approved.
		await rpc(page.request, "purchaseOrders/approve", { organizationId, id });

		// Second approval on a now-approved PO must be rejected (service throws
		// "Only draft purchase orders can be approved" -> mapped to BAD_REQUEST).
		await expectRejected(
			page.request,
			"purchaseOrders/approve",
			{ organizationId, id },
			[400],
		);
	});
});
