import { describe, it, expect } from "vitest";
import {
	buildAgreementDoc,
	type AgreementPdfData,
} from "@/components/pages/packages/export-agreement-pdf";

const base: AgreementPdfData = {
	serviceName: "3-Month Membership",
	customerName: "Ahmad Firdaus",
	totalPrice: 30000,
	taxAmount: 2000,
	creditsTotal: 12,
	startsAt: "2026-06-23T00:00:00.000Z",
	expiresAt: "2026-09-23T00:00:00.000Z",
	purchaseNumber: "PUR-0001",
	signature: null,
	signedAt: null,
};

describe("buildAgreementDoc", () => {
	it("renders an unsigned agreement as a valid PDF", async () => {
		const doc = await buildAgreementDoc(base);
		expect(doc.output()).toMatch(/^%PDF-/);
		expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
	});

	it("renders a signed agreement (typed name only)", async () => {
		const doc = await buildAgreementDoc({
			...base,
			signature: { signedName: "Ahmad Firdaus" },
			signedAt: "2026-06-25T10:00:00.000Z",
		});
		expect(doc.output()).toMatch(/^%PDF-/);
	});

	it("tolerates a malformed drawn-signature data URL without throwing", async () => {
		const doc = await buildAgreementDoc({
			...base,
			signature: {
				signedName: "Ahmad Firdaus",
				signatureDataUrl: "data:image/png;base64,not-real",
			},
			signedAt: "2026-06-25T10:00:00.000Z",
		});
		expect(doc.output()).toMatch(/^%PDF-/);
	});
});
