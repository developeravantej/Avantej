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
