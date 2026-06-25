/**
 * Refunds Router — unit tests for request, process, bulkApprove.
 *
 * Permission guard uses requirePermission directly (not the oRPC fast-path).
 * Admin fast-path: roles.findFirst → undefined → member.role === "admin" → grant.
 * Staff path: role priority 50 → permission table lookup fails → UNAUTHORIZED throw.
 *
 * Note: the router does NOT wrap requirePermission in try/catch — permission
 * denial throws ORPCError("UNAUTHORIZED") because requirePermission throws
 * a plain Error that propagates up to the @orpc/server call machinery and
 * becomes an INTERNAL_SERVER_ERROR unless it's an ORPCError. Actually the
 * handler calls requirePermission without catch, so a plain Error bubble up
 * as INTERNAL_SERVER_ERROR. Tests verify the non-admin path errors out.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { refundsRouter } from "./refunds";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REFUND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SALES_ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAYMENT_ID = "dddddddd-dddd-4ddd-4ddd-dddddddddddd";

const LOW_PRIORITY_ROLE = { id: "role-staff", name: "staff", priority: 50 };

const REFUND_ROW = {
	id: REFUND_ID,
	status: "pending",
	amountCents: 5000,
	taxAmountCents: 0,
	reason: "Customer changed mind",
	salesOrderId: SALES_ORDER_ID,
	paymentId: null,
	packageInstanceId: null,
	customerId: null,
	customerName: null,
	branchId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

function makeAdminDb(overrides: Record<string, unknown> = {}) {
	const selectChain = {
		from: mock(() => selectChain),
		where: mock(() => selectChain),
		orderBy: mock(() => selectChain),
		limit: mock(() => selectChain),
		leftJoin: mock(() => selectChain),
		then: (resolve: (v: unknown) => unknown) =>
			Promise.resolve([]).then(resolve),
	};
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			refunds: {
				findFirst: mock(() => Promise.resolve(REFUND_ROW)),
				findMany: mock(() => Promise.resolve([REFUND_ROW])),
				...((overrides.refunds as object) ?? {}),
			},
			salesOrders: {
				findFirst: mock(() =>
					Promise.resolve({
						id: SALES_ORDER_ID,
						totalAmountCents: 5000,
						cancelledAmount: 0,
					}),
				),
				...((overrides.salesOrders as object) ?? {}),
			},
			payments: {
				findFirst: mock(() => Promise.resolve(null)),
				...((overrides.payments as object) ?? {}),
			},
		},
		insert: mock(() => ({
			values: mock(() => ({
				returning: mock(() => Promise.resolve([REFUND_ROW])),
			})),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({
					returning: mock(() =>
						Promise.resolve([{ ...REFUND_ROW, status: "processed" }]),
					),
				})),
			})),
		})),
		delete: mock(() => ({ where: mock(() => Promise.resolve([])) })),
		select: mock(() => selectChain),
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => {
			// Pass a tx that mirrors the outer db for most methods
			const txUpdate = {
				set: mock(() => txUpdate),
				where: mock(() => txUpdate),
				returning: mock(() => Promise.resolve([REFUND_ROW])),
			};
			const txInsert = {
				values: mock(() => ({ returning: mock(() => Promise.resolve([{}])) })),
			};
			return cb({
				update: mock(() => txUpdate),
				insert: mock(() => txInsert),
				select: mock(() => selectChain),
				query: {
					refunds: { findFirst: mock(() => Promise.resolve(REFUND_ROW)) },
					salesOrders: {
						findFirst: mock(() =>
							Promise.resolve({
								id: SALES_ORDER_ID,
								totalAmountCents: 5000,
								cancelledAmount: 0,
							}),
						),
					},
					payments: { findFirst: mock(() => Promise.resolve(null)) },
				},
			});
		}),
	} as unknown as never;
}

function makeStaffDb() {
	const selectChain = {
		from: mock(() => selectChain),
		where: mock(() => selectChain),
		limit: mock(() => selectChain),
		then: (resolve: (v: unknown) => unknown) =>
			Promise.resolve([]).then(resolve),
	};
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(LOW_PRIORITY_ROLE)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			refunds: { findFirst: mock(() => Promise.resolve(null)) },
		},
		insert: mock(() => ({
			values: mock(() => ({ returning: mock(() => Promise.resolve([])) })),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ returning: mock(() => Promise.resolve([])) })),
			})),
		})),
		select: mock(() => selectChain),
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
	} as unknown as never;
}

// ─── request ─────────────────────────────────────────────────────────────────

describe("refundsRouter.request", () => {
	const validInput = {
		organizationId: ORG_ID,
		salesOrderId: SALES_ORDER_ID,
		amountCents: 5000,
		reason: "Customer changed mind",
		// Supply customer info so the service doesn't have to auto-derive it
		customerId: "cust-1",
		customerName: "John Doe",
	};

	it("happy path: creates a pending refund", async () => {
		const tenantDb = makeAdminDb();
		// Ensure the transaction's salesOrders query also returns customer info
		(tenantDb as any).transaction = mock(
			async (cb: (tx: unknown) => Promise<unknown>) => {
				const txUpdate = {
					set: mock(() => txUpdate),
					where: mock(() => txUpdate),
					returning: mock(() => Promise.resolve([REFUND_ROW])),
				};
				// Generic chainable select: supports .from().where() → resolves to arr
				function makeSelectChain(arr: unknown[]) {
					const c: Record<string, unknown> = {};
					for (const m of [
						"from",
						"where",
						"orderBy",
						"limit",
						"leftJoin",
						"groupBy",
						"having",
					]) {
						c[m] = mock(() => c);
					}
					c.then = (resolve: (v: unknown) => unknown) =>
						Promise.resolve(arr).then(resolve);
					return c;
				}
				return cb({
					update: mock(() => txUpdate),
					// insert for refunds table → returning the inserted row
					insert: mock(() => ({
						values: mock(() => ({
							returning: mock(() => Promise.resolve([REFUND_ROW])),
						})),
					})),
					// computeRemainingBySalesOrder uses tx.select(...).from(refunds).where(...) → [{total: null}]
					select: mock(() => makeSelectChain([{ total: null }])),
					query: {
						salesOrders: {
							findFirst: mock(() =>
								Promise.resolve({
									id: SALES_ORDER_ID,
									customerId: "cust-1",
									customerName: "John Doe",
									branchId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
									totalAmount: 5000,
									cancelledAmount: 0,
									status: "pending",
								}),
							),
						},
						payments: { findFirst: mock(() => Promise.resolve(null)) },
						packageInstances: { findFirst: mock(() => Promise.resolve(null)) },
						refunds: { findFirst: mock(() => Promise.resolve(null)) },
					},
				});
			},
		);
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		const result = await call(refundsRouter.request, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: REFUND_ID });
	});

	it("throws when tenantDb is null", async () => {
		const ctx = createMockContext({ tenantDb: null });
		await expect(
			call(refundsRouter.request, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("throws when member is null", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb(), member: null });
		await expect(
			call(refundsRouter.request, validInput, { context: ctx }),
		).rejects.toBeDefined();
	});

	it("throws when caller lacks refund_management:create permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: {
				id: "m1",
				userId: "u1",
				role: "staff",
				status: "active",
				hierarchyScopeId: null,
			},
		});
		await expect(
			call(refundsRouter.request, validInput, { context: ctx }),
		).rejects.toBeDefined();
	});

	it("validates amountCents must be positive (0 is rejected)", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(
				refundsRouter.request,
				{ ...validInput, amountCents: 0 },
				{ context: ctx },
			),
		).rejects.toBeDefined();
	});

	it("validates reason must not be empty", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(
				refundsRouter.request,
				{ ...validInput, reason: "" },
				{ context: ctx },
			),
		).rejects.toBeDefined();
	});
});

// ─── process ─────────────────────────────────────────────────────────────────

describe("refundsRouter.process", () => {
	const validInput = {
		organizationId: ORG_ID,
		id: REFUND_ID,
		refundMethod: "cash" as const,
	};

	it("happy path: marks an approved refund as processed", async () => {
		const approvedRefund = {
			...REFUND_ROW,
			status: "approved",
			salesOrderId: null,
		};
		const processedRow = { ...approvedRefund, status: "processed" };

		const txUpdate = {
			set: mock(() => txUpdate),
			where: mock(() => txUpdate),
			returning: mock(() => Promise.resolve([processedRow])),
		};

		// Build a chainable select that also supports .for("update")
		function makeSelectChain(resolveWith: unknown[]) {
			const chain: Record<string, unknown> = {};
			const methods = ["from", "where", "orderBy", "limit", "leftJoin"];
			for (const m of methods) {
				chain[m] = mock(() => chain);
			}
			// .for("update") is needed by processRefund
			chain.for = mock(() => chain);
			chain.then = (resolve: (v: unknown) => unknown) =>
				Promise.resolve(resolveWith).then(resolve);
			return chain;
		}

		const tenantDb = makeAdminDb();
		(tenantDb as any).transaction = mock(
			async (cb: (tx: unknown) => Promise<unknown>) =>
				cb({
					update: mock(() => txUpdate),
					insert: mock(() => ({
						values: mock(() => ({
							returning: mock(() => Promise.resolve([{}])),
						})),
					})),
					// processRefund does: tx.select().from(refunds).where(...).for("update")
					select: mock(() => makeSelectChain([approvedRefund])),
					query: {},
				}),
		);

		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		const result = await call(refundsRouter.process, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ status: "processed" });
	});

	it("throws when tenantDb is null", async () => {
		const ctx = createMockContext({ tenantDb: null });
		await expect(
			call(refundsRouter.process, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("throws when caller lacks refund_management:process permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: {
				id: "m1",
				userId: "u1",
				role: "staff",
				status: "active",
				hierarchyScopeId: null,
			},
		});
		await expect(
			call(refundsRouter.process, validInput, { context: ctx }),
		).rejects.toBeDefined();
	});

	it("validates refundMethod enum — rejects unknown method", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(
				refundsRouter.process,
				{ ...validInput, refundMethod: "bitcoin" as never },
				{ context: ctx },
			),
		).rejects.toBeDefined();
	});
});

// ─── bulkApprove ─────────────────────────────────────────────────────────────

describe("refundsRouter.bulkApprove", () => {
	const validInput = {
		organizationId: ORG_ID,
		items: [{ id: REFUND_ID }],
	};

	it("happy path: returns per-id results array", async () => {
		const pendingRefund = { ...REFUND_ROW, status: "pending" };
		const tenantDb = makeAdminDb({
			refunds: { findFirst: mock(() => Promise.resolve(pendingRefund)) },
		});
		(tenantDb as any).transaction = mock(
			async (cb: (tx: unknown) => Promise<unknown>) => {
				const txUpdate = {
					set: mock(() => txUpdate),
					where: mock(() => txUpdate),
					returning: mock(() =>
						Promise.resolve([{ ...pendingRefund, status: "approved" }]),
					),
				};
				return cb({
					update: mock(() => txUpdate),
					insert: mock(() => ({
						values: mock(() => ({
							returning: mock(() => Promise.resolve([{}])),
						})),
					})),
					query: {
						refunds: { findFirst: mock(() => Promise.resolve(pendingRefund)) },
						salesOrders: { findFirst: mock(() => Promise.resolve(null)) },
						payments: { findFirst: mock(() => Promise.resolve(null)) },
					},
				});
			},
		);

		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		const result = await call(refundsRouter.bulkApprove, validInput, {
			context: ctx,
		});
		expect(Array.isArray(result)).toBe(true);
	});

	it("throws when tenantDb is null", async () => {
		const ctx = createMockContext({ tenantDb: null });
		await expect(
			call(refundsRouter.bulkApprove, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("throws when caller lacks refund_management:approve permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: {
				id: "m1",
				userId: "u1",
				role: "staff",
				status: "active",
				hierarchyScopeId: null,
			},
		});
		await expect(
			call(refundsRouter.bulkApprove, validInput, { context: ctx }),
		).rejects.toBeDefined();
	});

	it("validates items must have at least 1 entry", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(
				refundsRouter.bulkApprove,
				{ ...validInput, items: [] },
				{ context: ctx },
			),
		).rejects.toBeDefined();
	});

	it("validates items cannot exceed 50", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		const oversized = Array.from({ length: 51 }, (_, i) => ({
			id: `${i.toString().padStart(8, "0")}-0000-4000-8000-000000000000`,
		}));
		await expect(
			call(
				refundsRouter.bulkApprove,
				{ organizationId: ORG_ID, items: oversized },
				{ context: ctx },
			),
		).rejects.toBeDefined();
	});
});

// ─── getById ─────────────────────────────────────────────────────────────────

describe("refundsRouter.getById", () => {
	const OUT_OF_SCOPE_BRANCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
	const IN_SCOPE_BRANCH = "ffffffff-ffff-4fff-8fff-ffffffffffff";
	const validInput = { organizationId: ORG_ID, id: REFUND_ID };

	it("throws FORBIDDEN when the refund's branchId is not in accessibleNodeIds", async () => {
		const outOfScopeRefund = { ...REFUND_ROW, branchId: OUT_OF_SCOPE_BRANCH };
		const tenantDb = makeAdminDb({
			refunds: { findFirst: mock(() => Promise.resolve(outOfScopeRefund)) },
		});
		// Caller can reach IN_SCOPE_BRANCH only — not the refund's branch.
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(refundsRouter.getById, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns the refund when its branchId is in accessibleNodeIds", async () => {
		const inScopeRefund = { ...REFUND_ROW, branchId: IN_SCOPE_BRANCH };
		const tenantDb = makeAdminDb({
			refunds: { findFirst: mock(() => Promise.resolve(inScopeRefund)) },
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		const result = await call(refundsRouter.getById, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: REFUND_ID, branchId: IN_SCOPE_BRANCH });
	});

	it("returns an org-wide refund (null branchId) even with no accessible nodes", async () => {
		// REFUND_ROW.branchId is null → org-wide → guard is a no-op.
		const tenantDb = makeAdminDb();
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		const result = await call(refundsRouter.getById, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: REFUND_ID });
	});
});
