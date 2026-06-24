import { test, expect } from "@playwright/test";
import { rpc, getOrgId, testId } from "../_safe-mutation";

/**
 * UAT §7 — Offline payment-proof upload round-trip.
 *
 * Proves the R2 storage path end-to-end against the running worker's PROOFS_BUCKET
 * binding: upload a (tiny) image → it appears in listPaymentProofs → download
 * returns the exact same bytes. This is the path unit tests can't reach (the R2
 * put/get only runs inside the Worker).
 *
 * Teardown note: there is no delete-proof procedure, so the uploaded row persists.
 * It is test-prefixed (testId) and a 1×1 PNG, unique per run — safe to leave on the
 * dev test tenant. Add a deleteProof procedure to make this fully self-cleaning.
 */

// Minimal valid 1×1 transparent PNG.
const PNG_1x1_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.describe("§7 payment proof — R2 upload/list/download round-trip", () => {
	test("uploaded proof is stored in R2 and downloads byte-identical", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const packages = await rpc(page.request, "packageInstances/listAll", {
			organizationId,
			limit: 1,
		});
		const list = Array.isArray(packages) ? packages : (packages?.items ?? []);
		test.skip(
			list.length === 0,
			"no package instances in the test tenant to attach a proof to",
		);
		const packageInstanceId = list[0].id as string;

		const fileName = `${testId("proof")}.png`;
		const uploaded = await rpc(
			page.request,
			"packageInstances/uploadPaymentProof",
			{
				organizationId,
				packageInstanceId,
				fileName,
				contentType: "image/png",
				dataBase64: PNG_1x1_BASE64,
			},
		);
		expect(uploaded.id, "upload returns the proof row").toBeTruthy();
		expect(uploaded.r2Key).toContain(packageInstanceId);

		// It appears in the list for that package.
		const proofs = await rpc(
			page.request,
			"packageInstances/listPaymentProofs",
			{
				organizationId,
				packageInstanceId,
			},
		);
		const mine = (Array.isArray(proofs) ? proofs : []).find(
			(p: { id: string }) => p.id === uploaded.id,
		);
		expect(mine, "uploaded proof appears in listPaymentProofs").toBeTruthy();
		expect(mine.fileName).toBe(fileName);

		// Download returns the exact bytes we uploaded (R2 round-trip).
		const dl = await rpc(
			page.request,
			"packageInstances/downloadPaymentProof",
			{
				organizationId,
				proofId: uploaded.id,
			},
		);
		expect(dl.contentType).toBe("image/png");
		expect(dl.fileName).toBe(fileName);
		expect(dl.dataBase64, "downloaded bytes match the uploaded bytes").toBe(
			PNG_1x1_BASE64,
		);
	});

	test("a non-image upload is rejected with a typed 4xx", async ({ page }) => {
		const organizationId = getOrgId();
		const packages = await rpc(page.request, "packageInstances/listAll", {
			organizationId,
			limit: 1,
		});
		const list = Array.isArray(packages) ? packages : (packages?.items ?? []);
		test.skip(list.length === 0, "no package instances to test against");

		const res = await page.request.post(
			"/rpc/packageInstances/uploadPaymentProof",
			{
				data: {
					json: {
						organizationId,
						packageInstanceId: list[0].id,
						fileName: `${testId("bad")}.txt`,
						contentType: "text/plain",
						dataBase64: Buffer.from("not an image").toString("base64"),
					},
				},
			},
		);
		expect(
			res.status(),
			`unsupported type -> ${res.status()} (expected 4xx)`,
		).toBeGreaterThanOrEqual(400);
		expect(res.status()).toBeLessThan(500);
	});
});
