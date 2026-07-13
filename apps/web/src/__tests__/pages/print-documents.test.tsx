/**
 * Render tests for the branded print documents
 * (zplan/2026-07-02_invoice-receipt-print).
 *
 * Pins the display rules the documents must uphold:
 * - reconciling invoices show the Subtotal/SST breakdown from the
 *   payment_items snapshot; non-reconciling (manual/legacy) invoices show a
 *   single total and NO fabricated SST line;
 * - installment sales take Paid to date / Balance due from the installment
 *   summary (premium-inclusive), never from the stale invoice.amountPaid;
 * - identity fallback: legal name when set, else org name;
 * - receipts render the snapshotted lines and the against-invoice reference.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceDocument } from "@/components/pages/payment/print/invoice-document";
import { ReceiptDocument } from "@/components/pages/payment/print/receipt-document";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ history: { back: vi.fn() } }),
}));

const identity = {
	orgName: "Test Fitness Franchise",
	legalName: "TEST FITNESS FRANCHISE SDN BHD",
	registrationNo: "1234567-X",
	address: "Lot 12, Jalan Metro 2, Kota Kinabalu",
	footerNote: null,
	logoDataUrl: null,
};

const item = (over: Record<string, unknown>) => ({
	id: crypto.randomUUID(),
	paymentId: "p1",
	itemType: "package",
	itemId: null,
	promotionId: null,
	taxRateId: null,
	taxRateBps: null,
	taxRateCode: null,
	description: "Item",
	quantity: 1,
	unitPrice: 0,
	totalPrice: 0,
	createdAt: new Date().toISOString(),
	...over,
});

const baseInvoice = {
	id: "inv1",
	invoiceNumber: "INV-20260702-000042",
	salesOrderId: "so1",
	paymentId: "p1",
	date: "2026-07-02T00:00:00.000Z",
	dueDate: null,
	customerId: "u1",
	customerName: "Imran Shah",
	createdBy: "u2",
	paymentMode: "cash",
	totalAmount: 162000,
	amountPaid: 162000,
	status: "paid",
	eInvoiceStatus: null,
	eInvoiceId: null,
	createdAt: "2026-07-02T00:00:00.000Z",
	updatedAt: "2026-07-02T00:00:00.000Z",
};

const goods = item({
	description: "Personal Training package — 6 sessions",
	quantity: 6,
	unitPrice: 25000,
	totalPrice: 150000,
});
const tax = item({
	itemType: "tax",
	description: "SST (8.00%)",
	taxRateBps: 800,
	taxRateCode: "SST8",
	unitPrice: 12000,
	totalPrice: 12000,
});

const baseData = {
	invoice: baseInvoice,
	items: [goods, tax],
	goodsItems: [goods],
	taxItems: [tax],
	discountItems: [],
	subtotalCents: 150000,
	reconciles: true,
	branchId: "b1",
	salesOrder: null,
	installmentSummary: null,
	identity,
	branch: { name: "MOVE ARA DAMANSARA", address: "Plaza Ttdi, B-1-12" },
	customer: {
		name: "Imran Shah",
		phone: "60122211655",
		email: "imran@test.my",
	},
	// biome-ignore lint/suspicious/noExplicitAny: fixture for a structurally-typed payload
} as any;

describe("InvoiceDocument", () => {
	test("reconciling invoice shows breakdown, totals, and identity", () => {
		render(<InvoiceDocument data={baseData} />);
		expect(screen.getAllByText("INV-20260702-000042").length).toBeGreaterThan(
			0,
		);
		// Header logo-fallback + FROM block both carry the legal name.
		expect(screen.getAllByText("TEST FITNESS FRANCHISE SDN BHD").length).toBe(
			2,
		);
		expect(screen.getByText("Reg. No. 1234567-X")).toBeInTheDocument();
		expect(screen.getByText("Subtotal (pre-tax)")).toBeInTheDocument();
		expect(screen.getByText("SST (8.00%)")).toBeInTheDocument();
		// Appears as both the Total and the Paid to date amounts.
		expect(screen.getAllByText("MYR 1,620.00").length).toBeGreaterThan(0);
		expect(screen.getByText("Fully paid")).toBeInTheDocument();
	});

	test("non-reconciling invoice suppresses the SST breakdown", () => {
		render(
			<InvoiceDocument
				data={{
					...baseData,
					reconciles: false,
					items: [],
					goodsItems: [],
					taxItems: [],
					subtotalCents: 0,
				}}
			/>,
		);
		expect(screen.queryByText("Subtotal (pre-tax)")).not.toBeInTheDocument();
		expect(screen.queryByText("SST (8.00%)")).not.toBeInTheDocument();
		expect(screen.getByText("Total")).toBeInTheDocument();
	});

	test("installment sale takes balance from the plan summary, not invoice.amountPaid", () => {
		render(
			<InvoiceDocument
				data={{
					...baseData,
					invoice: {
						...baseInvoice,
						status: "partially_paid",
						// Stale by design — must be ignored for installment sales.
						amountPaid: 54000,
					},
					installmentSummary: {
						planTotalCents: 170100, // premium-inclusive (> invoice total)
						paidToDateCents: 56700,
						paidCount: 1,
						totalCount: 3,
					},
				}}
			/>,
		);
		expect(screen.getByText("MYR 567.00")).toBeInTheDocument(); // paid to date
		expect(screen.getByText("MYR 1,134.00")).toBeInTheDocument(); // balance due
	});

	test("falls back to org name when no legal name is set", () => {
		render(
			<InvoiceDocument
				data={{ ...baseData, identity: { ...identity, legalName: null } }}
			/>,
		);
		expect(
			screen.getAllByText("Test Fitness Franchise").length,
		).toBeGreaterThan(0);
	});
});

describe("ReceiptDocument", () => {
	const receiptData = {
		receipt: {
			id: "r1",
			receiptNumber: "RCP-20260702-000001",
			invoiceId: "inv1",
			invoiceNumber: "INV-20260702-000042",
			branchId: "b1",
			date: "2026-07-02T00:00:00.000Z",
			customerId: "u1",
			customerName: "Imran Shah",
			totalAmount: 162000,
			lines: [
				{
					date: "2026-04-18T00:00:00.000Z",
					method: "other",
					reference: "Balance brought forward (Aoikumo)",
					amountCents: 162000,
				},
			],
			createdBy: "u2",
			createdAt: "2026-07-02T00:00:00.000Z",
			updatedAt: "2026-07-02T00:00:00.000Z",
		},
		invoiceStatus: "paid",
		identity,
		branch: { name: "MOVE ARA DAMANSARA", address: null },
		customer: { name: "Imran Shah", phone: null, email: null },
		// biome-ignore lint/suspicious/noExplicitAny: fixture for a structurally-typed payload
	} as any;

	test("renders lines, total received, and the against-invoice reference", () => {
		render(<ReceiptDocument data={receiptData} />);
		expect(screen.getAllByText("RCP-20260702-000001").length).toBeGreaterThan(
			0,
		);
		expect(screen.getAllByText("INV-20260702-000042").length).toBeGreaterThan(
			0,
		);
		expect(
			screen.getByText("Balance brought forward (Aoikumo)"),
		).toBeInTheDocument();
		expect(screen.getByText("Total received")).toBeInTheDocument();
		// Appears as both the line amount and the Total received amount.
		expect(screen.getAllByText("MYR 1,620.00").length).toBe(2);
		expect(screen.getByText("1 payment covered")).toBeInTheDocument();
	});
});
