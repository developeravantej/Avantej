import { describe, it, expect } from "vitest";
import {
	buildInvoiceDoc,
	type InvoiceBranchProfile,
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
	// Optional issuing-branch profile — omitted keeps the single-org fallback.
	branch: overrides.branch,
});

const branchProfile = (
	overrides: Partial<InvoiceBranchProfile> = {},
): InvoiceBranchProfile => ({
	branchNodeId: "node-bkk",
	branchName: "Bangkok Central",
	companyLegalName: "Bangkok Fitness Co Ltd",
	registrationNumber: "0105551234567",
	taxId: "TH-VAT-7788",
	address: "88 Sukhumvit Rd, Bangkok",
	currency: "THB",
	...overrides,
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

	it("falls back to the Avantej header and MYR currency with no branch", async () => {
		const doc = await buildInvoiceDoc(fixture({ branch: null }));
		const out = doc.output();
		expect(out).toContain("Avantej");
		// 30000 sen total renders in Ringgit, not a foreign currency.
		expect(out).toContain("RM 300.00");
		// No company/tax block is emitted for an orphan (branch-less) invoice.
		expect(out).not.toContain("Reg No:");
		expect(out).not.toContain("Tax ID:");
	});

	it("prints the issuing-branch company + tax block when a branch is present", async () => {
		const doc = await buildInvoiceDoc(fixture({ branch: branchProfile() }));
		const out = doc.output();
		expect(out).toContain("Bangkok Fitness Co Ltd");
		expect(out).toContain("88 Sukhumvit Rd, Bangkok");
		expect(out).toContain("Reg No: 0105551234567");
		expect(out).toContain("Tax ID: TH-VAT-7788");
		// The branch owns its currency (THB), not the hardcoded Ringgit.
		expect(out).toContain("THB");
		// The single-org fallback header must not leak in.
		expect(out).not.toContain("Avantej");
	});

	it("falls back to the branch name when no legal name is set", async () => {
		const doc = await buildInvoiceDoc(
			fixture({
				branch: branchProfile({
					companyLegalName: null,
					branchName: "Phuket Branch",
				}),
			}),
		);
		const out = doc.output();
		expect(out).toContain("Phuket Branch");
	});

	it("emits only the company/tax fields that are set", async () => {
		const doc = await buildInvoiceDoc(
			fixture({
				branch: branchProfile({
					registrationNumber: null,
					address: null,
					taxId: "TH-VAT-ONLY",
				}),
			}),
		);
		const out = doc.output();
		expect(out).toContain("Tax ID: TH-VAT-ONLY");
		expect(out).not.toContain("Reg No:");
	});
});
