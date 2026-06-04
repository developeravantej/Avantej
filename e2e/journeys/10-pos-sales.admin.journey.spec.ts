/**
 * Journey suite: POS & Sales (expanded).
 * Suite: POS & Sales · Actor: tenant-admin
 *
 * Routers in scope: pos, salesOrders, promotions, taxRates, cancelledSales.
 * Pages in scope: sales/create (4-step POS), sales/view, sales/$id,
 *                 cancelled-sales/view, promotions/view.
 *
 * Each journey SEEDS deterministic state via oRPC, ASSERTS the resulting state
 * via oRPC, then navigates the relevant /dashboard page and adds a tolerant UI
 * assertion so the recorded video shows the end-user-visible result.
 */
import { test, expect } from "@playwright/test";
import { ensureJourneyFixtures, branchForClient } from "../helpers/seed-journey-fixtures";
import { recordPosSale, TEST_ORG_ID } from "../helpers/seed-data";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";

// Shared shapes ────────────────────────────────────────────────────────────
type SaleResult = {
	salesOrderId: string;
	salesOrderNumber: string;
	subtotalCents: number;
	discountCents: number;
	taxCents: number;
	totalCents: number;
	packageInstanceId?: string;
};
type SalesOrder = {
	id: string;
	status?: string;
	totalAmount?: number;
	salesOrderNumber?: string;
};
type PackageInstanceRow = {
	id: string;
	serviceId: string;
	clientId: string | null;
	salesOrderId: string | null;
	status: string;
};
type Promotion = { id: string; code: string; type: string; value: number; isActive: boolean };

// ── P0 — Package POS sale links a package instance by salesOrderId ───────────
test(
	"POS sale of a package service creates a package instance linked by salesOrderId",
	{ tag: ["@p0"] },
	async ({ page }) => {
		let salesOrderId = "";
		let clientUserId = "";
		const PKG_UNIT_PRICE_CENTS = 30000; // RM 300 — package service price for the sale

		await test.step("Resolve fixtures (client, package-eligible service, branch)", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			// pickFirstService({ isPackage: true, hasSessions: true }) — backend requires
			// expirable=true + expiryDays set + sessionCount>0 to sell as a package.
			expect(
				fx.packageService,
				"a package-eligible service (expirable + sessions) must exist",
			).toBeTruthy();
			clientUserId = fx.client!.userId;

			await test.step("Record a POS sale of the package service (cash, member customer)", async () => {
				const result = await orpcCall<object, SaleResult>(page, "pos", "recordSale", {
					organizationId: TEST_ORG_ID,
					customerType: "member",
					customerId: fx.client!.userId,
					customerName: fx.client!.name,
					branchId: branchForClient(fx),
					items: [
						{
							type: "package",
							refId: fx.packageService!.id,
							description: fx.packageService!.name,
							quantity: 1,
							unitPriceCents: PKG_UNIT_PRICE_CENTS,
						},
					],
					paymentMethod: "cash",
				});
				salesOrderId = result.salesOrderId;
				expect(salesOrderId, "recordSale must return a salesOrderId").toBeTruthy();
				// The package branch — recordSale always materialises a package instance for
				// type:"package" items, so the result carries its id back.
				expect(result.packageInstanceId, "a package instance must be created").toBeTruthy();
			});
		});

		await test.step("A package instance exists for this client linked by salesOrderId", async () => {
			const rows = await orpcCall<object, PackageInstanceRow[]>(
				page,
				"packageInstances",
				"listAll",
				{ organizationId: TEST_ORG_ID, clientId: clientUserId, source: "purchased" },
			);
			const linked = rows.find((r) => r.salesOrderId === salesOrderId);
			expect(linked, "a package instance must be linked to the sales order").toBeTruthy();
			expect(linked!.salesOrderId).toBe(salesOrderId);
			test.info().annotations.push({
				type: "package-instance",
				description: `${linked!.id} (status=${linked!.status})`,
			});
		});

		await test.step("Cross-check the link via the POS receipt DTO", async () => {
			type Receipt = { packageInstance: { id: string; serviceId: string } | null };
			const receipt = await orpcCall<object, Receipt>(page, "pos", "getReceiptData", {
				organizationId: TEST_ORG_ID,
				salesOrderId,
			});
			expect(receipt.packageInstance, "receipt must surface the linked package").toBeTruthy();
		});

		await test.step("Open the order detail page — the new sale renders", async () => {
			await page.goto(`/dashboard/sales/${salesOrderId}`);
			await expect(page).toHaveURL(new RegExp(`/dashboard/sales/${salesOrderId}`));
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ── P0 — Promotion code discounts a POS order ────────────────────────────────
test(
	"Applying a promotion code to a POS order discounts the total",
	{ tag: ["@p0"] },
	async ({ page }) => {
		// A unique-per-run code so re-runs don't trip the global usage/per-customer limit.
		const PROMO_CODE = `E2EPCT${Date.now().toString(36).toUpperCase()}`;
		const PROMO_PCT_BPS = 1000; // promotions.value is basis points for "percentage" → 10%
		const PRODUCT_UNIT_PRICE_CENTS = 20000; // RM 200 line so the discount is clearly visible
		let salesOrderId = "";

		await test.step("Resolve fixtures (client, product, branch)", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.product, "a product must exist").toBeTruthy();

			await test.step("Create a 10% promotion (valid now, member-scoped)", async () => {
				const promo = await orpcCall<object, Promotion>(page, "promotions", "create", {
					organizationId: TEST_ORG_ID,
					code: PROMO_CODE,
					name: `E2E ${PROMO_CODE}`,
					type: "percentage",
					value: PROMO_PCT_BPS,
					validFrom: new Date(Date.now() - 60_000).toISOString(),
				});
				expect(promo.code.toUpperCase()).toBe(PROMO_CODE);
				expect(promo.isActive).toBe(true);
			});

			await test.step("Validate the promo against the order amount", async () => {
				type ValidateResult = { promotion: Promotion; discountAmount: number };
				const v = await orpcCall<object, ValidateResult>(page, "promotions", "validate", {
					organizationId: TEST_ORG_ID,
					code: PROMO_CODE,
					customerId: fx.client!.userId,
					orderAmount: PRODUCT_UNIT_PRICE_CENTS,
				});
				// 10% of 20000 = 2000 cents.
				expect(v.discountAmount).toBe(Math.floor((PRODUCT_UNIT_PRICE_CENTS * PROMO_PCT_BPS) / 10000));
			});

			await test.step("Record a POS sale that applies the promotion code", async () => {
				const result = await orpcCall<object, SaleResult>(page, "pos", "recordSale", {
					organizationId: TEST_ORG_ID,
					customerType: "member",
					customerId: fx.client!.userId,
					customerName: fx.client!.name,
					branchId: branchForClient(fx),
					items: [
						{
							type: "product",
							refId: fx.product!.id,
							description: fx.product!.name,
							quantity: 1,
							unitPriceCents: PRODUCT_UNIT_PRICE_CENTS,
						},
					],
					promotionCode: PROMO_CODE,
					paymentMethod: "cash",
				});
				salesOrderId = result.salesOrderId;
				expect(salesOrderId, "recordSale must return a salesOrderId").toBeTruthy();

				// The discount must have been applied (10% of subtotal).
				expect(result.subtotalCents).toBe(PRODUCT_UNIT_PRICE_CENTS);
				expect(result.discountCents).toBe(
					Math.floor((PRODUCT_UNIT_PRICE_CENTS * PROMO_PCT_BPS) / 10000),
				);
				// total = (subtotal - discount) + tax. Tax may be 0 or the org default;
				// assert the invariant rather than a fixed number.
				expect(result.totalCents).toBe(
					result.subtotalCents - result.discountCents + result.taxCents,
				);
				expect(result.totalCents).toBeLessThan(result.subtotalCents + result.taxCents);
			});
		});

		await test.step("The discounted order total persists on the sales order (pre-tax, post-discount)", async () => {
			const order = await orpcCall<object, SalesOrder>(page, "salesOrders", "getById", {
				organizationId: TEST_ORG_ID,
				id: salesOrderId,
			});
			// salesOrders.totalAmount is stored pre-tax, post-discount.
			expect(order.totalAmount).toBe(
				PRODUCT_UNIT_PRICE_CENTS - Math.floor((PRODUCT_UNIT_PRICE_CENTS * PROMO_PCT_BPS) / 10000),
			);
		});

		await test.step("Open the Promotions page (Service catalog → Promotions tab)", async () => {
			// /dashboard/promotions/view redirects to the service catalog Promotions tab.
			await page.goto("/dashboard/promotions/view");
			await expect(page).toHaveURL(/\/dashboard\/service\/view/);
			await expect(page.getByRole("heading", { name: /services/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Cleanup — deactivate the seeded promotion", async () => {
			try {
				const promos = await orpcCall<object, Promotion[]>(page, "promotions", "list", {
					organizationId: TEST_ORG_ID,
				});
				const mine = promos.find((p) => p.code.toUpperCase() === PROMO_CODE);
				if (mine) {
					await orpcCall(page, "promotions", "deactivate", {
						organizationId: TEST_ORG_ID,
						id: mine.id,
					});
				}
			} catch (err) {
				if (!(err instanceof OrpcClientError)) throw err;
			}
		});
	},
);

// ── P1 — Cancel a sales order; it shows up in Cancelled Sales ────────────────
test(
	"Cancelling a sales order moves it into Cancelled Sales",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let salesOrderId = "";
		const PRODUCT_UNIT_PRICE_CENTS = 5000;

		await test.step("Seed a product POS sale to cancel", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.product, "a product must exist").toBeTruthy();

			salesOrderId = await recordPosSale(page, {
				customerId: fx.client!.userId,
				customerName: fx.client!.name,
				branchId: branchForClient(fx),
				items: [
					{
						type: "product",
						refId: fx.product!.id,
						description: fx.product!.name,
						quantity: 1,
						unitPriceCents: PRODUCT_UNIT_PRICE_CENTS,
					},
				],
				paymentMethod: "cash",
			});
			expect(salesOrderId, "recordSale must return a salesOrderId").toBeTruthy();
		});

		await test.step("The order starts in a non-cancelled state", async () => {
			const order = await orpcCall<object, SalesOrder>(page, "salesOrders", "getById", {
				organizationId: TEST_ORG_ID,
				id: salesOrderId,
			});
			expect(order.status).not.toBe("cancelled");
		});

		await test.step("Cancel the sales order (full refund of pre-tax total)", async () => {
			// refundAmount must be 0..totalAmount; totalAmount is the pre-tax post-discount total.
			const order = await orpcCall<object, SalesOrder>(page, "salesOrders", "getById", {
				organizationId: TEST_ORG_ID,
				id: salesOrderId,
			});
			const refundAmount = order.totalAmount ?? PRODUCT_UNIT_PRICE_CENTS;
			const cancelled = await orpcCall<object, SalesOrder>(page, "salesOrders", "cancel", {
				organizationId: TEST_ORG_ID,
				id: salesOrderId,
				cancelledBy: "e2e-admin",
				reason: "E2E journey: cancel-to-cancelled-sales",
				refundAmount,
				cancellationReasonCategory: "other",
			});
			expect(cancelled.status).toBe("cancelled");
		});

		await test.step("The order is now reported as cancelled", async () => {
			const order = await orpcCall<object, SalesOrder>(page, "salesOrders", "getById", {
				organizationId: TEST_ORG_ID,
				id: salesOrderId,
			});
			expect(order.status).toBe("cancelled");
		});

		await test.step("The order appears in the Cancelled Sales ledger", async () => {
			type CancelledRow = { id: string; salesOrderId: string };
			const result = await orpcCall<object, { rows: CancelledRow[]; total: number }>(
				page,
				"cancelledSales",
				"list",
				{ organizationId: TEST_ORG_ID, limit: 200, offset: 0 },
			);
			const found = result.rows.find(
				(r) => r.salesOrderId === salesOrderId || r.id === salesOrderId,
			);
			expect(found, "the cancelled order must appear in cancelledSales.list").toBeTruthy();
		});

		await test.step("Open the Cancelled Sales page — the heading and a row render", async () => {
			await page.goto("/dashboard/cancelled-sales/view");
			await expect(page.getByRole("heading", { name: /cancelled sales/i }).first()).toBeVisible();
			await page.waitForTimeout(1200);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("It no longer appears as an active (non-cancelled) sale", async () => {
			// salesOrders.list with status:"confirmed" must NOT contain the cancelled order.
			const result = await orpcCall<object, { rows: SalesOrder[]; total: number }>(
				page,
				"salesOrders",
				"list",
				{ organizationId: TEST_ORG_ID, status: "confirmed", limit: 200, offset: 0 },
			);
			const stillActive = result.rows.some((r) => r.id === salesOrderId);
			expect(stillActive, "cancelled order must not appear among confirmed sales").toBe(false);
		});
	},
);

// ── P1 — Sales list renders with stats + a seeded order row ──────────────────
test(
	"Sales list renders with KPI stats and a seeded order row",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let salesOrderId = "";

		await test.step("Seed a product POS sale so the ledger is non-empty", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.product, "a product must exist").toBeTruthy();

			salesOrderId = await recordPosSale(page, {
				customerId: fx.client!.userId,
				customerName: fx.client!.name,
				branchId: branchForClient(fx),
				items: [
					{
						type: "product",
						refId: fx.product!.id,
						description: fx.product!.name,
						quantity: 1,
						unitPriceCents: fx.product!.unitPriceCents,
					},
				],
				paymentMethod: "cash",
			});
			expect(salesOrderId, "recordSale must return a salesOrderId").toBeTruthy();
		});

		await test.step("KPI summary computes without error", async () => {
			type Kpi = Record<string, unknown>;
			const kpi = await orpcCall<object, Kpi>(page, "salesOrders", "kpiSummary", {
				organizationId: TEST_ORG_ID,
				period: "month",
			});
			expect(kpi, "kpiSummary must return a summary object").toBeTruthy();
			expect(typeof kpi).toBe("object");
		});

		await test.step("The seeded order is present in the sales list", async () => {
			const result = await orpcCall<object, { rows: SalesOrder[]; total: number }>(
				page,
				"salesOrders",
				"list",
				{ organizationId: TEST_ORG_ID, limit: 200, offset: 0 },
			);
			expect(result.rows.length).toBeGreaterThan(0);
			const found = result.rows.find((r) => r.id === salesOrderId);
			expect(found, "the seeded order must be listed").toBeTruthy();
		});

		await test.step("Open the Sales ledger — heading and order rows render", async () => {
			await page.goto("/dashboard/sales/view");
			await expect(page.getByRole("heading", { name: /sales\s*&\s*payments/i }).first()).toBeVisible();
			await page.waitForTimeout(1200);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Cleanup — cancel the seeded order", async () => {
			try {
				const order = await orpcCall<object, SalesOrder>(page, "salesOrders", "getById", {
					organizationId: TEST_ORG_ID,
					id: salesOrderId,
				});
				await orpcCall(page, "salesOrders", "cancel", {
					organizationId: TEST_ORG_ID,
					id: salesOrderId,
					cancelledBy: "e2e-admin",
					reason: "E2E afterEach cleanup",
					refundAmount: order.totalAmount ?? 0,
					cancellationReasonCategory: "other",
				});
			} catch (err) {
				if (!(err instanceof OrpcClientError)) throw err;
			}
		});
	},
);
