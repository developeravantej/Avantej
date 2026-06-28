/**
 * Tenant-isolation guard for package-instance read procedures.
 *
 * listPaymentProofs / downloadPaymentProof (payment-proof.procedures) and
 * getAgreement (agreement.procedures) all load a record keyed only by id and
 * return it. Without a branch check, a staffer scoped to branch X can read
 * another branch's proofs/agreement. These tests assert the procedure resolves
 * pkg → service.branchId and rejects an out-of-scope branch with NOT_FOUND
 * (not FORBIDDEN — avoids an enumeration oracle), while an in-scope / admin
 * caller still passes.
 */

import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";
import { packageInstancesPaymentProofProcedures } from "./payment-proof.procedures";
import { packageInstancesAgreementProcedures } from "./agreement.procedures";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PKG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROOF_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SERVICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const IN_SCOPE_BRANCH = "node-root"; // matches createMockContext default accessibleNodeIds
const OUT_OF_SCOPE_BRANCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/**
 * Minimal tenantDb covering every read the three procedures + the permission
 * check touch:
 *   query.roles.findFirst        → undefined  (admin fallback → permission granted)
 *   query.paymentProofs.findFirst → proof row (id, packageInstanceId, r2Key, ...)
 *   query.packageInstances.findFirst → pkg row (id, serviceId)
 *   query.services.findFirst     → service row (id, branchId)  ← branch under test
 * getAgreement reads its view-model via select()...innerJoin()...limit(); we
 * stub that fluent chain to return a single joined row carrying branchId.
 */
function makeTenantDb(branchId: string | null) {
	const proofRow = {
		id: PROOF_ID,
		packageInstanceId: PKG_ID,
		r2Key: `org/${ORG_ID}/pkg/${PKG_ID}/proof/${PROOF_ID}/receipt.png`,
		fileName: "receipt.png",
		contentType: "image/png",
		byteSize: 1234,
		uploadedBy: "user-test-1",
		notes: null,
		uploadedAt: new Date("2026-06-01T00:00:00Z"),
	};
	const pkgRow = { id: PKG_ID, serviceId: SERVICE_ID };
	const serviceRow = { id: SERVICE_ID, branchId };
	const agreementJoinRow = {
		id: PKG_ID,
		serviceName: "Body Massage 60min",
		branchId,
		customerName: "Ahmad Firdaus",
		totalPrice: 30000,
		taxAmount: 0,
		creditsTotal: 10,
		startsAt: new Date("2026-06-01T00:00:00Z"),
		expiresAt: new Date("2026-09-01T00:00:00Z"),
		purchaseNumber: "P-0001",
		eSignature: null,
		termsAgreedAt: null,
	};
	// biome-ignore lint/suspicious/noExplicitAny: loose test stub
	return {
		query: {
			roles: { findFirst: async () => undefined },
			paymentProofs: {
				findFirst: async () => proofRow,
				findMany: async () => [proofRow],
			},
			packageInstances: { findFirst: async () => pkgRow },
			services: { findFirst: async () => serviceRow },
		},
		// Fluent select chain used by getPackageAgreement and (newly) the
		// getAgreement branch resolution if it resolves via select; both paths
		// terminate at .limit() / .findFirst() above.
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => ({
						limit: async () => [agreementJoinRow],
					}),
				}),
			}),
		}),
	} as any;
}

describe("packageInstances payment-proof / agreement reads — branch isolation", () => {
	describe("listPaymentProofs", () => {
		it("rejects a proof whose package's service branch is out of scope → NOT_FOUND", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(OUT_OF_SCOPE_BRANCH),
			});
			await expect(
				call(
					packageInstancesPaymentProofProcedures.listPaymentProofs,
					{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
					{ context: ctx },
				),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("returns proofs when the service branch is in scope", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(IN_SCOPE_BRANCH),
			});
			const res = await call(
				packageInstancesPaymentProofProcedures.listPaymentProofs,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			);
			expect(Array.isArray(res)).toBe(true);
			expect(res).toHaveLength(1);
		});
	});

	describe("downloadPaymentProof", () => {
		it("rejects an out-of-scope service branch before streaming → NOT_FOUND", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(OUT_OF_SCOPE_BRANCH),
				// PROOFS_BUCKET deliberately omitted: a correct guard must reject
				// BEFORE touching object storage, so the bucket is never reached.
			});
			await expect(
				call(
					packageInstancesPaymentProofProcedures.downloadPaymentProof,
					{ organizationId: ORG_ID, proofId: PROOF_ID },
					{ context: ctx },
				),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("passes the branch guard for an in-scope branch (reaches storage)", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(IN_SCOPE_BRANCH),
				honoBindings: {},
			});
			// In scope → guard passes, execution proceeds to getBucket(); with no
			// PROOFS_BUCKET binding it then fails on storage config (proving the
			// branch check did NOT short-circuit an in-scope caller).
			await expect(
				call(
					packageInstancesPaymentProofProcedures.downloadPaymentProof,
					{ organizationId: ORG_ID, proofId: PROOF_ID },
					{ context: ctx },
				),
			).rejects.toThrow(/PROOFS_BUCKET|storage is not configured/i);
		});
	});

	describe("getAgreement", () => {
		it("rejects an out-of-scope service branch → NOT_FOUND", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(OUT_OF_SCOPE_BRANCH),
			});
			await expect(
				call(
					packageInstancesAgreementProcedures.getAgreement,
					{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
					{ context: ctx },
				),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("returns the agreement when the service branch is in scope", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(IN_SCOPE_BRANCH),
			});
			const res = await call(
				packageInstancesAgreementProcedures.getAgreement,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			);
			expect(res).toMatchObject({ packageInstanceId: PKG_ID });
		});

		it("admin with org-wide scope (empty accessibleNodeIds) still passes for an org-wide service (null branch)", async () => {
			const ctx = createMockContext({
				accessibleNodeIds: [],
				tenantDb: makeTenantDb(null),
			});
			const res = await call(
				packageInstancesAgreementProcedures.getAgreement,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			);
			expect(res).toMatchObject({ packageInstanceId: PKG_ID });
		});
	});
});
