import { describe, test, expect, beforeEach } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";

import {
	validateProofUpload,
	buildProofKey,
	recordPaymentProof,
	listPaymentProofs,
	packageInstanceExists,
	InvalidProofError,
	MAX_PROOF_BYTES,
} from "@avantej-core/services/payment-proof.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const PKG_ID = "11111111-0000-4000-8000-000000000001";
const ORG_ID = "22222222-0000-4000-8000-000000000002";

beforeEach(() => {
	mockDb = createMockTenantDb();
});

describe("validateProofUpload", () => {
	test("accepts a valid image", () => {
		expect(() =>
			validateProofUpload({ contentType: "image/png", byteSize: 1000 }),
		).not.toThrow();
	});

	test("accepts a PDF", () => {
		expect(() =>
			validateProofUpload({ contentType: "application/pdf", byteSize: 1000 }),
		).not.toThrow();
	});

	test("rejects an unsupported type", () => {
		expect(() =>
			validateProofUpload({ contentType: "text/html", byteSize: 1000 }),
		).toThrow(InvalidProofError);
	});

	test("rejects an empty file", () => {
		expect(() =>
			validateProofUpload({ contentType: "image/png", byteSize: 0 }),
		).toThrow(InvalidProofError);
	});

	test("rejects an oversize file", () => {
		expect(() =>
			validateProofUpload({
				contentType: "image/png",
				byteSize: MAX_PROOF_BYTES + 1,
			}),
		).toThrow(/too large/);
	});
});

describe("buildProofKey", () => {
	test("scopes by org + package + proof id and keeps the extension", () => {
		const key = buildProofKey({
			organizationId: ORG_ID,
			packageInstanceId: PKG_ID,
			proofId: "abcd",
			fileName: "receipt.png",
		});
		expect(key).toBe(`payment-proofs/${ORG_ID}/${PKG_ID}/abcd-receipt.png`);
	});

	test("sanitises unsafe characters in the filename", () => {
		const key = buildProofKey({
			organizationId: ORG_ID,
			packageInstanceId: PKG_ID,
			proofId: "abcd",
			fileName: "../../etc/pa ss wd.png",
		});
		expect(key).not.toContain("..");
		expect(key).not.toContain(" ");
		expect(key.endsWith(".png")).toBe(true);
	});
});

describe("packageInstanceExists", () => {
	test("true when the row is found", async () => {
		mockDb.query.packageInstances.findFirst.mockResolvedValueOnce({
			id: PKG_ID,
		});
		expect(await packageInstanceExists(mockDb, PKG_ID)).toBe(true);
	});
	test("false when missing", async () => {
		mockDb.query.packageInstances.findFirst.mockResolvedValueOnce(undefined);
		expect(await packageInstanceExists(mockDb, PKG_ID)).toBe(false);
	});
});

describe("recordPaymentProof / listPaymentProofs", () => {
	test("inserts and returns the metadata row", async () => {
		const row = {
			id: "p1",
			packageInstanceId: PKG_ID,
			r2Key: "k",
			fileName: "r.png",
			contentType: "image/png",
			byteSize: 10,
			uploadedBy: "u1",
			notes: null,
		};
		mockDb.insert.mockReturnValueOnce({
			values: () => ({ returning: () => Promise.resolve([row]) }),
		});

		const result = await recordPaymentProof(mockDb, {
			id: "p1",
			packageInstanceId: PKG_ID,
			r2Key: "k",
			fileName: "r.png",
			contentType: "image/png",
			byteSize: 10,
			uploadedBy: "u1",
		});
		expect(result.id).toBe("p1");
	});

	test("lists proofs for a package", async () => {
		mockDb.query.paymentProofs.findMany.mockResolvedValueOnce([
			{ id: "p1" },
			{ id: "p2" },
		]);
		const proofs = await listPaymentProofs(mockDb, PKG_ID);
		expect(proofs).toHaveLength(2);
	});
});
