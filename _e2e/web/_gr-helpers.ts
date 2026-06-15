import type { APIRequestContext } from "@playwright/test";
import { rpc, rpcRaw, testId, type Cleanup } from "./_safe-mutation";

// Shared dependency-chain builder for goods-receipts specs. Not a *.spec.ts, so
// the runner ignores it. Builds supplier → product → PO → (optional) receipt,
// registering teardown on the caller's Cleanup stack.

export type ReceiptChain = {
	branchId: string;
	supplierId: string;
	productId: string;
	poId: string;
	poItemId: string;
	poTotal: number;
	receiptId?: string;
};

async function deepestBranch(
	request: APIRequestContext,
	organizationId: string,
): Promise<string> {
	const res = await rpc(request, "hierarchy/listNodes", { organizationId });
	const nodes = Array.isArray(res) ? res : (res?.nodes ?? []);
	const branch = nodes
		.filter((n: any) => n.type === "branch")
		.sort((a: any, b: any) => (b.depth ?? 0) - (a.depth ?? 0))[0];
	return branch?.id ?? nodes[nodes.length - 1]?.id;
}

async function aUomId(
	request: APIRequestContext,
	organizationId: string,
): Promise<string> {
	const res = await rpc(request, "unitsOfMeasure/list", { organizationId });
	const list = Array.isArray(res) ? res : (res?.items ?? []);
	return list[0]?.id;
}

export function stockQty(result: any): number {
	// getProductStock returns the stock row or null; a null result is wrapped as
	// { json: null }. Treat anything without a numeric quantity as 0.
	const q = result?.quantity;
	return typeof q === "number" ? q : 0;
}

export async function buildReceiptChain(
	request: APIRequestContext,
	organizationId: string,
	cleanup: Cleanup,
	opts: {
		orderedQty?: number;
		unitCost?: number;
		received?: number;
		damaged?: number;
		makeReceipt?: boolean;
	} = {},
): Promise<ReceiptChain> {
	const {
		orderedQty = 10,
		unitCost = 100,
		received = 10,
		damaged = 0,
		makeReceipt = true,
	} = opts;

	const branchId = await deepestBranch(request, organizationId);
	const uomId = await aUomId(request, organizationId);

	const supplier = await rpc(request, "suppliers/create", {
		organizationId,
		name: testId("supplier"),
	});
	const supplierId = supplier?.id ?? supplier?.supplier?.id;
	cleanup.add(`supplier ${supplierId}`, async () => {
		await rpcRaw(request, "suppliers/update", {
			organizationId,
			id: supplierId,
			isActive: false,
		});
	});

	const product = await rpc(request, "products/create", {
		organizationId,
		sku: testId("sku"),
		name: testId("product"),
		uomId,
		price: 1000,
	});
	const productId = product?.id ?? product?.product?.id;
	cleanup.add(`product ${productId}`, async () => {
		await rpcRaw(request, "products/update", {
			organizationId,
			id: productId,
			status: "discontinued",
		});
	});

	const po = await rpc(request, "purchaseOrders/create", {
		organizationId,
		supplierId,
		branchId,
		orderDate: new Date(Date.UTC(2026, 0, 1)).toISOString(),
		items: [{ productId, orderedQty, unitCost }],
	});
	const poId = po?.id ?? po?.order?.id;
	const got = await rpc(request, "purchaseOrders/getById", {
		organizationId,
		id: poId,
	});
	const poItemId = got?.items?.[0]?.id;
	const poTotal = got?.order?.totalAmount ?? got?.items?.[0]?.totalCost ?? 0;

	const chain: ReceiptChain = {
		branchId,
		supplierId,
		productId,
		poId,
		poItemId,
		poTotal,
	};

	if (makeReceipt) {
		const receipt = await rpc(request, "goodsReceipts/create", {
			organizationId,
			purchaseOrderId: poId,
			branchId,
			receivedAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
			items: [
				{
					purchaseOrderItemId: poItemId,
					productId,
					quantityReceived: received,
					quantityDamaged: damaged,
				},
			],
		});
		chain.receiptId = receipt?.id ?? receipt?.receipt?.id;
		cleanup.add(`receipt ${chain.receiptId}`, async () => {
			// Cancel reverses the stock it added; idempotent via rpcRaw.
			await rpcRaw(request, "goodsReceipts/cancel", {
				organizationId,
				id: chain.receiptId,
			});
		});
	}

	return chain;
}
