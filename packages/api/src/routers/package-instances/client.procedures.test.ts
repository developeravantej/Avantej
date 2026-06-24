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
