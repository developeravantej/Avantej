/**
 * Journey suite: Refunds & Cancellations
 * Routers in scope: refunds, installments, salesOrders, pos
 * Pages in scope: refunds/view, cancelled-sales/view
 * Actor: tenant-admin
 *
 * The unified refund ledger has a four-step lifecycle:
 *   request → approve | reject → process
 *
 * Each journey SEEDs deterministic state via oRPC, ASSERTs state via oRPC, then
 * navigates the relevant /dashboard page and adds a tolerant UI assertion so the
 * recorded video shows the end-user-visible result.
 *
 * Refund router input shapes (read from packages/api/src/routers/refunds.ts):
 *   request: { organizationId, salesOrderId, amountCents, reason, ... } → Refund row (id, status:"pending", amountCents)
 *   approve: { organizationId, id, approveAmountCents?, reviewNotes? }  → Refund (status:"approved")
 *   reject:  { organizationId, id, reviewNotes (required, min 1) }      → Refund (status:"rejected")
 *   process: { organizationId, id, refundMethod, refundReference? }     → Refund (status:"processed")
 * installments.processRefund (admin-only): { organizationId, packageInstanceId, amount, reason }
 *   → { success, cancelledInstallmentIds }
 */
import { test, expect } from "@playwright/test";
import { ensureJourneyFixtures, branchForClient } from "../helpers/seed-journey-fixtures";
import { recordPosSale, TEST_ORG_ID } from "../helpers/seed-data";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";

// ─── Shared row types ───────────────────────────────────────────────────────────

type Refund = {
	id: string;
	refundNumber?: string;
	status: string;
	amountCents: number;
	salesOrderId?: string | null;
	refundMethod?: string | null;
};

/** Refund IDs created by THIS spec — used for scoped, idempotent cleanup. */
const createdRefundIds = new Set<string>();

/** Best-effort cleanup — reject a still-pending refund so the queue doesn't accrete. */
async function rejectIfPending(page: import("@playwright/test").Page, refundId: string): Promise<void> {
	if (!refundId) return;
	try {
		const r = await orpcCall<object, Refund>(page, "refunds", "getById", {
			organizationId: TEST_ORG_ID,
			id: refundId,
		});
		if (r.status === "pending") {
			await orpcCall(page, "refunds", "reject", {
				organizationId: TEST_ORG_ID,
				id: refundId,
				reviewNotes: "E2E cleanup — auto-reject leftover pending refund",
			});
		}
	} catch (err) {
		if (err instanceof OrpcClientError) return; // NOT_FOUND / already resolved — ignore
		throw err;
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// P0 — Full refund lifecycle: paid POS sale → request → approve → process
// ═══════════════════════════════════════════════════════════════════════════════

test(
	"Admin refunds a paid POS sale end-to-end: request → approve → process",
	{ tag: ["@p0"] },
	async ({ page }) => {
		let salesOrderId = "";
		let refundId = "";
		let refundAmountCents = 0;

		await test.step("Resolve tenant fixtures (client, product, branch)", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.product, "a product must exist").toBeTruthy();

			await test.step("Record a paid cash POS product sale (the order being refunded)", async () => {
				refundAmountCents = fx.product!.unitPriceCents; // 1 unit
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
		});

		await test.step("Request a refund against the sale (creates a pending row)", async () => {
			const refund = await orpcCall<object, Refund>(page, "refunds", "request", {
				organizationId: TEST_ORG_ID,
				salesOrderId,
				amountCents: refundAmountCents,
				reason: "Customer returned the product — E2E full lifecycle",
			});
			expect(refund.id, "request must return a refund id").toBeTruthy();
			expect(refund.status).toBe("pending");
			expect(refund.amountCents).toBe(refundAmountCents);
			refundId = refund.id;
			createdRefundIds.add(refundId);
		});

		await test.step("Approve the pending refund (full amount)", async () => {
			const approved = await orpcCall<object, Refund>(page, "refunds", "approve", {
				organizationId: TEST_ORG_ID,
				id: refundId,
				reviewNotes: "Verified return — approved in full",
			});
			expect(approved.status).toBe("approved");
		});

		await test.step("Process the approved refund (records the manual reversal)", async () => {
			const processed = await orpcCall<object, Refund>(page, "refunds", "process", {
				organizationId: TEST_ORG_ID,
				id: refundId,
				refundMethod: "cash",
				refundReference: "E2E-REV-001",
			});
			expect(processed.status).toBe("processed");
			expect(processed.refundMethod).toBe("cash");
		});

		await test.step("Confirm via refunds.getById — refund is recorded as processed", async () => {
			const refund = await orpcCall<object, Refund>(page, "refunds", "getById", {
				organizationId: TEST_ORG_ID,
				id: refundId,
			});
			expect(refund.id).toBe(refundId);
			expect(refund.status).toBe("processed");
		});

		await test.step("Refund appears under the Processed filter (refunds.list)", async () => {
			type ListResult = { rows: Refund[]; total?: number };
			const result = await orpcCall<object, ListResult>(page, "refunds", "list", {
				organizationId: TEST_ORG_ID,
				status: "processed",
				limit: 100,
				offset: 0,
			});
			expect(Array.isArray(result.rows)).toBe(true);
			expect(result.rows.some((r) => r.id === refundId)).toBe(true);
		});

		await test.step("Open the Refunds ledger — heading + status tabs render", async () => {
			await page.goto("/dashboard/refunds/view");
			await expect(
				page.getByRole("heading", { name: /refunds/i }).first(),
			).toBeVisible();
			await expect(page).toHaveURL(/\/dashboard\/refunds\/view/);
			// Status tabs (All / Pending / Approved / Rejected / Processed) — the report shows the queue tabs.
			await expect(page.getByRole("button", { name: "All", exact: true }).first()).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Processed", exact: true }).first(),
			).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// P0 — Reject path: paid POS sale → request → reject
// ═══════════════════════════════════════════════════════════════════════════════

test(
	"Admin rejects a refund request with a documented reason",
	{ tag: ["@p0"] },
	async ({ page }) => {
		let salesOrderId = "";
		let refundId = "";
		let refundAmountCents = 0;

		await test.step("Resolve tenant fixtures and record a paid POS sale", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.product, "a product must exist").toBeTruthy();

			refundAmountCents = fx.product!.unitPriceCents;
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

		await test.step("Request a refund against the sale (pending)", async () => {
			const refund = await orpcCall<object, Refund>(page, "refunds", "request", {
				organizationId: TEST_ORG_ID,
				salesOrderId,
				amountCents: refundAmountCents,
				reason: "Customer claims defect — E2E reject path",
			});
			expect(refund.id).toBeTruthy();
			expect(refund.status).toBe("pending");
			refundId = refund.id;
			createdRefundIds.add(refundId);
		});

		await test.step("Reject the refund with required review notes", async () => {
			const rejected = await orpcCall<object, Refund>(page, "refunds", "reject", {
				organizationId: TEST_ORG_ID,
				id: refundId,
				reviewNotes: "Product showed no defect on inspection — refund denied",
			});
			expect(rejected.status).toBe("rejected");
		});

		await test.step("Confirm rejection persisted via refunds.getById", async () => {
			const refund = await orpcCall<object, Refund>(page, "refunds", "getById", {
				organizationId: TEST_ORG_ID,
				id: refundId,
			});
			expect(refund.status).toBe("rejected");
		});

		await test.step("Open the Refunds ledger filtered to Rejected — page renders cleanly", async () => {
			await page.goto("/dashboard/refunds/view");
			await expect(
				page.getByRole("heading", { name: /refunds/i }).first(),
			).toBeVisible();
			await page.getByRole("button", { name: "Rejected", exact: true }).first().click();
			await page.waitForTimeout(800);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// P1 — installments.processRefund on an installment-plan package purchase
// ═══════════════════════════════════════════════════════════════════════════════

test(
	"Admin processes an installment refund against a package purchase",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let packageInstanceId = "";

		await test.step("Resolve fixtures (package service, client, installment plan, branch)", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();

			// installments.processRefund needs a package_instances row WITH installments.
			// The only deterministic way to create that is a POS package sale on an
			// installment plan. If the tenant has no installment-eligible package
			// service or no active installment plan, the precondition is genuinely
			// impossible to satisfy without editing seed data — skip in that case.
			test.skip(
				!fx.packageService || !fx.installmentPlan,
				"No installment-eligible package service or active installment plan configured in tenant.",
			);

			await test.step("Sell the package on an installment plan via POS", async () => {
				type SaleResult = { salesOrderId: string; packageInstanceId?: string };
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
							unitPriceCents: 30000, // RM 300 — comfortably splittable across installments
						},
					],
					paymentMethod: "cash",
					installmentPlanCode: fx.installmentPlan!.code,
				});
				expect(result.salesOrderId, "POS package sale must succeed").toBeTruthy();
				packageInstanceId = result.packageInstanceId ?? "";
				// A package sale on an installment plan must materialise a package instance.
				expect(packageInstanceId, "package sale must create a package instance").toBeTruthy();
			});
		});

		await test.step("Process an installment refund against the package instance", async () => {
			type RefundResult = { success: boolean; cancelledInstallmentIds: string[] };
			const result = await orpcCall<object, RefundResult>(page, "installments", "processRefund", {
				organizationId: TEST_ORG_ID,
				packageInstanceId,
				amount: 10000, // RM 100 partial refund (cents; ≤ remaining)
				reason: "Client cancelled remaining sessions — E2E installment refund",
			});
			expect(result.success).toBe(true);
			expect(Array.isArray(result.cancelledInstallmentIds)).toBe(true);
			test.info().annotations.push({
				type: "cancelled-installments",
				description: String(result.cancelledInstallmentIds.length),
			});
		});

		await test.step("Verify the installment refund event via installments.getEvents", async () => {
			type EventRow = { id: string; eventType?: string; eventCategory?: string };
			const events = await orpcCall<object, EventRow[]>(page, "installments", "getEvents", {
				organizationId: TEST_ORG_ID,
				packageInstanceId,
			});
			expect(Array.isArray(events)).toBe(true);
			expect(events.length).toBeGreaterThan(0);
		});

		await test.step("Open the Refunds ledger — page renders cleanly", async () => {
			await page.goto("/dashboard/refunds/view");
			await expect(
				page.getByRole("heading", { name: /refunds/i }).first(),
			).toBeVisible();
			await page.waitForTimeout(800);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ─── Suite cleanup ────────────────────────────────────────────────────────────
// Refunds that reach approved/rejected/processed are terminal ledger records and
// are intentionally NOT mutated here. Only refunds THIS spec created that are still
// pending (e.g. a journey that errored mid-flight) are auto-rejected, scoped to the
// tracked id set so we never touch refunds owned by other specs or seed data.
test.afterEach(async ({ page }) => {
	for (const id of createdRefundIds) {
		await rejectIfPending(page, id);
	}
	createdRefundIds.clear();
});
