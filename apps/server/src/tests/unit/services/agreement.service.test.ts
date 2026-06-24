import { describe, test, expect, beforeEach } from "bun:test";
import {
	createMockTenantDb,
	selectChainResolving,
} from "../../helpers/db-mock.factory";

import {
	encodeSignature,
	decodeSignature,
	getPackageAgreement,
	signPackageAgreement,
	AgreementAlreadySignedError,
	type SignatureEnvelope,
} from "@avantej-core/services/agreement.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const PKG_ID = "11111111-0000-4000-8000-000000000001";

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// signPackageAgreement now uses a conditional UPDATE … WHERE terms_agreed_at IS
// NULL and inspects rowCount (atomic compare-and-set). The shared update mock
// resolves to { returning } with no rowCount, so configure update() per test to
// resolve to a result with the affected-row count we want to simulate.
function updateAffecting(rowCount: number) {
	return {
		set: () => ({ where: () => Promise.resolve({ rowCount }) }),
	};
}

// Joined row shape returned by getPackageAgreement's select(...).
function makeRow(over: Record<string, unknown> = {}) {
	return {
		id: PKG_ID,
		serviceName: "3-Month Membership",
		customerName: "Ahmad Firdaus",
		totalPrice: 30000,
		taxAmount: 2000,
		creditsTotal: 12,
		startsAt: new Date("2026-06-23T00:00:00Z"),
		expiresAt: new Date("2026-09-23T00:00:00Z"),
		purchaseNumber: "PUR-0001",
		eSignature: null as string | null,
		termsAgreedAt: null as Date | null,
		...over,
	};
}

describe("signature envelope encode/decode", () => {
	test("round-trips a name + drawn signature", () => {
		const sig: SignatureEnvelope = {
			signedName: "Ahmad Firdaus",
			signatureDataUrl: "data:image/png;base64,AAAA",
		};
		expect(decodeSignature(encodeSignature(sig))).toEqual(sig);
	});

	test("null raw → null", () => {
		expect(decodeSignature(null)).toBeNull();
	});

	test("tolerates a legacy plain-string signature", () => {
		expect(decodeSignature("Jane Doe")).toEqual({ signedName: "Jane Doe" });
	});
});

describe("getPackageAgreement", () => {
	test("maps the joined row and decodes the signature", async () => {
		const stored = encodeSignature({ signedName: "Ahmad Firdaus" });
		mockDb.select.mockReturnValueOnce(
			selectChainResolving([
				makeRow({ eSignature: stored, termsAgreedAt: new Date("2026-06-24Z") }),
			]),
		);

		const result = await getPackageAgreement(mockDb, PKG_ID);
		expect(result?.serviceName).toBe("3-Month Membership");
		expect(result?.signature).toEqual({ signedName: "Ahmad Firdaus" });
		expect(result?.signedAt).toBeInstanceOf(Date);
	});

	test("returns null when the package does not exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));
		expect(await getPackageAgreement(mockDb, PKG_ID)).toBeNull();
	});
});

describe("signPackageAgreement", () => {
	test("persists signature + timestamp on an unsigned agreement", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([makeRow()]));
		mockDb.update.mockReturnValueOnce(updateAffecting(1)); // 1 row signed

		const signedAt = new Date("2026-06-25T10:00:00Z");
		const result = await signPackageAgreement(
			mockDb,
			PKG_ID,
			{ signedName: "Ahmad Firdaus" },
			signedAt,
		);

		expect(result.signedAt).toBe(signedAt);
		expect(result.signature).toEqual({ signedName: "Ahmad Firdaus" });
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("rejects via the atomic guard when a concurrent sign already landed (TOCTOU)", async () => {
		// The row read as unsigned (early check passes), but between the read and
		// the conditional UPDATE another request signed it → 0 rows affected.
		mockDb.select.mockReturnValueOnce(selectChainResolving([makeRow()]));
		mockDb.update.mockReturnValueOnce(updateAffecting(0)); // lost the race

		await expect(
			signPackageAgreement(mockDb, PKG_ID, { signedName: "Racer" }),
		).rejects.toBeInstanceOf(AgreementAlreadySignedError);
		expect(mockDb.update).toHaveBeenCalledTimes(1); // it DID attempt the write
	});

	test("blocks re-signing an already-signed agreement", async () => {
		mockDb.select.mockReturnValueOnce(
			selectChainResolving([
				makeRow({
					eSignature: encodeSignature({ signedName: "Ahmad Firdaus" }),
					termsAgreedAt: new Date("2026-06-24Z"),
				}),
			]),
		);

		await expect(
			signPackageAgreement(mockDb, PKG_ID, { signedName: "Someone Else" }),
		).rejects.toBeInstanceOf(AgreementAlreadySignedError);
		expect(mockDb.update).not.toHaveBeenCalled();
	});

	test("throws when the package is missing", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));
		await expect(
			signPackageAgreement(mockDb, PKG_ID, { signedName: "X" }),
		).rejects.toThrow("not found");
	});
});
