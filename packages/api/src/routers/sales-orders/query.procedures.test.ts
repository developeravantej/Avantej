/**
 * Sales Orders query procedures — tenant-isolation guard tests.
 *
 * Both getById and statusHistory load the sales order and must reject when the
 * order's branchId is outside the caller's accessibleNodeIds (cross-branch read
 * leak). An in-scope branch must still pass. Permission uses the admin fast-path
 * (roles.findFirst → undefined + member.role === "admin").
 *
 * NOTE: depth is ../../ here because this file lives in routers/sales-orders/.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { salesOrdersRouter } from "./index";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SALES_ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IN_SCOPE_BRANCH = "11111111-1111-4111-8111-111111111111";
const OUT_OF_SCOPE_BRANCH = "99999999-9999-4999-8999-999999999999";

function makeOrder(branchId: string | null) {
	return {
		id: SALES_ORDER_ID,
		salesOrderNumber: "SO-0001",
		date: new Date(),
		customerId: null,
		customerName: "Walk-in",
		createdBy: null,
		branchId,
		status: "completed",
		totalAmount: 30000,
		cancelledAmount: 0,
		notes: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

/**
 * Admin-fast-path tenantDb: roles.findFirst → undefined so requirePermission
 * grants on member.role === "admin". salesOrders.findFirst returns the order
 * (drives getById and the statusHistory parent-order load). select() chain
 * resolves to [] (statusHistory rows — empty page is fine for the guard test).
 */
function makeAdminDb(order: ReturnType<typeof makeOrder>) {
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
			salesOrders: { findFirst: mock(() => Promise.resolve(order)) },
		},
		select: mock(() => selectChain),
	} as unknown as never;
}

// ─── getById ───────────────────────────────────────────────────────────────

describe("salesOrdersRouter.getById — branch isolation", () => {
	const input = { organizationId: ORG_ID, id: SALES_ORDER_ID };

	it("rejects FORBIDDEN when the order's branch is outside accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(OUT_OF_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(salesOrdersRouter.getById, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("passes when the order's branch is in accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(IN_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		const result = await call(salesOrdersRouter.getById, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: SALES_ORDER_ID });
	});
});

// ─── statusHistory ───────────────────────────────────────────────────────────

describe("salesOrdersRouter.statusHistory — branch isolation", () => {
	const input = { organizationId: ORG_ID, salesOrderId: SALES_ORDER_ID };

	it("rejects FORBIDDEN when the order's branch is outside accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(OUT_OF_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(salesOrdersRouter.statusHistory, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("passes (returns rows page) when the order's branch is in accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(IN_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
			// statusHistory unconditionally resolves a control-panel DB to map
			// changedBy → display name. With an empty status-history page the
			// control-panel select is never executed, but the helper still
			// requires the binding to be present, so provide a stub.
			honoBindings: { controlPanelDb: {} },
		});
		const result = await call(salesOrdersRouter.statusHistory, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ nextCursor: null });
		expect(Array.isArray(result.rows)).toBe(true);
	});
});
