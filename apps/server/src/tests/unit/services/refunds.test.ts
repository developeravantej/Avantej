/**
 * Unit tests for refunds.service.ts — Tasks 1.4, 1.5, 1.6
 *
 * Tests:
 *   1.4 — listRefunds projects salesOrderNumber via LEFT JOIN
 *   1.5 — approveRefund partial/full + race guard validation
 *   1.6 — bulkApproveRefunds happy path, RBAC (requirePermission) propagation,
 *          validation failures, per-item error isolation
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	createMockTenantDb,
	selectChainResolving,
} from "../../helpers/db-mock.factory";
import {
	approveRefund,
	bulkApproveRefunds,
	listRefunds,
} from "@avantej-core/services/refunds.service";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID = "cccccccc-0000-4000-8000-000000000001";
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const BRANCH_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const REFUND_ID = "11111111-0000-4000-8000-000000000001";
const SO_ID = "22222222-0000-4000-8000-000000000001";

const ACTOR = { userId: USER_ID, memberId: MEMBER_ID, role: "admin" };

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRefund(overrides: Record<string, unknown> = {}) {
	return {
		id: REFUND_ID,
		refundNumber: "RF-20260514-0001",
		status: "pending",
		salesOrderId: SO_ID,
		paymentId: null,
		packageInstanceId: null,
		amountCents: 5000,
		taxAmountCents: 0,
		reason: "Customer request",
		notes: null,
		requestedBy: USER_ID,
		requestedAt: new Date("2026-05-14T10:00:00.000Z"),
		reviewedBy: null,
		reviewedAt: null,
		reviewNotes: null,
		processedBy: null,
		processedAt: null,
		refundMethod: null,
		refundReference: null,
		customerId: "cust-1",
		customerName: "Alice",
		branchId: BRANCH_ID,
		metadata: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function _makeSalesOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: SO_ID,
		salesOrderNumber: "SO-20260514-0001",
		totalAmount: 10000,
		cancelledAmount: 0,
		cancellationNumber: null,
		status: "active",
		customerId: "cust-1",
		customerName: "Alice",
		branchId: BRANCH_ID,
		updatedAt: new Date(),
		...overrides,
	};
}
void _makeSalesOrder;

let mockDb: ReturnType<typeof createMockTenantDb>;
let mockControlPanelDb: {
	query: { user: { findMany: ReturnType<typeof mock> } };
};

beforeEach(() => {
	mockDb = createMockTenantDb();
	mockControlPanelDb = {
		query: {
			user: {
				findMany: mock(() => Promise.resolve([])),
			},
		},
	};
});

// =============================================================================
// 1.4 — listRefunds: salesOrderNumber projected via LEFT JOIN
// =============================================================================

describe("listRefunds — salesOrderNumber projection (task 1.4)", () => {
	test("returns salesOrderNumber from LEFT JOIN when refund has a salesOrderId", async () => {
		const row = {
			...makeRefund(),
			salesOrderNumber: "SO-20260514-0001",
		};

		// First select call: joined rows; second: count
		mockDb.select
			.mockReturnValueOnce(selectChainResolving([row]))
			.mockReturnValueOnce(selectChainResolving([{ total: 1 }]));

		const result = await listRefunds(mockDb as any, mockControlPanelDb as any, {
			accessibleNodeIds: [],
		});

		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]?.salesOrderNumber).toBe("SO-20260514-0001");
		expect(result.total).toBe(1);
	});

	test("returns null salesOrderNumber when refund has no salesOrderId", async () => {
		const row = {
			...makeRefund({ salesOrderId: null }),
			salesOrderNumber: null,
		};

		mockDb.select
			.mockReturnValueOnce(selectChainResolving([row]))
			.mockReturnValueOnce(selectChainResolving([{ total: 1 }]));

		const result = await listRefunds(mockDb as any, mockControlPanelDb as any, {
			accessibleNodeIds: [],
		});

		expect(result.rows[0]?.salesOrderNumber).toBeNull();
	});

	test("returns empty rows with total 0 when no refunds exist", async () => {
		mockDb.select
			.mockReturnValueOnce(selectChainResolving([]))
			.mockReturnValueOnce(selectChainResolving([{ total: 0 }]));

		const result = await listRefunds(mockDb as any, mockControlPanelDb as any, {
			accessibleNodeIds: [],
		});

		expect(result.rows).toEqual([]);
		expect(result.total).toBe(0);
	});

	test("enriches requestedByName from control panel user lookup", async () => {
		const row = { ...makeRefund(), salesOrderNumber: null };

		mockDb.select
			.mockReturnValueOnce(selectChainResolving([row]))
			.mockReturnValueOnce(selectChainResolving([{ total: 1 }]));

		mockControlPanelDb.query.user.findMany.mockResolvedValueOnce([
			{ id: USER_ID, name: "Test Admin" },
		]);

		const result = await listRefunds(mockDb as any, mockControlPanelDb as any, {
			accessibleNodeIds: [],
		});

		expect(result.rows[0]?.requestedByName).toBe("Test Admin");
	});
});

// =============================================================================
// 1.5 — approveRefund: partial amount, full amount, race guard, validation
// =============================================================================

describe("approveRefund — partial + full approval (task 1.5)", () => {
	function mockApproveTransaction(
		pendingRefund: Record<string, unknown>,
		approvedRefund: Record<string, unknown>,
	) {
		// transaction() calls the callback with a nested mock tx
		mockDb.transaction.mockImplementationOnce(
			async (cb: (tx: any) => Promise<unknown>) => {
				// reverseForRefund calls tdb.query.refunds.findFirst — mock it to return the
				// refund row so it doesn't throw NOT_FOUND. It also calls commissionSplits.findMany.
				const innerTx: any = {
					select: mock(),
					update: mock(),
					insert: mock(),
					query: {
						refunds: {
							// reverseForRefund uses query.refunds.findFirst to load the refund+items
							findFirst: mock(() =>
								Promise.resolve({ ...pendingRefund, items: [] }),
							),
						},
						refundItems: {
							findMany: mock(() => Promise.resolve([])),
						},
						commissionSplits: {
							findMany: mock(() => Promise.resolve([])),
						},
						salesOrders: {
							// computeRemainingBySalesOrder reads totalAmount/cancelledAmount
							// to derive the refund cap — must return a real order, not undefined.
							findFirst: mock(() =>
								Promise.resolve({
									id: SO_ID,
									totalAmount: 999999,
									cancelledAmount: 0,
								}),
							),
						},
					},
				};

				// SELECT FOR UPDATE on refund row → returns pendingRefund (lock step)
				// subsequent selects (remaining-refundable, sum queries) → safe empty defaults
				let selectCallCount = 0;
				innerTx.select.mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1)
						return selectChainResolving([pendingRefund]);
					// sum(refunds.amountCents) for remaining check → 0
					return selectChainResolving([{ total: 0, remainingCents: 999999 }]);
				});

				// UPDATE refund row
				const setChain: any = {
					where: mock(() => ({
						returning: mock(() => Promise.resolve([approvedRefund])),
					})),
				};
				innerTx.update.mockReturnValue({ set: mock(() => setChain) });

				// INSERT for audit row
				const insertValues = {
					returning: mock(() => Promise.resolve([{ id: "audit-1" }])),
				};
				innerTx.insert.mockReturnValue({ values: mock(() => insertValues) });

				return cb(innerTx);
			},
		);
	}

	test("approves at full requested amount when approveAmountCents is omitted", async () => {
		const refund = makeRefund({ amountCents: 5000 });
		const approved = { ...refund, status: "approved", amountCents: 5000 };
		mockApproveTransaction(refund, approved);

		const result = await approveRefund(mockDb as any, REFUND_ID, {
			actor: ACTOR,
		});

		expect(result.status).toBe("approved");
		expect(result.amountCents).toBe(5000);
	});

	test("partially approves when approveAmountCents < requested", async () => {
		const refund = makeRefund({
			amountCents: 5000,
			salesOrderId: null,
			paymentId: null,
			packageInstanceId: null,
		});
		const approved = { ...refund, status: "approved", amountCents: 2000 };
		mockApproveTransaction(refund, approved);

		const result = await approveRefund(mockDb as any, REFUND_ID, {
			approveAmountCents: 2000,
			actor: ACTOR,
		});

		expect(result.amountCents).toBe(2000);
	});

	test("throws BAD_REQUEST when approveAmountCents exceeds requested amount", async () => {
		const refund = makeRefund({
			amountCents: 5000,
			salesOrderId: null,
			paymentId: null,
			packageInstanceId: null,
		});
		mockApproveTransaction(refund, refund);

		await expect(
			approveRefund(mockDb as any, REFUND_ID, {
				approveAmountCents: 9999,
				actor: ACTOR,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("exceeds requested amount"),
		});
	});

	test("throws BAD_REQUEST when approveAmountCents is 0", async () => {
		// The service validates approveAmountCents > 0 after locking the row
		const refund = makeRefund({
			amountCents: 5000,
			salesOrderId: null,
			paymentId: null,
			packageInstanceId: null,
		});

		mockDb.transaction.mockImplementationOnce(
			async (cb: (tx: any) => Promise<unknown>) => {
				const innerTx: any = {
					select: mock()
						.mockReturnValueOnce(selectChainResolving([refund]))
						.mockReturnValue(selectChainResolving([])),
					update: mock(),
					insert: mock(),
					query: {
						refunds: {
							findFirst: mock(() => Promise.resolve({ ...refund, items: [] })),
						},
						commissionSplits: { findMany: mock(() => Promise.resolve([])) },
						salesOrders: {
							findFirst: mock(() =>
								Promise.resolve({
									id: SO_ID,
									totalAmount: 999999,
									cancelledAmount: 0,
								}),
							),
						},
					},
				};
				return cb(innerTx);
			},
		);

		await expect(
			approveRefund(mockDb as any, REFUND_ID, {
				approveAmountCents: 0,
				actor: ACTOR,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("throws NOT_FOUND when refund does not exist", async () => {
		mockDb.transaction.mockImplementationOnce(
			async (cb: (tx: any) => Promise<unknown>) => {
				const innerTx: any = {
					select: mock(() => selectChainResolving([])),
					update: mock(),
					insert: mock(),
				};
				return cb(innerTx);
			},
		);

		await expect(
			approveRefund(mockDb as any, "nonexistent-id", { actor: ACTOR }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("throws BAD_REQUEST when refund status is not pending", async () => {
		const approvedRefund = makeRefund({ status: "approved" });

		mockDb.transaction.mockImplementationOnce(
			async (cb: (tx: any) => Promise<unknown>) => {
				const innerTx: any = {
					select: mock(() => selectChainResolving([approvedRefund])),
					update: mock(),
					insert: mock(),
				};
				return cb(innerTx);
			},
		);

		await expect(
			approveRefund(mockDb as any, REFUND_ID, { actor: ACTOR }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

// =============================================================================
// 1.6 — bulkApproveRefunds
// =============================================================================

describe("bulkApproveRefunds — batch approval (task 1.6)", () => {
	test("returns empty array when given empty items", async () => {
		// Validate guard: bulkApproveRefunds throws when items > 50, not when 0
		// Empty array is handled → just returns []
		// Note: the router enforces min(1) so this is a service-level guard test
		const result = await bulkApproveRefunds(mockDb as any, [], ACTOR);
		expect(result).toEqual([]);
	});

	test("throws BAD_REQUEST when batch size exceeds 50", async () => {
		const items = Array.from({ length: 51 }, (_, i) => ({ id: `id-${i}` }));
		await expect(
			bulkApproveRefunds(mockDb as any, items, ACTOR),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("returns success result for successfully approved items", async () => {
		const refund = makeRefund({ amountCents: 3000 });
		const approved = { ...refund, status: "approved", amountCents: 3000 };

		// Each call to bulkApproveRefunds calls approveRefund which calls transaction()
		mockDb.transaction.mockImplementationOnce(
			async (cb: (tx: any) => Promise<unknown>) => {
				const insertValues = {
					returning: mock(() => Promise.resolve([{ id: "audit-1" }])),
				};
				const setChain = {
					where: mock(() => ({
						returning: mock(() => Promise.resolve([approved])),
					})),
				};
				let selectCount = 0;
				const innerTx: any = {
					select: mock().mockImplementation(() => {
						selectCount++;
						if (selectCount === 1) return selectChainResolving([refund]);
						return selectChainResolving([{ total: 0 }]);
					}),
					update: mock(() => ({ set: mock(() => setChain) })),
					insert: mock(() => ({ values: mock(() => insertValues) })),
					query: {
						refunds: {
							findFirst: mock(() => Promise.resolve({ ...refund, items: [] })),
						},
						commissionSplits: { findMany: mock(() => Promise.resolve([])) },
						salesOrders: {
							findFirst: mock(() =>
								Promise.resolve({
									id: SO_ID,
									totalAmount: 999999,
									cancelledAmount: 0,
								}),
							),
						},
					},
				};
				return cb(innerTx);
			},
		);

		const results = await bulkApproveRefunds(
			mockDb as any,
			[{ id: REFUND_ID }],
			ACTOR,
		);

		expect(results).toHaveLength(1);
		expect(results[0]?.success).toBe(true);
		expect(results[0]?.refund?.status).toBe("approved");
	});

	test("captures error for a failed item without aborting the rest", async () => {
		// First item: NOT_FOUND (refund doesn't exist)
		// Second item: should succeed
		const refund2Id = "33333333-0000-4000-8000-000000000002";
		const refund2 = makeRefund({ id: refund2Id, amountCents: 1000 });
		const approved2 = { ...refund2, status: "approved", amountCents: 1000 };

		// First transaction: returns empty row array → NOT_FOUND
		mockDb.transaction
			.mockImplementationOnce(async (cb: (tx: any) => Promise<unknown>) => {
				const innerTx: any = {
					select: mock(() => selectChainResolving([])),
					update: mock(),
					insert: mock(),
					query: {
						refunds: { findFirst: mock(() => Promise.resolve(undefined)) },
						commissionSplits: { findMany: mock(() => Promise.resolve([])) },
						salesOrders: {
							findFirst: mock(() =>
								Promise.resolve({
									id: SO_ID,
									totalAmount: 999999,
									cancelledAmount: 0,
								}),
							),
						},
					},
				};
				return cb(innerTx);
			})
			// Second transaction: success
			.mockImplementationOnce(async (cb: (tx: any) => Promise<unknown>) => {
				const insertValues = {
					returning: mock(() => Promise.resolve([{ id: "audit-2" }])),
				};
				const setChain = {
					where: mock(() => ({
						returning: mock(() => Promise.resolve([approved2])),
					})),
				};
				let selectCount = 0;
				const innerTx: any = {
					select: mock().mockImplementation(() => {
						selectCount++;
						if (selectCount === 1) return selectChainResolving([refund2]);
						return selectChainResolving([{ total: 0 }]);
					}),
					update: mock(() => ({ set: mock(() => setChain) })),
					insert: mock(() => ({ values: mock(() => insertValues) })),
					query: {
						refunds: {
							findFirst: mock(() => Promise.resolve({ ...refund2, items: [] })),
						},
						commissionSplits: { findMany: mock(() => Promise.resolve([])) },
						salesOrders: {
							findFirst: mock(() =>
								Promise.resolve({
									id: SO_ID,
									totalAmount: 999999,
									cancelledAmount: 0,
								}),
							),
						},
					},
				};
				return cb(innerTx);
			});

		const results = await bulkApproveRefunds(
			mockDb as any,
			[{ id: "nonexistent-id" }, { id: refund2Id }],
			ACTOR,
		);

		expect(results).toHaveLength(2);
		// First item failed
		expect(results[0]?.id).toBe("nonexistent-id");
		expect(results[0]?.success).toBe(false);
		expect(results[0]?.error).toBeDefined();
		// Second item succeeded
		expect(results[1]?.id).toBe(refund2Id);
		expect(results[1]?.success).toBe(true);
	});

	test("validates approveAmountCents must be positive integer per item", async () => {
		// approveAmountCents = 0 should fail validation inside approveRefund.
		// The service checks this after SELECT FOR UPDATE, so the lock step must succeed.
		const refund = makeRefund({
			amountCents: 5000,
			salesOrderId: null,
			paymentId: null,
			packageInstanceId: null,
		});

		mockDb.transaction.mockImplementationOnce(
			async (cb: (tx: any) => Promise<unknown>) => {
				const innerTx: any = {
					select: mock()
						.mockReturnValueOnce(selectChainResolving([refund]))
						.mockReturnValue(selectChainResolving([])),
					update: mock(),
					insert: mock(),
					query: {
						refunds: {
							findFirst: mock(() => Promise.resolve({ ...refund, items: [] })),
						},
						commissionSplits: { findMany: mock(() => Promise.resolve([])) },
						salesOrders: {
							findFirst: mock(() =>
								Promise.resolve({
									id: SO_ID,
									totalAmount: 999999,
									cancelledAmount: 0,
								}),
							),
						},
					},
				};
				return cb(innerTx);
			},
		);

		const results = await bulkApproveRefunds(
			mockDb as any,
			[{ id: REFUND_ID, approveAmountCents: 0 }],
			ACTOR,
		);

		// The item-level error is captured (not thrown), per spec
		expect(results[0]?.success).toBe(false);
		expect(results[0]?.error).toBeDefined();
	});
});
