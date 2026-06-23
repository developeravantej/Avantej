import type { jsPDF } from "jspdf";

/**
 * Agreement view-model returned by `client.packageInstances.getAgreement`.
 * Structural type (not an oRPC import) so the PDF builder is unit-testable with
 * hand-built fixtures.
 */
export interface AgreementPdfData {
	serviceName: string;
	customerName: string;
	totalPrice: number | null;
	taxAmount: number | null;
	creditsTotal: number;
	startsAt: string | Date;
	expiresAt: string | Date;
	purchaseNumber: string | null;
	signature: { signedName: string; signatureDataUrl?: string } | null;
	signedAt: string | Date | null;
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

/** Standard membership-agreement clauses. Kept inline (no template table yet). */
const CLAUSES = [
	"1. This agreement covers the package and credits detailed above for the validity period stated.",
	"2. Package credits are non-transferable and expire on the expiry date. Unused credits are not refundable except as required by law.",
	"3. Freezing, cancellation and refunds follow the centre's posted policies in force at the time of request.",
	"4. The member confirms they are medically fit to participate and will follow all centre safety rules.",
	"5. By signing below the member acknowledges they have read and agree to these terms.",
];

/**
 * Build the package-agreement PDF (pure — no DOM side effects, no download).
 * When the agreement is signed, the signer's name, timestamp and (if captured)
 * the drawn-signature image are rendered into the signature block.
 */
export async function buildAgreementDoc(
	data: AgreementPdfData,
	orgName = "Avantej",
): Promise<jsPDF> {
	const { jsPDF } = await import("jspdf");
	const autoTable = (await import("jspdf-autotable")).default;

	const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

	doc.setFontSize(18);
	doc.setFont("helvetica", "bold");
	doc.text(orgName, 40, 50);
	doc.setFontSize(13);
	doc.text("Membership / Package Agreement", 40, 70);

	doc.setFontSize(10);
	doc.setFont("helvetica", "normal");
	doc.setTextColor(115);
	doc.text(`Member: ${data.customerName}`, 40, 92);
	if (data.purchaseNumber) {
		doc.text(`Reference: ${data.purchaseNumber}`, 320, 92);
	}
	doc.setTextColor(0);

	const price = data.totalPrice ?? 0;
	const tax = data.taxAmount ?? 0;
	autoTable(doc, {
		startY: 108,
		head: [["Package Detail", "Value"]],
		body: [
			["Package", data.serviceName],
			["Credits", String(data.creditsTotal)],
			["Valid From", fmtDate(data.startsAt)],
			["Valid Until", fmtDate(data.expiresAt)],
			["Price", rm(price)],
			["Tax", rm(tax)],
			["Total", rm(price + tax)],
		],
		theme: "striped",
		headStyles: { fillColor: [10, 10, 10] },
		styles: { fontSize: 10 },
	});

	let y =
		(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
			?.finalY ?? 140;

	// Terms
	y += 28;
	doc.setFontSize(12);
	doc.setFont("helvetica", "bold");
	doc.text("Terms & Conditions", 40, y);
	doc.setFontSize(9);
	doc.setFont("helvetica", "normal");
	for (const clause of CLAUSES) {
		y += 16;
		const lines = doc.splitTextToSize(clause, 515) as string[];
		doc.text(lines, 40, y);
		y += (lines.length - 1) * 11;
	}

	// Signature block
	y += 36;
	doc.setDrawColor(180);
	doc.line(40, y, 260, y);
	doc.setFontSize(9);
	doc.setTextColor(115);
	doc.text("Member signature", 40, y + 12);
	doc.setTextColor(0);

	if (data.signature) {
		if (data.signature.signatureDataUrl) {
			try {
				doc.addImage(
					data.signature.signatureDataUrl,
					"PNG",
					40,
					y - 44,
					180,
					40,
				);
			} catch {
				// Bad image data — fall back to the typed name only.
			}
		}
		doc.setFontSize(11);
		doc.setFont("helvetica", "bold");
		doc.text(data.signature.signedName, 40, y - 6);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(9);
		doc.setTextColor(115);
		doc.text(`Signed: ${fmtDate(data.signedAt)}`, 40, y + 26);
		doc.setTextColor(0);
	} else {
		doc.setFontSize(9);
		doc.setTextColor(160);
		doc.text("(unsigned)", 40, y - 6);
		doc.setTextColor(0);
	}

	return doc;
}

/** Build the agreement PDF and trigger a browser download. */
export async function downloadAgreementDoc(
	data: AgreementPdfData,
	orgName?: string,
): Promise<void> {
	const doc = await buildAgreementDoc(data, orgName);
	const ref = data.purchaseNumber ?? "agreement";
	doc.save(`agreement-${ref}.pdf`);
}
