/**
 * Package Instances Router — unit tests for reject.
 *
 * reject requires admin role (role check is explicit in the handler,
 * NOT via requirePermission). Permission service is not called for it.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { packageInstancesRouter } from "./package-instances";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PKG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TRAINER_MEMBER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SERVICE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// Minimal pending package fixture
const makePkg = (overrides = {}) => ({
	id: PKG_ID,
	serviceId: SERVICE_ID,
	clientId: "client-1",
	status: "pending",
	...overrides,
});

const makeService = (overrides = {}) => ({
	id: SERVICE_ID,
	name: "PT Session",
	branchId: null,
	...overrides,
});

const makeTrainer = (overrides = {}) => ({
	id: TRAINER_MEMBER_ID,
	role: "trainer",
	status: "active",
	hierarchyScopeId: null,
	...overrides,
});

function makeTx() {
	const updateChain = {
		set: mock(() => updateChain),
		where: mock(() => updateChain),
		returning: mock(() =>
			Promise.resolve([{ id: PKG_ID, status: "cancelled" }]),
		),
	};
	const insertChain = {
		values: mock(() => ({ returning: mock(() => Promise.resolve([{}])) })),
	};
	return {
		update: mock(() => updateChain),
		insert: mock(() => insertChain),
	};
}

function makeDb(
	overrides: { pkg?: unknown; trainer?: unknown; service?: unknown } = {},
) {
	const tx = makeTx();
	return {
		query: {
			packageInstances: {
				findFirst: mock(() =>
					Promise.resolve(
						overrides.pkg !== undefined ? overrides.pkg : makePkg(),
					),
				),
			},
			members: {
				findFirst: mock(() =>
					Promise.resolve(
						overrides.trainer !== undefined ? overrides.trainer : makeTrainer(),
					),
				),
			},
			services: {
				findFirst: mock(() =>
					Promise.resolve(
						overrides.service !== undefined ? overrides.service : makeService(),
					),
				),
			},
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
		update: tx.update,
		insert: tx.insert,
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) =>
			cb({
				update: tx.update,
				insert: tx.insert,
			}),
		),
		select: mock(() => ({
			from: mock(() => ({ where: mock(() => Promise.resolve([])) })),
		})),
	} as unknown as never;
}

// ─── reject ──────────────────────────────────────────────────────────────────

describe("packageInstancesRouter.reject", () => {
	it("happy path: admin cancels a pending package", async () => {
		const updateChain = {
			set: mock(() => updateChain),
			where: mock(() => updateChain),
			returning: mock(() =>
				Promise.resolve([{ id: PKG_ID, status: "cancelled", clientId: null }]),
			),
		};
		const insertChain = {
			values: mock(() => ({ returning: mock(() => Promise.resolve([{}])) })),
		};
		const tenantDb = makeDb();
		(tenantDb as any).transaction = mock(
			async (cb: (tx: unknown) => Promise<unknown>) =>
				cb({
					update: mock(() => updateChain),
					insert: mock(() => insertChain),
				}),
		);

		const ctx = createMockContext({
			tenantDb,
			member: {
				id: "m-admin",
				userId: "u-admin",
				role: "admin",
				status: "active",
				hierarchyScopeId: null,
			},
			accessibleNodeIds: [],
		});

		const result = await call(
			packageInstancesRouter.reject,
			{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
			{ context: ctx },
		);
		expect(result).toMatchObject({ status: "cancelled" });
	});

	it("rejects with FORBIDDEN when caller is not admin", async () => {
		const ctx = createMockContext({
			tenantDb: makeDb(),
			member: {
				id: "m-staff",
				userId: "u-staff",
				role: "staff",
				status: "active",
				hierarchyScopeId: null,
			},
		});
		await expect(
			call(
				packageInstancesRouter.reject,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects with NOT_FOUND when package does not exist", async () => {
		const tenantDb = makeDb({ pkg: null });
		const ctx = createMockContext({
			tenantDb,
			member: {
				id: "m-admin",
				userId: "u-admin",
				role: "admin",
				status: "active",
				hierarchyScopeId: null,
			},
		});
		await expect(
			call(
				packageInstancesRouter.reject,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects with BAD_REQUEST when package is already active (not pending)", async () => {
		const tenantDb = makeDb({ pkg: makePkg({ status: "active" }) });
		const ctx = createMockContext({
			tenantDb,
			member: {
				id: "m-admin",
				userId: "u-admin",
				role: "admin",
				status: "active",
				hierarchyScopeId: null,
			},
		});
		await expect(
			call(
				packageInstancesRouter.reject,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects with FORBIDDEN when package service branch is outside accessible nodes", async () => {
		const tenantDb = makeDb({
			service: makeService({ branchId: "other-branch" }),
		});
		const ctx = createMockContext({
			tenantDb,
			member: {
				id: "m-admin",
				userId: "u-admin",
				role: "admin",
				status: "active",
				hierarchyScopeId: null,
			},
			accessibleNodeIds: ["my-branch"],
		});
		await expect(
			call(
				packageInstancesRouter.reject,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ─── confirmPayment (guard matrix) ────────────────────────────────────────────
// Covers the pre-transaction guards that return/throw before any DB mutation, so
// they exercise cleanly against the mock harness. The two mutation branches
// (single-payment mark-paid, installment delegation) are covered by integration /
// browser verification — they hit confirmInstallmentPayment + row-lock semantics
// that aren't worth brittle unit-mocking.

const confirmAdminCtx = (tenantDb: unknown) =>
	createMockContext({
		tenantDb,
		member: {
			id: "m-admin",
			userId: "u-admin",
			role: "admin",
			status: "active",
			hierarchyScopeId: null,
		},
		accessibleNodeIds: [],
	});

describe("packageInstancesRouter.confirmPayment", () => {
	it("rejects with NOT_FOUND when the package does not exist", async () => {
		const ctx = confirmAdminCtx(makeDb({ pkg: null }));
		await expect(
			call(
				packageInstancesRouter.confirmPayment,
				{
					organizationId: ORG_ID,
					packageInstanceId: PKG_ID,
					paymentMethod: "cash",
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rejects with BAD_REQUEST when the package is not a purchase", async () => {
		const ctx = confirmAdminCtx(
			makeDb({
				pkg: makePkg({ source: "assigned", paymentStatus: "pending" }),
			}),
		);
		await expect(
			call(
				packageInstancesRouter.confirmPayment,
				{
					organizationId: ORG_ID,
					packageInstanceId: PKG_ID,
					paymentMethod: "cash",
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("is idempotent: returns alreadyConfirmed when already paid", async () => {
		const ctx = confirmAdminCtx(
			makeDb({
				pkg: makePkg({
					source: "purchased",
					status: "pending",
					paymentStatus: "paid",
					installmentsPaid: 1,
				}),
			}),
		);
		const res = (await call(
			packageInstancesRouter.confirmPayment,
			{
				organizationId: ORG_ID,
				packageInstanceId: PKG_ID,
				paymentMethod: "cash",
			},
			{ context: ctx },
		)) as { alreadyConfirmed: boolean };
		expect(res.alreadyConfirmed).toBe(true);
	});

	it("rejects with BAD_REQUEST when the package is cancelled", async () => {
		const ctx = confirmAdminCtx(
			makeDb({
				pkg: makePkg({
					source: "purchased",
					status: "cancelled",
					paymentStatus: "pending",
				}),
			}),
		);
		await expect(
			call(
				packageInstancesRouter.confirmPayment,
				{
					organizationId: ORG_ID,
					packageInstanceId: PKG_ID,
					paymentMethod: "cash",
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("rejects stripe (gateway auto-confirms) with BAD_REQUEST", async () => {
		const ctx = confirmAdminCtx(
			makeDb({
				pkg: makePkg({
					source: "purchased",
					status: "pending",
					paymentStatus: "pending",
				}),
			}),
		);
		await expect(
			call(
				packageInstancesRouter.confirmPayment,
				{
					organizationId: ORG_ID,
					packageInstanceId: PKG_ID,
					paymentMethod: "stripe",
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

// ─── listAll (tenant-scope isolation) ─────────────────────────────────────────
// listAll must scope rows to the owning member's hierarchy_scope_id ∈ accessibleNodeIds
// (mirrors listMemberships). package_instances has no branchId column. A caller whose
// accessibleNodeIds do not cover the owning branch must get [] (no cross-tenant leak),
// and an empty accessibleNodeIds (non-admin) short-circuits to [].

const IN_SCOPE_NODE = "11111111-1111-4111-8111-111111111111";
const OUT_OF_SCOPE_NODE = "22222222-2222-4222-8222-222222222222";

// tenantDb whose `execute` returns the package row only if the SQL text references
// IN_SCOPE_NODE — emulating the WHERE m.hierarchy_scope_id = ANY(...) predicate the
// service builds from accessibleNodeIds.
function makeScopedListDb() {
	return {
		// Permission gate for the non-admin "staff" member: resolve a role with a
		// service_management:read role-permission so requirePermissionOrpc passes
		// and execution reaches the new scope predicate (the behaviour under test).
		query: {
			roles: {
				findFirst: mock(() =>
					Promise.resolve({ id: "role-staff", name: "staff", priority: 10 }),
				),
			},
			permissions: {
				findFirst: mock(() =>
					Promise.resolve({
						id: "perm-svc-read",
						resource: "service_management",
						action: "read",
					}),
				),
			},
			rolePermissions: {
				findFirst: mock(() => Promise.resolve({ id: "rp-1" })),
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: loose test stub
		execute: mock((q: { sql?: string } | any) => {
			const text = typeof q === "string" ? q : (q?.sql ?? JSON.stringify(q));
			const visible = text.includes(IN_SCOPE_NODE);
			return Promise.resolve({
				rows: visible
					? [
							{
								id: PKG_ID,
								client_id: "client-1",
								customer_name: "Ahmad",
								service_id: SERVICE_ID,
								status: "active",
								source: "purchased",
								created_at: new Date(),
								hierarchy_scope_id: IN_SCOPE_NODE,
							},
						]
					: [],
			});
		}),
		// fallback select chain in case the handler path is partially migrated
		select: mock(() => ({
			from: mock(() => ({
				where: mock(() => ({
					orderBy: mock(() => ({ limit: mock(() => Promise.resolve([])) })),
				})),
			})),
		})),
	} as unknown as never;
}

const cpDbNoUsers = {
	select: mock(() => ({
		from: mock(() => ({ where: mock(() => Promise.resolve([])) })),
	})),
};

const listAllCtx = (tenantDb: unknown, accessibleNodeIds: string[]) =>
	createMockContext({
		tenantDb,
		member: {
			id: "m-staff",
			userId: "u-staff",
			role: "staff",
			status: "active",
			hierarchyScopeId: IN_SCOPE_NODE,
		},
		accessibleNodeIds,
		honoBindings: { controlPanelDb: cpDbNoUsers },
	});

describe("packageInstancesRouter.listAll (tenant isolation)", () => {
	it("returns [] when the owning branch is outside the caller's accessibleNodeIds", async () => {
		const ctx = listAllCtx(makeScopedListDb(), [OUT_OF_SCOPE_NODE]);
		const result = (await call(
			packageInstancesRouter.listAll,
			{ organizationId: ORG_ID },
			{ context: ctx },
		)) as unknown[];
		expect(result).toHaveLength(0);
	});

	it("short-circuits to [] when accessibleNodeIds is empty (non-admin)", async () => {
		const ctx = listAllCtx(makeScopedListDb(), []);
		const result = (await call(
			packageInstancesRouter.listAll,
			{ organizationId: ORG_ID },
			{ context: ctx },
		)) as unknown[];
		expect(result).toHaveLength(0);
	});

	it("returns the row when the owning branch is in scope", async () => {
		const ctx = listAllCtx(makeScopedListDb(), [IN_SCOPE_NODE]);
		const result = (await call(
			packageInstancesRouter.listAll,
			{ organizationId: ORG_ID },
			{ context: ctx },
		)) as unknown as Array<{ id: string }>;
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(PKG_ID);
	});
});
