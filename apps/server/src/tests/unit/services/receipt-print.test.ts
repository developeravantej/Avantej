/**
 * Unit tests for the pure pieces of the branded print documents feature
 * (zplan/2026-07-02_invoice-receipt-print):
 *
 * - buildReceiptNumber: RCP-YYYYMMDD-NNNNNN formatting.
 * - buildReceiptLines: the B1 rule — a POS payment row's totalAmount IS
 *   installment #1 (recordSale collects dueNowCents and auto-confirms
 *   installment 1), so installment sales must use installments ONLY;
 *   including the payment row too would double-count the first installment.
 * - classifyInvoiceItems: goods/tax/discount split + the reconciliation guard
 *   that decides whether the document may print an SST breakdown.
 */

import { describe, test, expect, mock } from "bun:test";
import {
	buildReceiptNumber,
	buildReceiptLines,
	classifyInvoiceItems,
	getOrIssueReceiptForInvoice,
} from "@avantej-core/services";

describe("buildReceiptNumber", () => {
	test("formats RCP-YYYYMMDD with zero-padded 6-digit sequence", () => {
		expect(buildReceiptNumber(new Date(2026, 6, 2), 42)).toBe(
			"RCP-20260702-000042",
		);
	});

	test("sequence past 999999 grows rather than truncates", () => {
		expect(buildReceiptNumber(new Date(2026, 0, 1), 1234567)).toBe(
			"RCP-20260101-1234567",
		);
	});
});

const paidInstallment = (n: number, amountPaid: number) => ({
	installmentNumber: n,
	amount: amountPaid,
	amountPaid,
	paidAt: new Date(2026, 6, 2),
	dueDate: new Date(2026, 6, 2),
	paymentMethod: "cash",
});

const posPayment = {
	paymentNumber: "PAY-20260702-000001",
	paymentMethod: "cash",
	description: "POS sale SO-20260702-000001",
	totalAmount: 54000,
	status: "succeeded",
	createdAt: new Date(2026, 6, 2),
};

describe("buildReceiptLines", () => {
	test("installment sale: uses installments ONLY — payment row would double-count installment #1", () => {
		const lines = buildReceiptLines(
			[paidInstallment(1, 54000), paidInstallment(2, 54000)],
			posPayment, // linked POS payment (= installment #1's 54000) must be ignored
			3,
		);
		expect(lines).toHaveLength(2);
		expect(lines.map((l) => l.amountCents)).toEqual([54000, 54000]);
		expect(lines[0]?.reference).toBe("Installment 1 of 3");
		expect(lines[1]?.reference).toBe("Installment 2 of 3");
		// Total covered is 2×54000, NOT 3×54000 (which the double-count would give).
		expect(lines.reduce((s, l) => s + l.amountCents, 0)).toBe(108000);
	});

	test("non-installment sale: single line from the payment row", () => {
		const lines = buildReceiptLines([], posPayment, 0);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			method: "cash",
			reference: "PAY-20260702-000001",
			amountCents: 54000,
		});
	});

	test("pending (Stripe) payment yields no lines — receipt must not be issuable", () => {
		expect(
			buildReceiptLines([], { ...posPayment, status: "pending" }, 0),
		).toHaveLength(0);
	});

	test("no payment and no installments (NULL salesOrderId linkage) yields no lines", () => {
		expect(buildReceiptLines([], null, 0)).toHaveLength(0);
	});

	test("falls back to installment amount when amountPaid is 0", () => {
		const inst = { ...paidInstallment(1, 0), amount: 50000 };
		const lines = buildReceiptLines([inst], null, 1);
		expect(lines[0]?.amountCents).toBe(50000);
	});
});

const item = (
	itemType: string,
	totalPrice: number,
	extra: Record<string, unknown> = {},
) => ({
	id: crypto.randomUUID(),
	paymentId: crypto.randomUUID(),
	itemType,
	itemId: null,
	promotionId: null,
	taxRateId: null,
	taxRateBps: null,
	taxRateCode: null,
	description: itemType,
	quantity: 1,
	unitPrice: totalPrice,
	totalPrice,
	createdAt: new Date(),
	...extra,
});

describe("classifyInvoiceItems", () => {
	test("splits goods/tax/discount and reconciles against the invoice total", () => {
		// POS convention: Σ ALL item totalPrice = subtotal - discounts + tax = invoices.totalAmount
		const items = [
			item("package", 150000),
			item("tax", 12000, { taxRateBps: 800, taxRateCode: "SST8" }),
			item("discount", -10000),
		] as Parameters<typeof classifyInvoiceItems>[0];
		const result = classifyInvoiceItems(items, 152000);
		expect(result.goodsItems).toHaveLength(1);
		expect(result.taxItems).toHaveLength(1);
		expect(result.discountItems).toHaveLength(1);
		expect(result.subtotalCents).toBe(150000);
		expect(result.reconciles).toBe(true);
	});

	test("does NOT reconcile when totals disagree (legacy/manual rows) — breakdown must be suppressed", () => {
		const items = [item("package", 150000), item("tax", 12000)] as Parameters<
			typeof classifyInvoiceItems
		>[0];
		expect(classifyInvoiceItems(items, 999999).reconciles).toBe(false);
	});

	test("empty items (manual invoice, no linked payment) never reconciles", () => {
		const result = classifyInvoiceItems([], 100000);
		expect(result.reconciles).toBe(false);
		expect(result.subtotalCents).toBe(0);
	});

	test("lost insert race returns the winner's receipt instead of throwing", async () => {
		// Concurrent first-print race: the existence check sees nothing, the
		// insert hits receipts_invoice_unique (onConflictDoNothing → no row),
		// and the loser must re-read and return the winner's receipt.
		const invoiceId = "11111111-1111-4111-8111-111111111111";
		const winner = {
			id: "22222222-2222-4222-8222-222222222222",
			receiptNumber: "RCP-20260705-000009",
			invoiceId,
			totalAmount: 54000,
			lines: [],
		};

		let receiptLookups = 0;
		const mockDb = {
			execute: mock(() => Promise.resolve({ rows: [{ seq: "10" }] })),
			insert: mock(() => ({
				values: mock(() => ({
					onConflictDoNothing: mock(() => ({
						// Lost the race: conflict swallowed, nothing returned.
						returning: mock(() => Promise.resolve([])),
					})),
				})),
			})),
			query: {
				invoices: {
					findFirst: mock(() =>
						Promise.resolve({
							id: invoiceId,
							invoiceNumber: "INV-20260705-000009",
							salesOrderId: null,
							paymentId: "33333333-3333-4333-8333-333333333333",
							customerId: "cust-1",
							customerName: "Ahmad Firdaus",
						}),
					),
				},
				payments: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "33333333-3333-4333-8333-333333333333",
							paymentNumber: "PAY-20260705-000009",
							paymentMethod: "cash",
							description: "POS sale",
							totalAmount: 54000,
							status: "succeeded",
							createdAt: new Date(2026, 6, 5),
						}),
					),
				},
				receipts: {
					// 1st call = existence check (nothing yet); 2nd = post-conflict
					// re-read (winner row).
					findFirst: mock(() => {
						receiptLookups += 1;
						return Promise.resolve(receiptLookups === 1 ? undefined : winner);
					}),
				},
			},
		};

		const result = await getOrIssueReceiptForInvoice(
			// biome-ignore lint/suspicious/noExplicitAny: structural mock
			mockDb as any,
			invoiceId,
			"actor-1",
		);
		expect(result?.id).toBe(winner.id);
		expect(result?.receiptNumber).toBe(winner.receiptNumber);
		expect(receiptLookups).toBe(2);
	});

	test("booking and fee item types count as goods", () => {
		const items = [item("booking", 5000), item("fee", 2000)] as Parameters<
			typeof classifyInvoiceItems
		>[0];
		const result = classifyInvoiceItems(items, 7000);
		expect(result.goodsItems).toHaveLength(2);
		expect(result.subtotalCents).toBe(7000);
		expect(result.reconciles).toBe(true);
	});
});
