import { formatPrice } from "@/lib/money";
import type { jsPDF } from "jspdf";

/**
 * Issuing-branch company/tax profile (WS3). Mirrors `InvoiceBranchProfile`
 * returned by `client.invoices.getDetail`. Null for orphan invoices with no
 * linked sales order — in which case the PDF falls back to the single-org
 * "Avantej" header and MYR currency.
 */
export interface InvoiceBranchProfile {
	branchNodeId: string;
	branchName: string | null;
	companyLegalName: string | null;
	registrationNumber: string | null;
	taxId: string | null;
	address: string | null;
	currency: string;
}

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
	/** Issuing-branch company/tax profile; null/absent → single-org fallback. */
	branch?: InvoiceBranchProfile | null;
}

const fmtDate = (d: string | Date | null): string => {
	if (!d) return "—";
	try {
		return new Date(d).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
};

/**
 * Render the issuing-branch company/tax lines beneath the header name and
 * return the vertical offset (pt) they consumed, so the caller can shift the
 * rest of the layout down. Returns 0 — and touches no doc state — when the
 * branch is absent or carries none of the fields, preserving the original
 * single-org layout byte-for-byte.
 */
function renderCompanyLines(
	doc: jsPDF,
	branch: InvoiceBranchProfile | null | undefined,
): number {
	const lines: string[] = [];
	if (branch?.address) lines.push(branch.address);
	if (branch?.registrationNumber)
		lines.push(`Reg No: ${branch.registrationNumber}`);
	if (branch?.taxId) lines.push(`Tax ID: ${branch.taxId}`);
	if (lines.length === 0) return 0;

	doc.setFontSize(9);
	doc.setFont("helvetica", "normal");
	doc.setTextColor(115);
	let dy = 0;
	for (const line of lines) {
		dy += 12;
		doc.text(line, 40, 50 + dy);
	}
	// Restore the state the header left active (bold, black) for the caller.
	doc.setFont("helvetica", "bold");
	doc.setTextColor(0);
	return dy;
}

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

	const { invoice, items, branch } = data;
	const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

	// Currency follows the issuing branch (THB/SGD/…); MYR when unknown.
	const currency = branch?.currency ?? "MYR";
	const money = (cents: number) => formatPrice(cents, currency);

	// Header — legal entity name (falls back to branch, then the platform org).
	const headerName = branch?.companyLegalName || branch?.branchName || orgName;
	doc.setFontSize(18);
	doc.setFont("helvetica", "bold");
	doc.text(headerName, 40, 50);

	// Company/tax profile block; shifts the rest of the header down by `dy`.
	const dy = renderCompanyLines(doc, branch);

	doc.setFontSize(13);
	doc.text("Invoice", 40, 70 + dy);

	doc.setFontSize(10);
	doc.setFont("helvetica", "normal");
	doc.setTextColor(115);
	doc.text(`Invoice No: ${invoice.invoiceNumber}`, 40, 90 + dy);
	doc.text(`Date: ${fmtDate(invoice.date)}`, 40, 104 + dy);
	doc.text(`Due: ${fmtDate(invoice.dueDate)}`, 40, 118 + dy);
	doc.text(`Bill To: ${invoice.customerName}`, 320, 90 + dy);
	doc.text(`Status: ${invoice.status}`, 320, 104 + dy);
	if (invoice.paymentMode) {
		doc.text(`Mode: ${invoice.paymentMode.replace(/_/g, " ")}`, 320, 118 + dy);
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
					money(it.unitPrice),
					money(it.totalPrice),
				])
			: [["(no itemised breakdown available)", "", "", ""]];

	autoTable(doc, {
		startY: 140 + dy,
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
	doc.text(`Total: ${money(invoice.totalAmount)}`, 40, finalY + 28);
	doc.setFont("helvetica", "normal");
	doc.text(`Paid: ${money(paid)}`, 40, finalY + 44);
	doc.text(`Balance Due: ${money(balance)}`, 40, finalY + 60);

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
