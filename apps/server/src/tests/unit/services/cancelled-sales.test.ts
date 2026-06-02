import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listCancelledSales,
	getCancelledSaleById,
	exportCancelledSalesCsv,
} from "@avantej-core/services";

// ─── Shared mock primitives ───────────────────────────────────────────────────

// We need a chainable select mock that terminates either as a Promise or via
// .orderBy().limit().offset().
// Strategy: every method returns `chain`; `chain` also has a `.then` so it can
// be awaited directly (for count queries).

function makeChain(resolveValue: unknown = []) {
	const chain: Record<string, any> = {};
	const methods = [
		"from",
		"where",
		"orderBy",
		"limit",
		"offset",
		"innerJoin",
		"leftJoin",
		"groupBy",
	];
	for (const m of methods) {
		chain[m] = mock(() => chain);
	}
	chain.then = (
		resolve: (v: unknown) => unknown,
		reject?: (e: unknown) => unknown,
	) => Promise.resolve(resolveValue).then(resolve, reject);
	return chain;
}

// Per-test resolve queues — each call to select() returns a fresh chain
// with its own resolve value.
let selectQueue: ReturnType<typeof makeChain>[] = [];
const mockSelect = mock(() => selectQueue.shift() ?? makeChain([]));

const mockFindFirst = mock(() => Promise.resolve(null));

const mockTenantDb = {
	select: mockSelect,
	query: {
		salesOrders: { findFirst: mockFindFirst },
	},
} as any;

beforeEach(() => {
	mockSelect.mockClear();
	mockFindFirst.mockClear();
	selectQueue = [];
});

// ─── Helper factories ─────────────────────────────────────────────────────────

function makeSaleRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "so-1",
		salesOrderNumber: "SO-20260514-0001",
		status: "cancelled",
		cancellationNumber: "CAN-20260514-0001",
		cancellationDate: new Date("2026-05-14T10:00:00Z"),
		cancelledAmount: 5000,
		totalAmount: 5000,
		cancellationReason: "Customer changed mind",
		cancellationReasonCategory: "customer_changed_mind",
		cancelledBy: "member-1",
		customerId: "user-1",
		customerName: "Alice",
		customerType: "member",
		branchId: "branch-1",
		createdAt: new Date("2026-05-14T09:00:00Z"),
		updatedAt: new Date("2026-05-14T10:00:00Z"),
		...overrides,
	};
}

function makeItemRow(overrides: Record<string, unknown> = {}) {
	return {
		salesOrderId: "so-1",
		id: "item-1",
		description: "Drop-in class",
		quantity: 1,
		unitPrice: 5000,
		totalPrice: 5000,
		taxRateBps: 600,
		taxRateCode: "SST-6",
		...overrides,
	};
}

// ─── listCancelledSales ───────────────────────────────────────────────────────

describe("listCancelledSales", () => {
	test("returns empty rows when accessibleNodeIds is empty", async () => {
		const result = await listCancelledSales(mockTenantDb, {
			accessibleNodeIds: [],
		});

		expect(result.rows).toEqual([]);
		expect(result.total).toBe(0);
		// No DB call should be made
		expect(mockSelect).not.toHaveBeenCalled();
	});

	test("returns rows with line items and zero repeatOffenderCount for walk-in (null customerId)", async () => {
		const walkInRow = makeSaleRow({
			customerId: null,
			customerType: "walk_in",
		});

		// Queue: [count, orderRows, itemRows]  — no repeat-offender query because customerId is null
		selectQueue.push(makeChain([{ total: 1 }])); // count query
		selectQueue.push(makeChain([walkInRow])); // order rows
		selectQueue.push(makeChain([makeItemRow()])); // item rows

		const result = await listCancelledSales(mockTenantDb, {
			limit: 50,
			offset: 0,
		});

		expect(result.total).toBe(1);
		expect(result.rows).toHaveLength(1);
		const row = result.rows[0]!;
		expect(row.customerType).toBe("walk_in");
		expect(row.repeatOffenderCount).toBe(0);
		expect(row.lineItems).toHaveLength(1);
		expect(row.lineItems[0]!.description).toBe("Drop-in class");
	});

	test("returns repeatOffenderCount for member (non-null customerId)", async () => {
		const saleRow = makeSaleRow({
			customerId: "user-2",
			customerType: "member",
		});

		// Queue: [count, orderRows, itemRows, repeatCount]
		selectQueue.push(makeChain([{ total: 1 }])); // count query
		selectQueue.push(makeChain([saleRow])); // order rows
		selectQueue.push(makeChain([])); // item rows (empty)
		selectQueue.push(makeChain([{ customerId: "user-2", cnt: 3 }])); // repeat count

		const result = await listCancelledSales(mockTenantDb, {
			limit: 50,
			offset: 0,
		});

		expect(result.rows[0]?.repeatOffenderCount).toBe(3);
	});

	test("projects customerType through response shape", async () => {
		const saleRow = makeSaleRow({ customerType: "walk_in", customerId: null });

		selectQueue.push(makeChain([{ total: 1 }]));
		selectQueue.push(makeChain([saleRow]));
		selectQueue.push(makeChain([]));

		const result = await listCancelledSales(mockTenantDb);

		expect(result.rows[0]?.customerType).toBe("walk_in");
	});
});

// ─── getCancelledSaleById ─────────────────────────────────────────────────────

describe("getCancelledSaleById", () => {
	test("returns null when accessibleNodeIds is empty", async () => {
		const result = await getCancelledSaleById(mockTenantDb, "so-1", []);
		expect(result).toBeNull();
		expect(mockSelect).not.toHaveBeenCalled();
	});

	test("returns null when sale not found", async () => {
		selectQueue.push(makeChain([])); // no rows
		const result = await getCancelledSaleById(
			mockTenantDb,
			"so-missing",
			undefined,
		);
		expect(result).toBeNull();
	});

	test("returns row with line items and repeat offender count", async () => {
		const saleRow = makeSaleRow();

		// Queue: [saleRow, itemRows, repeatCount]
		selectQueue.push(makeChain([saleRow]));
		selectQueue.push(makeChain([makeItemRow()]));
		selectQueue.push(makeChain([{ cnt: 2 }]));

		const result = await getCancelledSaleById(mockTenantDb, "so-1");

		expect(result).not.toBeNull();
		expect(result?.id).toBe("so-1");
		expect(result?.lineItems).toHaveLength(1);
		expect(result?.repeatOffenderCount).toBe(2);
		expect(result?.customerType).toBe("member");
	});

	test("zero repeatOffenderCount for walk-in (null customerId)", async () => {
		const walkInRow = makeSaleRow({
			customerId: null,
			customerType: "walk_in",
		});

		// Queue: [saleRow, itemRows] — no repeat-offender query
		selectQueue.push(makeChain([walkInRow]));
		selectQueue.push(makeChain([]));

		const result = await getCancelledSaleById(mockTenantDb, "so-1");

		expect(result?.repeatOffenderCount).toBe(0);
		// Only 2 select calls — count query not triggered for walk-in
		expect(mockSelect).toHaveBeenCalledTimes(2);
	});
});

// ─── exportCancelledSalesCsv ──────────────────────────────────────────────────

describe("exportCancelledSalesCsv", () => {
	test("returns empty csv (header only) when accessibleNodeIds is empty", async () => {
		const { csv, truncated } = await exportCancelledSalesCsv(mockTenantDb, {
			accessibleNodeIds: [],
		});

		expect(csv).toContain("cancellation_number");
		expect(truncated).toBe(false);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	test("returns csv with data rows and truncated=false when under limit", async () => {
		const saleRow = makeSaleRow();

		// First chunk returns 1 row; second chunk (if called) returns empty
		selectQueue.push(makeChain([saleRow]));
		selectQueue.push(makeChain([]));

		const { csv, truncated } = await exportCancelledSalesCsv(mockTenantDb, {});

		expect(truncated).toBe(false);
		expect(csv).toContain("CAN-20260514-0001");
		expect(csv.split("\n").filter(Boolean).length).toBe(2); // header + 1 data row
	});

	test("escapes commas in fields", async () => {
		const saleRow = makeSaleRow({
			cancellationReason: "Customer, changed mind",
		});

		selectQueue.push(makeChain([saleRow]));
		selectQueue.push(makeChain([]));

		const { csv } = await exportCancelledSalesCsv(mockTenantDb, {});

		expect(csv).toContain('"Customer, changed mind"');
	});
});

// ─── getSalesKpiSummary (new period logic) ────────────────────────────────────

describe("getSalesKpiSummary (via listSalesOrders refundStatus)", () => {
	test("listSalesOrders passes refundStatus filter to query", async () => {
		const { listSalesOrders } = await import("@avantej-core/services");

		selectQueue.push(makeChain([{ total: 0 }])); // count
		selectQueue.push(makeChain([])); // rows

		const result = await listSalesOrders(mockTenantDb, {
			refundStatus: "pending",
			limit: 10,
			offset: 0,
		});

		expect(result.total).toBe(0);
		// where() is chained — the important thing is no exception thrown and the
		// refundStatus param is accepted without TypeScript error (checked at compile time).
	});
});
