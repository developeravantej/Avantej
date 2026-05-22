/**
 * Unit tests for the sales-orders router
 *
 * Focused on:
 *   create — permission check, delegates to createSalesOrder service, response shape
 *   cancel — permission check, delegates to cancelSalesOrder service, actor forwarding
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createAdminContext, createStaffContext } from "../../helpers/context.factory";
import { createMockTenantDb } from "../../helpers/db-mock.factory";

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockRequirePermission = mock(() => Promise.resolve());

const CREATED_ORDER = {
	id: "so-0001",
	salesOrderNumber: "SO-20260101-0001",
	date: new Date("2026-01-01T10:00:00.000Z"),
	customerId: null,
	customerName: "Walk-In Customer",
	createdBy: "u-1",
	branchId: "aaaaaaaa-0000-4000-8000-000000000001",
	status: "draft" as const,
	totalAmount: 5000,
	notes: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const mockCreateSalesOrder = mock(() => Promise.resolve(CREATED_ORDER));
const mockCancelSalesOrder = mock(() =>
	Promise.resolve({ ...CREATED_ORDER, status: "cancelled" as const }),
);

mock.module("@avantej-core/services", () => ({
	requirePermission: mockRequirePermission,
	listSalesOrders: mock(() => Promise.resolve({ rows: [], total: 0 })),
	getSalesOrderById: mock(() => Promise.resolve(null)),
	createSalesOrder: mockCreateSalesOrder,
	updateSalesOrder: mock(() => Promise.resolve(CREATED_ORDER)),
	cancelSalesOrder: mockCancelSalesOrder,
	getSalesOrderStatusHistory: mock(() => Promise.resolve([])),
	getSalesOrderKpiSummary: mock(() => Promise.resolve({})),
	getLargestSaleToday: mock(() => Promise.resolve(null)),
	getLatestCompletedSalesOrder: mock(() => Promise.resolve(null)),
	CANCELLATION_REASON_CATEGORIES: ["customer_request", "error", "other"] as const,
	SALES_ORDER_REFUND_STATUSES: ["none", "partial", "full"] as const,
}));

mock.module("@avantej-core/api/lib/context-helpers", () => ({
	getControlPanelDb: mock(() => ({
		select: mock(() => ({
			from: mock(() => ({ where: mock(() => Promise.resolve([])) })),
		})),
	})),
}));

mock.module("@avantej-core/api/lib/cursor", () => ({
	encodeCursor: mock(() => "cursor"),
	parseCursor: mock(() => null),
}));

import { salesOrdersRouter } from "@avantej-core/api/routers/sales-orders";

// biome-ignore lint/suspicious/noExplicitAny: test helper
function call(procedure: any, input: unknown, context: unknown) {
	return procedure["~orpc"].handler({ input, context });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const BRANCH_ID = "aaaaaaaa-0000-4000-8000-000000000001";

// ── create ────────────────────────────────────────────────────────────────────

describe("salesOrdersRouter.create", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockCreateSalesOrder.mockClear();
	});

	it("happy path — delegates to createSalesOrder and returns order row", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();

		const result = await call(
			salesOrdersRouter.create,
			{
				organizationId: ORG_ID,
				date: "2026-01-01T10:00:00.000Z",
				customerName: "Walk-In Customer",
				createdBy: "u-1",
				branchId: BRANCH_ID,
				totalAmount: 5000,
			},
			{ ...ctx, tenantDb: db },
		);

		expect(result.salesOrderNumber).toBe("SO-20260101-0001");
		expect(result.status).toBe("draft");
		expect(mockCreateSalesOrder).toHaveBeenCalledTimes(1);

		// Verify the service received a Date, not a raw string
		const [, params] = (mockCreateSalesOrder.mock.calls[0] as unknown) as [unknown, { date: unknown }];
		expect(params.date).toBeInstanceOf(Date);
	});

	it("passes optional notes through to service", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();

		await call(
			salesOrdersRouter.create,
			{
				organizationId: ORG_ID,
				date: "2026-01-01T10:00:00.000Z",
				customerName: "Walk-In Customer",
				createdBy: "u-1",
				branchId: BRANCH_ID,
				totalAmount: 5000,
				notes: "Promo applied",
			},
			{ ...ctx, tenantDb: db },
		);

		const [, params] = (mockCreateSalesOrder.mock.calls[0] as unknown) as [unknown, { notes?: string }];
		expect(params.notes).toBe("Promo applied");
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				salesOrdersRouter.create,
				{
					organizationId: ORG_ID,
					date: "2026-01-01T10:00:00.000Z",
					customerName: "Walk-In Customer",
					createdBy: "u-1",
					branchId: BRANCH_ID,
					totalAmount: 5000,
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (needs sales:create)", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				salesOrdersRouter.create,
				{
					organizationId: ORG_ID,
					date: "2026-01-01T10:00:00.000Z",
					customerName: "Walk-In Customer",
					createdBy: "u-1",
					branchId: BRANCH_ID,
					totalAmount: 5000,
				},
				{ ...ctx, tenantDb: db },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const ctx = { ...createAdminContext(), tenantDb: null };

		await expect(
			call(
				salesOrdersRouter.create,
				{
					organizationId: ORG_ID,
					date: "2026-01-01T10:00:00.000Z",
					customerName: "Walk-In Customer",
					createdBy: "u-1",
					branchId: BRANCH_ID,
					totalAmount: 5000,
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

// ── cancel ────────────────────────────────────────────────────────────────────

describe("salesOrdersRouter.cancel", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockCancelSalesOrder.mockClear();
	});

	it("happy path — delegates to cancelSalesOrder and returns cancelled order", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();

		const result = await call(
			salesOrdersRouter.cancel,
			{ organizationId: ORG_ID, id: "so-0001", cancelledBy: "u-1", refundAmount: 0 },
			{ ...ctx, tenantDb: db },
		);

		expect(result.status).toBe("cancelled");
		expect(mockCancelSalesOrder).toHaveBeenCalledTimes(1);
	});

	it("forwards actor object (userId, memberId, role) to cancelSalesOrder", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();

		await call(
			salesOrdersRouter.cancel,
			{ organizationId: ORG_ID, id: "so-0001", cancelledBy: "u-1", refundAmount: 0 },
			{ ...ctx, tenantDb: db },
		);

		// cancelSalesOrder(tenantDb, id, params, actor)
		const [, , , actor] = (mockCancelSalesOrder.mock.calls[0] as unknown) as [
			unknown,
			unknown,
			unknown,
			{ userId: string; memberId: string; role: string },
		];
		expect(actor.userId).toBe(ctx.session.user.id);
		expect(actor.memberId).toBe(ctx.member.id);
		expect(actor.role).toBe("admin");
	});

	it("passes cancellationReasonCategory through to service when provided", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();

		await call(
			salesOrdersRouter.cancel,
			{
				organizationId: ORG_ID,
				id: "so-0001",
				cancelledBy: "u-1",
				refundAmount: 1000,
				reason: "Customer changed mind",
				cancellationReasonCategory: "customer_request",
			},
			{ ...ctx, tenantDb: db },
		);

		const [, , params] = (mockCancelSalesOrder.mock.calls[0] as unknown) as [
			unknown,
			unknown,
			{ cancellationReasonCategory?: string; refundAmount: number },
			unknown,
		];
		expect(params.cancellationReasonCategory).toBe("customer_request");
		expect(params.refundAmount).toBe(1000);
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				salesOrdersRouter.cancel,
				{ organizationId: ORG_ID, id: "so-0001", cancelledBy: "u-1", refundAmount: 0 },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (needs sales:delete)", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				salesOrdersRouter.cancel,
				{ organizationId: ORG_ID, id: "so-0001", cancelledBy: "u-1", refundAmount: 0 },
				{ ...ctx, tenantDb: db },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const ctx = { ...createAdminContext(), tenantDb: null };

		await expect(
			call(
				salesOrdersRouter.cancel,
				{ organizationId: ORG_ID, id: "so-0001", cancelledBy: "u-1", refundAmount: 0 },
				ctx,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});
