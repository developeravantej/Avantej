/**
 * Journey suite: Inventory & Procurement.
 * Suite: Inventory & Procurement · Actor: tenant-admin
 *
 * Routers in scope: products, brands, productCategories, suppliers,
 * unitsOfMeasure, stockRequests, transferOrders, purchaseOrders, goodsReceipts.
 *
 * Each journey seeds + asserts state deterministically via oRPC, then opens the
 * relevant /dashboard page with a tolerant UI assertion so the recorded video
 * shows the end-user-visible result.
 *
 * Stock note: `product_stock.branch_id` is an FK to `hierarchy_nodes(id)`
 * (ON DELETE restrict), so every branchId used here MUST be a real hierarchy
 * node id resolved from `hierarchy.listNodes` — never a synthetic uuid.
 */
import { test, expect } from "@playwright/test";
import { ensureJourneyFixtures } from "../helpers/seed-journey-fixtures";
import { TEST_ORG_ID, ensureFirstProduct } from "../helpers/seed-data";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";

// ─── Local helpers (read-only pickers over oRPC) ────────────────────────────

interface BranchNode {
	id: string;
	name: string;
	type?: string;
}

/**
 * Resolve real branch (leaf) hierarchy nodes for the test tenant. Prefers nodes
 * of type "branch"/"location"; falls back to whatever nodes exist so the FK on
 * product_stock.branch_id is always satisfied.
 */
async function listBranchNodes(
	page: import("@playwright/test").Page,
): Promise<BranchNode[]> {
	try {
		const result = await orpcCall<object, { nodes: BranchNode[] }>(
			page,
			"hierarchy",
			"listNodes",
			{
				organizationId: TEST_ORG_ID,
			},
		);
		const nodes = result?.nodes ?? [];
		const leaves = nodes.filter(
			(n) => n.type === "branch" || n.type === "location",
		);
		return leaves.length > 0 ? leaves : nodes;
	} catch {
		return [];
	}
}

/** Resolve a valid `members.id` to use as issuedByMemberId (prefers an admin). */
async function pickAnyMemberId(
	page: import("@playwright/test").Page,
): Promise<string | null> {
	type MemberRow = { id: string; role?: string };
	for (const role of ["admin", undefined] as const) {
		try {
			const rows = await orpcCall<object, MemberRow[]>(
				page,
				"members",
				"list",
				{
					organizationId: TEST_ORG_ID,
					status: "active",
					...(role ? { role } : {}),
				},
			);
			if (rows[0]?.id) return rows[0].id;
		} catch {
			// try next strategy
		}
	}
	return null;
}

/** Create a fresh active product (unique SKU per run) and return its id + name. */
async function createTestProduct(
	page: import("@playwright/test").Page,
	uomId: string,
	label: string,
): Promise<{ id: string; name: string }> {
	const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
	type Created = { id: string; name?: string };
	const created = await orpcCall<object, Created>(page, "products", "create", {
		organizationId: TEST_ORG_ID,
		sku: `E2E-${label}-${suffix}`,
		name: `E2E ${label} ${suffix}`,
		uomId,
		price: 5000,
		status: "active",
	});
	return { id: created.id, name: created.name ?? `E2E ${label}` };
}

/** Resolve a UOM id (creates one if the tenant has none). */
async function resolveUomId(
	page: import("@playwright/test").Page,
): Promise<string | null> {
	type UomRow = { id: string };
	try {
		const rows = await orpcCall<object, UomRow[]>(
			page,
			"unitsOfMeasure",
			"list",
			{
				organizationId: TEST_ORG_ID,
			},
		);
		if (rows[0]?.id) return rows[0].id;
	} catch {
		// fall through to create
	}
	try {
		const created = await orpcCall<object, { id: string }>(
			page,
			"unitsOfMeasure",
			"create",
			{
				organizationId: TEST_ORG_ID,
				name: `E2E-UOM-${Date.now()}`,
			},
		);
		return created.id;
	} catch {
		return null;
	}
}

/** Resolve a supplier id (creates one if the tenant has none). */
async function resolveSupplierId(
	page: import("@playwright/test").Page,
): Promise<string | null> {
	type SupplierRow = { id: string };
	try {
		const rows = await orpcCall<object, SupplierRow[]>(
			page,
			"suppliers",
			"list",
			{
				organizationId: TEST_ORG_ID,
				isActive: true,
			},
		);
		if (rows[0]?.id) return rows[0].id;
	} catch {
		// fall through to create
	}
	try {
		const created = await orpcCall<object, { id: string }>(
			page,
			"suppliers",
			"create",
			{
				organizationId: TEST_ORG_ID,
				name: `E2E Supplier ${Date.now()}`,
				isActive: true,
			},
		);
		return created.id;
	} catch {
		return null;
	}
}

// ─── P0: products.create → adjustStock → getStock reflects new level ─────────

test("Admin adjusts product stock and the new level is reflected", {
	tag: ["@p0"],
}, async ({ page }) => {
	let productId = "";
	let branchId = "";

	await test.step("Resolve a UOM and a real branch node", async () => {
		const uomId = await resolveUomId(page);
		expect(uomId, "a UOM must exist or be creatable").toBeTruthy();

		const branches = await listBranchNodes(page);
		test.skip(
			branches.length === 0,
			"no hierarchy node exists — cannot satisfy product_stock FK",
		);
		branchId = branches[0]!.id;

		await test.step("Create a fresh active product", async () => {
			const product = await createTestProduct(page, uomId!, "STOCK");
			productId = product.id;
			expect(productId, "product must be created").toBeTruthy();
		});
	});

	let baseline = 0;
	await test.step("Read the baseline stock level at the branch", async () => {
		type Stock = { quantity: number } | null;
		const stock = await orpcCall<object, Stock>(page, "products", "getStock", {
			organizationId: TEST_ORG_ID,
			productId,
			branchId,
		});
		baseline = stock?.quantity ?? 0;
	});

	const DELTA = 25;
	await test.step("Adjust stock up by 25 units", async () => {
		type Stock = { quantity: number };
		const result = await orpcCall<object, Stock>(
			page,
			"products",
			"adjustStock",
			{
				organizationId: TEST_ORG_ID,
				productId,
				branchId,
				delta: DELTA,
			},
		);
		expect(result.quantity).toBe(baseline + DELTA);
	});

	await test.step("getStock reflects the new level", async () => {
		type Stock = { quantity: number } | null;
		const stock = await orpcCall<object, Stock>(page, "products", "getStock", {
			organizationId: TEST_ORG_ID,
			productId,
			branchId,
		});
		expect(stock?.quantity).toBe(baseline + DELTA);
	});

	await test.step("Open the Products catalog page", async () => {
		await page.goto("/dashboard/products/view");
		await expect(page).toHaveURL(/\/dashboard\/products\/view/);
		await page.waitForTimeout(1200);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});
});

// ─── P0: purchaseOrders.create → approve → goods receipt → stock increases ───

test("Admin approves a purchase order and receiving goods increases stock", {
	tag: ["@p0"],
}, async ({ page }) => {
	let supplierId = "";
	let branchId = "";
	let productId = "";
	let poId = "";
	let poItemId = "";
	let receiptId = "";
	const ORDER_QTY = 12;

	await test.step("Resolve supplier, branch, and a product", async () => {
		supplierId = (await resolveSupplierId(page)) ?? "";
		expect(supplierId, "a supplier must exist or be creatable").toBeTruthy();

		const branches = await listBranchNodes(page);
		test.skip(
			branches.length === 0,
			"no hierarchy node exists — cannot satisfy product_stock FK",
		);
		branchId = branches[0]!.id;

		const uomId = await resolveUomId(page);
		expect(uomId, "a UOM must exist or be creatable").toBeTruthy();
		const product = await createTestProduct(page, uomId!, "PO");
		productId = product.id;
	});

	await test.step("Create a draft purchase order for 12 units", async () => {
		type PoHeader = { id: string; status: string };
		const po = await orpcCall<object, PoHeader>(
			page,
			"purchaseOrders",
			"create",
			{
				organizationId: TEST_ORG_ID,
				supplierId,
				branchId,
				orderDate: new Date().toISOString(),
				notes: "E2E purchase order",
				items: [{ productId, orderedQty: ORDER_QTY, unitCost: 4000 }],
			},
		);
		poId = po.id;
		expect(poId, "PO must be created").toBeTruthy();
		expect(po.status).toBe("draft");
	});

	await test.step("Resolve the PO line-item id via getById", async () => {
		type PoDetail = {
			order: { id: string };
			items: Array<{ id: string; productId: string }>;
		};
		const detail = await orpcCall<object, PoDetail>(
			page,
			"purchaseOrders",
			"getById",
			{
				organizationId: TEST_ORG_ID,
				id: poId,
			},
		);
		const line =
			detail.items.find((i) => i.productId === productId) ?? detail.items[0];
		poItemId = line!.id;
		expect(poItemId, "PO line item must exist").toBeTruthy();
	});

	await test.step("Approve the purchase order", async () => {
		type PoHeader = { id: string; status: string };
		const approved = await orpcCall<object, PoHeader>(
			page,
			"purchaseOrders",
			"approve",
			{
				organizationId: TEST_ORG_ID,
				id: poId,
			},
		);
		expect(approved.status).toBe("approved");
	});

	let baseline = 0;
	await test.step("Read the baseline stock at the receiving branch", async () => {
		type Stock = { quantity: number } | null;
		const stock = await orpcCall<object, Stock>(page, "products", "getStock", {
			organizationId: TEST_ORG_ID,
			productId,
			branchId,
		});
		baseline = stock?.quantity ?? 0;
	});

	await test.step("Receive all 12 units via a goods receipt (posts to stock)", async () => {
		type Receipt = { id: string; status: string };
		const receipt = await orpcCall<object, Receipt>(
			page,
			"goodsReceipts",
			"create",
			{
				organizationId: TEST_ORG_ID,
				purchaseOrderId: poId,
				branchId,
				receivedAt: new Date().toISOString(),
				notes: "E2E goods receipt",
				items: [
					{
						purchaseOrderItemId: poItemId,
						productId,
						quantityReceived: ORDER_QTY,
					},
				],
			},
		);
		receiptId = receipt.id;
		expect(receiptId, "goods receipt must be created").toBeTruthy();
		expect(receipt.status).toBe("posted");
	});

	await test.step("Stock increased by the received quantity", async () => {
		type Stock = { quantity: number } | null;
		const stock = await orpcCall<object, Stock>(page, "products", "getStock", {
			organizationId: TEST_ORG_ID,
			productId,
			branchId,
		});
		expect(stock?.quantity).toBe(baseline + ORDER_QTY);
	});

	await test.step("PO rolled to received after full receipt", async () => {
		type PoDetail = { order: { status: string } };
		const detail = await orpcCall<object, PoDetail>(
			page,
			"purchaseOrders",
			"getById",
			{
				organizationId: TEST_ORG_ID,
				id: poId,
			},
		);
		expect(detail.order.status).toBe("received");
	});

	await test.step("Open the Purchase Orders page", async () => {
		await page.goto("/dashboard/purchase-orders/view");
		await expect(page).toHaveURL(/\/dashboard\/purchase-orders\/view/);
		await expect(
			page.getByRole("heading", { name: /purchase orders/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(800);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — cancel the posted goods receipt (reverses stock)", async () => {
		if (!receiptId) return;
		try {
			await orpcCall(page, "goodsReceipts", "cancel", {
				organizationId: TEST_ORG_ID,
				id: receiptId,
			});
		} catch (err) {
			if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
			// best-effort cleanup — swallow
		}
	});
});

// ─── P1: transferOrders.create → markInTransit → complete ────────────────────

test("Admin moves stock between branches via a transfer order", {
	tag: ["@p1"],
}, async ({ page }) => {
	let fromBranchId = "";
	let toBranchId = "";
	let productId = "";
	let issuedByMemberId = "";
	let transferId = "";
	let transferItemId = "";
	let completed = false;
	const QTY = 5;

	await test.step("Resolve two branches, a member, and a product", async () => {
		const branches = await listBranchNodes(page);
		test.skip(
			branches.length === 0,
			"no hierarchy node exists — cannot run transfer journey",
		);
		fromBranchId = branches[0]!.id;
		// Use a distinct destination branch when available; otherwise reuse the
		// source (no from≠to DB constraint — the lifecycle still exercises).
		toBranchId = branches[1]?.id ?? branches[0]!.id;

		issuedByMemberId = (await pickAnyMemberId(page)) ?? "";
		test.skip(
			!issuedByMemberId,
			"no member exists to attribute the transfer to",
		);

		const uomId = await resolveUomId(page);
		expect(uomId, "a UOM must exist or be creatable").toBeTruthy();
		const product = await createTestProduct(page, uomId!, "TO");
		productId = product.id;
	});

	await test.step("Seed source-branch stock so the transfer has units to move", async () => {
		await orpcCall(page, "products", "adjustStock", {
			organizationId: TEST_ORG_ID,
			productId,
			branchId: fromBranchId,
			delta: 50,
		});
	});

	await test.step("Create a pending transfer order for 5 units", async () => {
		type Transfer = {
			id: string;
			status: string;
			items: Array<{ id: string; productId: string }>;
		};
		const transfer = await orpcCall<object, Transfer>(
			page,
			"transferOrders",
			"create",
			{
				organizationId: TEST_ORG_ID,
				dateIssued: new Date().toISOString(),
				fromBranchId,
				toBranchId,
				issuedByMemberId,
				notes: "E2E transfer order",
				items: [{ productId, quantityTransferred: QTY }],
			},
		);
		transferId = transfer.id;
		transferItemId = transfer.items[0]!.id;
		expect(transferId, "transfer must be created").toBeTruthy();
		expect(transfer.status).toBe("pending");
	});

	await test.step("Mark the transfer in transit", async () => {
		type Transfer = { status: string };
		const updated = await orpcCall<object, Transfer>(
			page,
			"transferOrders",
			"markInTransit",
			{
				organizationId: TEST_ORG_ID,
				id: transferId,
			},
		);
		expect(updated.status).toBe("in_transit");
	});

	await test.step("Complete the transfer (receives 5 units at destination)", async () => {
		type Transfer = { status: string };
		const updated = await orpcCall<object, Transfer>(
			page,
			"transferOrders",
			"complete",
			{
				organizationId: TEST_ORG_ID,
				id: transferId,
				items: [{ itemId: transferItemId, quantityReceived: QTY }],
			},
		);
		expect(updated.status).toBe("completed");
		completed = true;
	});

	await test.step("Transfer order reads back as completed", async () => {
		type Transfer = { id: string; status: string };
		const detail = await orpcCall<object, Transfer>(
			page,
			"transferOrders",
			"getById",
			{
				organizationId: TEST_ORG_ID,
				id: transferId,
			},
		);
		expect(detail.status).toBe("completed");
	});

	await test.step("Open the Transfer Orders page", async () => {
		await page.goto("/dashboard/transfer-orders/view");
		// transfer-orders/view redirects to the stock-requests hub (transfers tab).
		await expect(page).toHaveURL(
			/\/dashboard\/(transfer-orders|stock-requests)\/view/,
		);
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — cancel the transfer if it never completed", async () => {
		if (completed || !transferId) return;
		try {
			await orpcCall(page, "transferOrders", "cancel", {
				organizationId: TEST_ORG_ID,
				id: transferId,
			});
		} catch (err) {
			if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
			// best-effort cleanup — swallow
		}
	});
});

// ─── P1: stockRequests.create → approve → fulfill ────────────────────────────

test("Admin approves and fulfills an inter-branch stock request", {
	tag: ["@p1"],
}, async ({ page }) => {
	let toBranchId = "";
	let fromBranchId: string | undefined;
	let productId = "";
	let issuedByMemberId = "";
	let requestId = "";
	let requestItemId = "";
	let fulfilled = false;
	const QTY = 4;

	await test.step("Resolve branch(es), a member, and a product", async () => {
		const branches = await listBranchNodes(page);
		test.skip(
			branches.length === 0,
			"no hierarchy node exists — cannot run stock-request journey",
		);
		toBranchId = branches[0]!.id;
		fromBranchId = branches[1]?.id; // optional source warehouse

		issuedByMemberId = (await pickAnyMemberId(page)) ?? "";
		test.skip(
			!issuedByMemberId,
			"no member exists to attribute the request to",
		);

		const uomId = await resolveUomId(page);
		expect(uomId, "a UOM must exist or be creatable").toBeTruthy();
		const product = await createTestProduct(page, uomId!, "SR");
		productId = product.id;

		// If a source branch is used, seed its stock so fulfilment can deduct.
		if (fromBranchId) {
			await orpcCall(page, "products", "adjustStock", {
				organizationId: TEST_ORG_ID,
				productId,
				branchId: fromBranchId,
				delta: 50,
			});
		}
	});

	await test.step("Create a pending stock request for 4 units", async () => {
		type Request = {
			id: string;
			status: string;
			items: Array<{ id: string; productId: string }>;
		};
		const request = await orpcCall<object, Request>(
			page,
			"stockRequests",
			"create",
			{
				organizationId: TEST_ORG_ID,
				dateIssued: new Date().toISOString(),
				issuedByMemberId,
				...(fromBranchId ? { fromBranchId } : {}),
				toBranchId,
				notes: "E2E stock request",
				items: [{ productId, quantityRequested: QTY }],
			},
		);
		requestId = request.id;
		requestItemId = request.items[0]!.id;
		expect(requestId, "stock request must be created").toBeTruthy();
		expect(request.status).toBe("pending");
	});

	await test.step("Approve the stock request", async () => {
		type Request = { status: string };
		const approved = await orpcCall<object, Request>(
			page,
			"stockRequests",
			"approve",
			{
				organizationId: TEST_ORG_ID,
				id: requestId,
			},
		);
		expect(approved.status).toBe("approved");
	});

	await test.step("Fulfill the stock request for 4 units", async () => {
		type Request = { status: string };
		const updated = await orpcCall<object, Request>(
			page,
			"stockRequests",
			"fulfill",
			{
				organizationId: TEST_ORG_ID,
				id: requestId,
				items: [{ itemId: requestItemId, quantityFulfilled: QTY }],
			},
		);
		expect(updated.status).toBe("fulfilled");
		fulfilled = true;
	});

	await test.step("Destination branch stock reflects the fulfilled units", async () => {
		type Stock = { quantity: number } | null;
		const stock = await orpcCall<object, Stock>(page, "products", "getStock", {
			organizationId: TEST_ORG_ID,
			productId,
			branchId: toBranchId,
		});
		// Fresh product → destination stock equals exactly the fulfilled quantity.
		expect(stock?.quantity).toBe(QTY);
	});

	await test.step("Open the Stock Requests page", async () => {
		await page.goto("/dashboard/stock-requests/view");
		await expect(page).toHaveURL(/\/dashboard\/stock-requests\/view/);
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — reject the request if it never reached fulfilled", async () => {
		if (fulfilled || !requestId) return;
		try {
			await orpcCall(page, "stockRequests", "reject", {
				organizationId: TEST_ORG_ID,
				id: requestId,
			});
		} catch (err) {
			if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
			// best-effort cleanup — swallow
		}
	});
});

// ─── P1: brands + productCategories + suppliers + unitsOfMeasure create/list ──

test("Admin creates inventory option records (brand, category, supplier, UOM) and lists them", {
	tag: ["@p1"],
}, async ({ page }) => {
	const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

	await test.step("Ensure baseline catalog fixtures resolve", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(fx.orgId).toBe(TEST_ORG_ID);
		// Guarantee at least one product exists so the catalog page renders content.
		await ensureFirstProduct(page);
	});

	let brandId = "";
	await test.step("Create a brand and confirm it appears in the list", async () => {
		type Created = { id: string; name?: string };
		const brand = await orpcCall<object, Created>(page, "brands", "create", {
			organizationId: TEST_ORG_ID,
			name: `E2E Brand ${suffix}`,
			description: "Created by inventory journey",
		});
		brandId = brand.id;
		expect(brandId).toBeTruthy();

		type BrandRow = { id: string };
		const rows = await orpcCall<object, BrandRow[]>(page, "brands", "list", {
			organizationId: TEST_ORG_ID,
		});
		expect(rows.some((r) => r.id === brandId)).toBe(true);
	});

	let categoryId = "";
	await test.step("Create a product category and confirm it lists", async () => {
		type Created = { id: string };
		const category = await orpcCall<object, Created>(
			page,
			"productCategories",
			"create",
			{
				organizationId: TEST_ORG_ID,
				name: `E2E Category ${suffix}`,
				description: "Created by inventory journey",
			},
		);
		categoryId = category.id;
		expect(categoryId).toBeTruthy();

		type CatRow = { id: string };
		const rows = await orpcCall<object, CatRow[]>(
			page,
			"productCategories",
			"list",
			{
				organizationId: TEST_ORG_ID,
			},
		);
		expect(rows.some((r) => r.id === categoryId)).toBe(true);
	});

	let supplierId = "";
	await test.step("Create a supplier and confirm it lists", async () => {
		type Created = { id: string };
		const supplier = await orpcCall<object, Created>(
			page,
			"suppliers",
			"create",
			{
				organizationId: TEST_ORG_ID,
				name: `E2E Supplier ${suffix}`,
				email: `e2e-supplier-${suffix}@example.com`,
				isActive: true,
			},
		);
		supplierId = supplier.id;
		expect(supplierId).toBeTruthy();

		type SupplierRow = { id: string };
		const rows = await orpcCall<object, SupplierRow[]>(
			page,
			"suppliers",
			"list",
			{
				organizationId: TEST_ORG_ID,
				isActive: true,
			},
		);
		expect(rows.some((r) => r.id === supplierId)).toBe(true);
	});

	let uomId = "";
	await test.step("Create a unit of measure and confirm it lists", async () => {
		type Created = { id: string };
		const uom = await orpcCall<object, Created>(
			page,
			"unitsOfMeasure",
			"create",
			{
				organizationId: TEST_ORG_ID,
				name: `E2E-UOM-${suffix}`,
				description: "Created by inventory journey",
			},
		);
		uomId = uom.id;
		expect(uomId).toBeTruthy();

		type UomRow = { id: string };
		const rows = await orpcCall<object, UomRow[]>(
			page,
			"unitsOfMeasure",
			"list",
			{
				organizationId: TEST_ORG_ID,
			},
		);
		expect(rows.some((r) => r.id === uomId)).toBe(true);
	});

	await test.step("Open the Inventory Options dashboard", async () => {
		await page.goto("/dashboard/inventory-options");
		await expect(page).toHaveURL(/\/dashboard\/inventory-options/);
		await page.waitForTimeout(1200);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — remove the created brand, category and UOM (deactivate supplier)", async () => {
		const swallow = async (fn: () => Promise<unknown>) => {
			try {
				await fn();
			} catch (err) {
				if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
				// best-effort cleanup — swallow other errors too
			}
		};
		if (brandId) {
			await swallow(() =>
				orpcCall(page, "brands", "delete", {
					organizationId: TEST_ORG_ID,
					id: brandId,
				}),
			);
		}
		if (categoryId) {
			await swallow(() =>
				orpcCall(page, "productCategories", "delete", {
					organizationId: TEST_ORG_ID,
					id: categoryId,
				}),
			);
		}
		if (uomId) {
			await swallow(() =>
				orpcCall(page, "unitsOfMeasure", "delete", {
					organizationId: TEST_ORG_ID,
					id: uomId,
				}),
			);
		}
		if (supplierId) {
			await swallow(() =>
				orpcCall(page, "suppliers", "deactivate", {
					organizationId: TEST_ORG_ID,
					id: supplierId,
				}),
			);
		}
	});
});
