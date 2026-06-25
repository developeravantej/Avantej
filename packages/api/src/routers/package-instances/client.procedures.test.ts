/**
 * package-instances client procedures — togglePin.
 *
 * Proves the oRPC layer over togglePackagePin: clientId is bound from the
 * session (never input — the input schema has no clientId field, so a caller
 * structurally cannot pin another user's package), ownership is enforced, and
 * the unauthenticated path is rejected. The pin/unpin/switch logic itself is
 * covered by package-instance.service unit tests; here we test the wrapper.
 */

import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";
import { packageInstancesClientProcedures } from "./client.procedures";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PKG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_USER = "user-test-1"; // matches createMockContext default session

// Minimal tenantDb whose transaction runs togglePackagePin's fluent chain:
//   tx.select().from().where().for("update")        → [pkg] | []
//   tx.update().set().where().returning()           → [row]
//   tx.update().set().where()  (awaited, no returning) → undefined
function makeTenantDb(pkg: unknown, returningRow: unknown) {
	const tx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: () => Promise.resolve(pkg ? [pkg] : []),
				}),
			}),
		}),
		update: () => ({
			set: () => ({
				where: () => ({
					returning: () => Promise.resolve(returningRow ? [returningRow] : []),
					then: (resolve: (v: unknown) => unknown) => resolve(undefined),
				}),
			}),
		}),
	};
	// biome-ignore lint/suspicious/noExplicitAny: loose test stub
	return {
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
	} as any;
}

describe("packageInstances.togglePin", () => {
	it("pins the caller's OWN active package (clientId resolved from session)", async () => {
		const pinnedAt = new Date("2026-05-13T10:00:00Z");
		const ctx = createMockContext({
			tenantDb: makeTenantDb(
				{
					id: PKG_ID,
					clientId: SESSION_USER,
					status: "active",
					pinnedAt: null,
				},
				{ id: PKG_ID, pinnedAt },
			),
		});

		const res = await call(
			packageInstancesClientProcedures.togglePin,
			{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
			{ context: ctx },
		);

		expect(res).toEqual({ id: PKG_ID, pinnedAt });
	});

	it("cannot pin another user's package → FORBIDDEN", async () => {
		const ctx = createMockContext({
			tenantDb: makeTenantDb(
				{
					id: PKG_ID,
					clientId: "someone-else",
					status: "active",
					pinnedAt: null,
				},
				null,
			),
		});

		await expect(
			call(
				packageInstancesClientProcedures.togglePin,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toThrow(/Forbidden/i);
	});

	it("rejects a non-active package → BAD_REQUEST", async () => {
		const ctx = createMockContext({
			tenantDb: makeTenantDb(
				{
					id: PKG_ID,
					clientId: SESSION_USER,
					status: "expired",
					pinnedAt: null,
				},
				null,
			),
		});

		await expect(
			call(
				packageInstancesClientProcedures.togglePin,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toThrow(/active/i);
	});

	it("rejects when no session is present", async () => {
		const ctx = createMockContext({
			session: null,
			tenantDb: makeTenantDb(null, null),
		});

		await expect(
			call(
				packageInstancesClientProcedures.togglePin,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toThrow();
	});
});

// ---- packageInstances.getById — staff path branch-scope isolation ----

const SVC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IN_SCOPE_BRANCH = "node-root"; // matches createMockContext default accessibleNodeIds
const OUT_OF_SCOPE_BRANCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// tenantDb stub for getById: the procedure calls
//   getPackageInstanceById(tenantDb, id) → tenantDb.query.packageInstances.findFirst()
//   requirePermissionOrpc → hasPermission → tenantDb.query.roles.findFirst()
//     (returns undefined → admin fallback grants permission for the staff path)
//   (fix) tenantDb.query.services.findFirst()  → resolves service.branchId
// assignedTrainerId / preferredTrainerId left null so the enrichment selects are skipped.
function makeGetByIdDb(instance: unknown, service: unknown) {
	// biome-ignore lint/suspicious/noExplicitAny: loose test stub
	return {
		query: {
			roles: { findFirst: () => Promise.resolve(undefined) },
			packageInstances: {
				findFirst: () => Promise.resolve(instance ?? null),
			},
			services: {
				findFirst: () => Promise.resolve(service ?? null),
			},
		},
	} as any;
}

describe("packageInstances.getById", () => {
	it("staff caller for an out-of-scope service branch → FORBIDDEN", async () => {
		const ctx = createMockContext({
			// default member is role:"admin" → permission check bypasses;
			// default accessibleNodeIds is ["node-root"], which excludes OUT_OF_SCOPE_BRANCH.
			tenantDb: makeGetByIdDb(
				{
					id: PKG_ID,
					serviceId: SVC_ID,
					clientId: "someone-else", // not SESSION_USER → forces staff path
					assignedTrainerId: null,
					preferredTrainerId: null,
				},
				{ id: SVC_ID, branchId: OUT_OF_SCOPE_BRANCH },
			),
		});

		await expect(
			call(
				packageInstancesClientProcedures.getById,
				{ organizationId: ORG_ID, id: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("staff caller for an in-scope service branch → passes", async () => {
		const ctx = createMockContext({
			tenantDb: makeGetByIdDb(
				{
					id: PKG_ID,
					serviceId: SVC_ID,
					clientId: "someone-else",
					assignedTrainerId: null,
					preferredTrainerId: null,
				},
				{ id: SVC_ID, branchId: IN_SCOPE_BRANCH },
			),
		});

		const res = await call(
			packageInstancesClientProcedures.getById,
			{ organizationId: ORG_ID, id: PKG_ID },
			{ context: ctx },
		);

		expect(res.id).toBe(PKG_ID);
		expect(res.assignedTrainerName).toBeNull();
		expect(res.preferredTrainerName).toBeNull();
	});

	it("staff caller for an org-wide service (null branch) → passes", async () => {
		const ctx = createMockContext({
			tenantDb: makeGetByIdDb(
				{
					id: PKG_ID,
					serviceId: SVC_ID,
					clientId: "someone-else",
					assignedTrainerId: null,
					preferredTrainerId: null,
				},
				{ id: SVC_ID, branchId: null },
			),
		});

		const res = await call(
			packageInstancesClientProcedures.getById,
			{ organizationId: ORG_ID, id: PKG_ID },
			{ context: ctx },
		);

		expect(res.id).toBe(PKG_ID);
	});
});
