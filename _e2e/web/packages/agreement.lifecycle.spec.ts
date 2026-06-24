import { test, expect } from "@playwright/test";
import { rpc, rpcRaw, getOrgId, testId } from "../_safe-mutation";

/**
 * UAT §2 — Package agreement e-sign.
 *
 * Proves the agreement contract end-to-end: getAgreement returns the view-model,
 * signAgreement persists the e-signature into package_instances (e_signature +
 * terms_agreed_at), and a signed agreement is immutable (re-sign → 409 CONFLICT).
 *
 * Teardown note: there is no un-sign procedure, so the signed package stays signed.
 * Signing is orthogonal to booking/credits, so this is low-impact on the dev test
 * tenant; the test signs the FIRST currently-unsigned package it finds.
 */
test.describe("§2 agreement — get, sign, immutability", () => {
	test("getAgreement returns the view-model, sign persists, re-sign is blocked", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const packages = await rpc(page.request, "packageInstances/listAll", {
			organizationId,
			limit: 25,
		});
		const list = Array.isArray(packages) ? packages : (packages?.items ?? []);
		test.skip(list.length === 0, "no package instances in the test tenant");

		// Read path: getAgreement shape on the first package.
		const first = await rpc(page.request, "packageInstances/getAgreement", {
			organizationId,
			packageInstanceId: list[0].id,
		});
		expect(first).toHaveProperty("serviceName");
		expect(first).toHaveProperty("customerName");
		expect(first).toHaveProperty("signedAt"); // null or a date

		// Find an unsigned package to exercise the sign + immutability path.
		let target: string | null = null;
		for (const p of list) {
			const ag = await rpc(page.request, "packageInstances/getAgreement", {
				organizationId,
				packageInstanceId: p.id,
			});
			if (!ag.signedAt) {
				target = p.id;
				break;
			}
		}
		test.skip(!target, "no unsigned package available to sign");

		const signedName = testId("signer").replace(/[^a-zA-Z0-9 -]/g, " ");
		const signed = await rpc(page.request, "packageInstances/signAgreement", {
			organizationId,
			packageInstanceId: target,
			signedName,
		});
		expect(signed.signedAt, "signAgreement stamps signedAt").toBeTruthy();
		expect(signed.signature?.signedName).toBe(signedName);

		// Re-fetch reflects the persisted signature.
		const after = await rpc(page.request, "packageInstances/getAgreement", {
			organizationId,
			packageInstanceId: target,
		});
		expect(after.signedAt).toBeTruthy();
		expect(after.signature?.signedName).toBe(signedName);

		// Immutability: re-signing a signed agreement is a typed 409 CONFLICT.
		const reSign = await rpcRaw(
			page.request,
			"packageInstances/signAgreement",
			{ organizationId, packageInstanceId: target, signedName: "Someone Else" },
		);
		expect(
			reSign.status(),
			`re-sign -> ${reSign.status()} (expected 409)`,
		).toBe(409);
	});
});
