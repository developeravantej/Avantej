import type { jsPDF } from "jspdf";

/**
 * Invoice + line-item payload returned by `client.invoices.getDetail`. Kept as a
 * structural type (not an oRPC import) so the pure PDF builder is trivially
 * unit-testable with hand-built fixtures.
 */
export interface InvoicePdfData {
	invoice: {
		invoiceNumber: string;
		date: string | Date | null;
		dueDate: string | Date | null;
		customerName: string;
		paymentMode: string | null;
		totalAmount: number;
		amountPaid: number | null;
		status: string;
	};
	items: Array<{
		description: string;
		quantity: number;
		unitPrice: number;
		totalPrice: number;
		taxRateCode?: string | null;
	}>;
}

const rm = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

const fmtDate = (d: string | Date | null): string => {
	if (!d) return "—";
	try {
		return new Date(d).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
};

/**
 * Build the invoice PDF document (pure — no DOM side effects, no download).
 * Mirrors the layout language of reports/export-pdf.ts (A4 portrait, pt units,
 * helvetica, striped autoTable). Returns the jsPDF doc so callers can either
 * `.save()` it (download) or `.output()` it (tests / future server reuse).
 */
export async function buildInvoiceDoc(
	data: InvoicePdfData,
	orgName = "Avantej",
): Promise<jsPDF> {
	const { jsPDF } = await import("jspdf");
	const autoTable = (await import("jspdf-autotable")).default;

	const { invoice, items } = data;
	const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

	// Header
	doc.setFontSize(18);
	doc.setFont("helvetica", "bold");
	doc.text(orgName, 40, 50);
	doc.setFontSize(13);
	doc.text("Invoice", 40, 70);

	doc.setFontSize(10);
	doc.setFont("helvetica", "normal");
	doc.setTextColor(115);
	doc.text(`Invoice No: ${invoice.invoiceNumber}`, 40, 90);
	doc.text(`Date: ${fmtDate(invoice.date)}`, 40, 104);
	doc.text(`Due: ${fmtDate(invoice.dueDate)}`, 40, 118);
	doc.text(`Bill To: ${invoice.customerName}`, 320, 90);
	doc.text(`Status: ${invoice.status}`, 320, 104);
	if (invoice.paymentMode) {
		doc.text(`Mode: ${invoice.paymentMode.replace(/_/g, " ")}`, 320, 118);
	}
	doc.setTextColor(0);

	// Line items
	const itemRows =
		items.length > 0
			? items.map((it) => [
					it.taxRateCode
						? `${it.description} (${it.taxRateCode})`
						: it.description,
					String(it.quantity),
					rm(it.unitPrice),
					rm(it.totalPrice),
				])
			: [["(no itemised breakdown available)", "", "", ""]];

	autoTable(doc, {
		startY: 140,
		head: [["Description", "Qty", "Unit Price", "Amount"]],
		body: itemRows,
		theme: "striped",
		headStyles: { fillColor: [10, 10, 10] },
		styles: { fontSize: 10 },
		columnStyles: {
			1: { halign: "right" },
			2: { halign: "right" },
			3: { halign: "right" },
		},
	});

	const finalY =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
			?.finalY ?? 160;

	// Totals
	const paid = invoice.amountPaid ?? 0;
	const balance = invoice.totalAmount - paid;
	doc.setFontSize(11);
	doc.setFont("helvetica", "bold");
	doc.text(`Total: ${rm(invoice.totalAmount)}`, 40, finalY + 28);
	doc.setFont("helvetica", "normal");
	doc.text(`Paid: ${rm(paid)}`, 40, finalY + 44);
	doc.text(`Balance Due: ${rm(balance)}`, 40, finalY + 60);

	return doc;
}

/** Build the invoice PDF and trigger a browser download. */
export async function downloadInvoiceDoc(
	data: InvoicePdfData,
	orgName?: string,
): Promise<void> {
	const doc = await buildInvoiceDoc(data, orgName);
	doc.save(`invoice-${data.invoice.invoiceNumber}.pdf`);
}
