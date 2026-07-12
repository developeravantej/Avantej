import { test, expect } from "@playwright/test";
import { rpc, rpcRaw, getOrgId } from "../_safe-mutation";
import { waitForWithReload } from "../_helpers";

/**
 * Branded print documents (zplan/2026-07-02_invoice-receipt-print) — invariants.
 *
 * Covers the rules the feature must uphold:
 *  R1  invoices.getPrintView returns the full document payload and, when the
 *      payment_items snapshot reconciles, Σ item totals === invoice.totalAmount
 *      (the guard that decides whether the SST breakdown may print).
 *  R2  /print/invoice/$id renders the real document (number, FROM, totals) on
 *      a bare layout — no dashboard sidebar (it would leak into print output).
 *  R3  Receipt numbers are STABLE: repeated getPrintViewForInvoice calls for
 *      the same invoice return the same RCP number (get-or-issue, never remint).
 *  R4  Receipt lines never double-count installment sales: lines are either
 *      installment references only or a single payment line — never both —
 *      and Σ line amounts === receipt.totalAmount.
 *  R5  An invoice with no completed payment (Stripe-pending) cannot issue a
 *      receipt (BAD_REQUEST), so zero-line receipts are unrepresentable.
 *
 * Read-only against existing rows: receipts are issued on demand by design
 * (idempotent get-or-issue), so no fixtures are created and nothing is torn down.
 */
/**
 * Fixture gate: by default a missing fixture (no invoices / no paid invoice /
 * no pending invoice) skips the test with a visible reason. In CI or a
 * gate-run, set E2E_STRICT_FIXTURES=1 to FAIL instead — otherwise an
 * all-skip run reads green while proving nothing.
 */
function skipOrFail(condition: boolean, reason: string): void {
	if (!condition) return;
	if (process.env.E2E_STRICT_FIXTURES) {
		throw new Error(`fixture missing (strict mode): ${reason}`);
	}
	test.skip(true, reason);
}

test.describe("print documents — invoice + receipt invariants", () => {
	test("R1: getPrintView payload is complete and the breakdown reconciles", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const list = await rpc(page.request, "invoices/list", { organizationId });
		const invoices = Array.isArray(list) ? list : (list?.invoices ?? []);
		skipOrFail(invoices.length === 0, "no invoices in the test tenant");

		const view = await rpc(page.request, "invoices/getPrintView", {
			organizationId,
			id: invoices[0].id,
		});

		// Document payload contract.
		expect(view.invoice.invoiceNumber).toMatch(/^INV-\d{8}-\d+/);
		expect(view.identity, "identity block present").toBeTruthy();
		expect(
			view.identity.legalName ?? view.identity.orgName,
			"a display name exists (legal name or org fallback)",
		).toBeTruthy();
		expect(view.customer.name).toBeTruthy();
		expect(Array.isArray(view.goodsItems)).toBeTruthy();
		expect(Array.isArray(view.taxItems)).toBeTruthy();
		expect(typeof view.reconciles).toBe("boolean");

		// The reconciliation guard must be arithmetically true when set.
		if (view.reconciles) {
			const sumAll = [
				...view.goodsItems,
				...view.taxItems,
				...view.discountItems,
			].reduce((s: number, i: { totalPrice: number }) => s + i.totalPrice, 0);
			expect(sumAll, "Σ snapshot items === invoice.totalAmount").toBe(
				view.invoice.totalAmount,
			);
		}
	});

	test("R2: /print/invoice/$id renders the branded document without dashboard chrome", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const list = await rpc(page.request, "invoices/list", { organizationId });
		const invoices = Array.isArray(list) ? list : (list?.invoices ?? []);
		skipOrFail(invoices.length === 0, "no invoices in the test tenant");
		const inv = invoices[0];

		await page.goto(`/print/invoice/${inv.id}`);
		await waitForWithReload(page, page.getByText(inv.invoiceNumber));

		// Real document content, not just no-crash.
		await expect(page.getByText(inv.invoiceNumber).first()).toBeVisible();
		await expect(page.getByText(/billed to/i)).toBeVisible();
		await expect(page.getByText(/^Total$/).first()).toBeVisible();
		await expect(
			page.getByRole("button", { name: /print \/ save as pdf/i }),
		).toBeVisible();
		// Bare layout: the dashboard sidebar/topbar must not exist on print routes.
		await expect(page.locator('[data-sidebar="sidebar"]')).toHaveCount(0);
	});

	test("R3+R4: receipt number is stable across calls; lines never double-count", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const list = await rpc(page.request, "invoices/list", { organizationId });
		const invoices = Array.isArray(list) ? list : (list?.invoices ?? []);
		const paid = invoices.filter(
			(i: { status: string }) =>
				i.status === "paid" || i.status === "partially_paid",
		);
		skipOrFail(paid.length === 0, "no paid/partially_paid invoices to receipt");
		const inv = paid[0];

		const first = await rpc(page.request, "receipts/getPrintViewForInvoice", {
			organizationId,
			invoiceId: inv.id,
		});
		const second = await rpc(page.request, "receipts/getPrintViewForInvoice", {
			organizationId,
			invoiceId: inv.id,
		});

		// R3 — stable number, same receipt row.
		expect(first.receipt.receiptNumber).toMatch(/^RCP-\d{8}-\d+/);
		expect(second.receipt.receiptNumber).toBe(first.receipt.receiptNumber);
		expect(second.receipt.id).toBe(first.receipt.id);

		// R4 — lines are installments-only OR a single payment line, never a mix;
		// totals always reconcile with the snapshot.
		const lines: Array<{ reference: string; amountCents: number }> =
			first.receipt.lines;
		expect(lines.length).toBeGreaterThan(0);
		const installmentLines = lines.filter((l) =>
			/^Installment \d+ of \d+$/.test(l.reference),
		);
		if (installmentLines.length > 0) {
			expect(
				installmentLines.length,
				"installment sale: every line is an installment (payment row would double-count #1)",
			).toBe(lines.length);
		} else {
			expect(lines.length, "non-installment sale: single payment line").toBe(1);
		}
		const sum = lines.reduce((s, l) => s + l.amountCents, 0);
		expect(sum, "Σ line amounts === receipt.totalAmount").toBe(
			first.receipt.totalAmount,
		);

		// Against-invoice cross-reference is snapshotted.
		expect(first.receipt.invoiceNumber).toBe(inv.invoiceNumber);
	});

	test("R5: an invoice with no completed payment cannot issue a receipt", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const list = await rpc(page.request, "invoices/list", {
			organizationId,
			status: "pending",
		});
		const pending = Array.isArray(list) ? list : (list?.invoices ?? []);
		skipOrFail(
			pending.length === 0,
			"no pending (Stripe-unpaid) invoices in this dataset",
		);

		const res = await rpcRaw(page.request, "receipts/getPrintViewForInvoice", {
			organizationId,
			invoiceId: pending[0].id,
		});
		expect(
			res.status(),
			"BAD_REQUEST — zero-line receipts unrepresentable",
		).toBe(400);
	});
});
