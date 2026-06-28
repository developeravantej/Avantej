import { describe, it, expect } from "vitest";
import {
	buildInvoiceDoc,
	type InvoicePdfData,
} from "@/components/pages/payment/export-invoice-pdf";

const fixture = (overrides: Partial<InvoicePdfData> = {}): InvoicePdfData => ({
	invoice: {
		invoiceNumber: "INV-20260623-000042",
		date: "2026-06-23T00:00:00.000Z",
		dueDate: "2026-07-23T00:00:00.000Z",
		customerName: "Ahmad Firdaus",
		paymentMode: "bank_transfer",
		totalAmount: 30000,
		amountPaid: 10000,
		status: "partially_paid",
		...overrides.invoice,
	},
	items: overrides.items ?? [
		{
			description: "3-Month Membership",
			quantity: 1,
			unitPrice: 28000,
			totalPrice: 28000,
		},
		{
			description: "SST",
			quantity: 1,
			unitPrice: 2000,
			totalPrice: 2000,
			taxRateCode: "SST-6",
		},
	],
});

describe("buildInvoiceDoc", () => {
	it("produces a valid PDF document with itemised lines", async () => {
		const doc = await buildInvoiceDoc(fixture());
		const dataUri = doc.output("datauristring");
		expect(dataUri.startsWith("data:application/pdf")).toBe(true);
		// Raw bytes must carry the PDF magic header.
		expect(doc.output()).toMatch(/^%PDF-/);
		expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
	});

	it("renders without throwing when there are no line items", async () => {
		const doc = await buildInvoiceDoc(fixture({ items: [] }));
		expect(doc.output()).toMatch(/^%PDF-/);
	});

	it("tolerates a null amountPaid (balance = total)", async () => {
		const data = fixture();
		data.invoice.amountPaid = null;
		const doc = await buildInvoiceDoc(data);
		expect(doc.output()).toMatch(/^%PDF-/);
	});
});
