/**
 * Invoices Router — tenant-isolation tests for by-id reads.
 *
 * getById / getDetail / paymentStatusHistory previously did a bare
 * query.invoices.findFirst with NO branch join, bypassing the
 * salesOrders.branchId scope that listInvoices enforces. These tests pin the
 * fix: a record whose linked salesOrder.branchId is outside the caller's
 * accessibleNodeIds must be rejected (FORBIDDEN); an in-scope branch passes.
 *
 * Permission: default mock member is role "admin"; requirePermission grants
 * because roles.findFirst → undefined and member.role === "admin"
 * (permission.service.ts:120-122). We mock roles/permissions findFirst → undefined.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { invoicesRouter } from "./invoices";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const SALES_ORDER_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";

// Default mock accessibleNodeIds is ["node-root"]; an in-scope sales order
// uses that branch, an out-of-scope one uses a uuid not in the array.
const IN_SCOPE_BRANCH = "node-root";
const OUT_OF_SCOPE_BRANCH = "99999999-9999-4999-8999-999999999999";

function invoiceRow(overrides: Record<string, unknown> = {}) {
	return {
		id: INVOICE_ID,
		invoiceNumber: "INV-20260625-000001",
		salesOrderId: SALES_ORDER_ID,
		paymentId: PAYMENT_ID,
		date: new Date(),
		dueDate: null,
		customerId: null,
		customerName: "Ahmad Firdaus",
		createdBy: null,
		paymentMode: null,
		totalAmount: 30000,
		amountPaid: 0,
		status: "draft",
		eInvoiceStatus: null,
		eInvoiceId: null,
		updatedAt: new Date(),
		...overrides,
	};
}

type MakeDbOptions = {
	/**
	 * salesOrders.branchId returned for the invoice's salesOrderId. `null` means
	 * salesOrders.findFirst resolves to null (missing sales order — an orphan).
	 */
	branchId: string | null;
	/**
	 * Override the invoice row's own salesOrderId. Pass `null` to model a true
	 * orphan invoice (no linked sales order at all). Defaults to SALES_ORDER_ID.
	 */
	invoiceSalesOrderId?: string | null;
};

/**
 * Mock tenantDb. branchId controls the linked salesOrders.branchId returned for
 * the invoice's salesOrderId. roles/permissions findFirst → undefined drives the
 * admin permission fast-path. No createdBy on the row → control-panel lookup skipped.
 *
 * `tenantDb.execute` resolves to `{ rows: [] }` so that the unscoped (empty
 * accessibleNodeIds) admin path — where resolveAccessibleNodeIds falls back to
 * getDescendantNodeIds → a recursive CTE — yields an empty scope (org-wide,
 * orphans visible) instead of hitting a real DB.
 */
function makeDb(opts: MakeDbOptions | string | null) {
	const { branchId, invoiceSalesOrderId } =
		typeof opts === "object" && opts !== null
			? opts
			: { branchId: opts, invoiceSalesOrderId: undefined };
	const soId =
		invoiceSalesOrderId === undefined ? SALES_ORDER_ID : invoiceSalesOrderId;
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			invoices: {
				// getInvoiceById / getInvoiceWithItems load by id; paymentStatusHistory's
				// fix loads by paymentId — both go through findFirst here.
				findFirst: mock(() =>
					Promise.resolve(invoiceRow({ salesOrderId: soId })),
				),
			},
			paymentItems: { findMany: mock(() => Promise.resolve([])) },
			salesOrders: {
				findFirst: mock(() =>
					Promise.resolve(
						branchId === null ? null : { id: SALES_ORDER_ID, branchId },
					),
				),
			},
		},
		// resolveAccessibleNodeIds → getDescendantNodeIds recursive CTE (empty-scope path)
		execute: mock(() => Promise.resolve({ rows: [] })),
		// getPaymentStatusHistory does db.select().from().where().orderBy().limit()
		select: mock(() => {
			const chain: Record<string, unknown> = {};
			for (const m of ["from", "where", "orderBy", "limit", "leftJoin"]) {
				chain[m] = mock(() => chain);
			}
			chain.then = (resolve: (v: unknown) => unknown) =>
				Promise.resolve([]).then(resolve);
			return chain;
		}),
	} as unknown as never;
}

// ─── getById ──────────────────────────────────────────────────────────────────

describe("invoicesRouter.getById tenant isolation", () => {
	const input = { organizationId: ORG_ID, id: INVOICE_ID };

	it("rejects an invoice whose linked salesOrder.branchId is out of scope", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(OUT_OF_SCOPE_BRANCH) });
		await expect(
			call(invoicesRouter.getById, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows an invoice whose linked salesOrder.branchId is in scope", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(IN_SCOPE_BRANCH) });
		const result = await call(invoicesRouter.getById, input, { context: ctx });
		expect(result).toMatchObject({ id: INVOICE_ID });
	});
});

// ─── getDetail ──────────────────────────────────────────────────────────────

describe("invoicesRouter.getDetail tenant isolation", () => {
	const input = { organizationId: ORG_ID, id: INVOICE_ID };

	it("rejects detail for an out-of-scope branch", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(OUT_OF_SCOPE_BRANCH) });
		await expect(
			call(invoicesRouter.getDetail, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns detail for an in-scope branch", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(IN_SCOPE_BRANCH) });
		const result = await call(invoicesRouter.getDetail, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ invoice: { id: INVOICE_ID } });
	});
});

// ─── paymentStatusHistory ─────────────────────────────────────────────────────

describe("invoicesRouter.paymentStatusHistory tenant isolation", () => {
	const input = { organizationId: ORG_ID, paymentId: PAYMENT_ID, limit: 50 };

	it("rejects history when the payment's invoice branch is out of scope", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(OUT_OF_SCOPE_BRANCH) });
		await expect(
			call(invoicesRouter.paymentStatusHistory, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns history when the payment's invoice branch is in scope", async () => {
		// After the in-scope guard passes, the handler unconditionally calls
		// getControlPanelDb(context) to resolve changedBy names. With empty rows no
		// users are looked up, but the binding must be present or it throws
		// INTERNAL_SERVER_ERROR — unrelated to the branch guard under test, so
		// supply a minimal control-panel DB binding to let the positive path return.
		const ctx = createMockContext({
			tenantDb: makeDb(IN_SCOPE_BRANCH),
			honoBindings: { controlPanelDb: {} },
		});
		const result = await call(invoicesRouter.paymentStatusHistory, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ rows: [], nextCursor: null });
	});
});

// ─── orphan / null-branch class ───────────────────────────────────────────────
//
// The fix mirrors listInvoices' innerJoin-through-salesOrders scoping: a scoped
// caller (non-empty accessibleNodeIds) must NOT see the orphan/null-branch class
// — (a) an invoice with no salesOrderId at all, (b) an invoice whose salesOrder
// row is missing, or (c) an invoice whose salesOrder.branchId is null. All three
// are hidden via NOT_FOUND (no FORBIDDEN, no row → no enumeration oracle).
// An unscoped admin (empty accessibleNodeIds → empty descendant walk) sees them.

describe("invoicesRouter orphan / null-branch isolation (scoped caller → NOT_FOUND)", () => {
	const byId = { organizationId: ORG_ID, id: INVOICE_ID };
	const byPayment = {
		organizationId: ORG_ID,
		paymentId: PAYMENT_ID,
		limit: 50,
	};

	it("getById hides an invoice with no salesOrderId", async () => {
		const ctx = createMockContext({
			tenantDb: makeDb({ branchId: null, invoiceSalesOrderId: null }),
		});
		await expect(
			call(invoicesRouter.getById, byId, { context: ctx }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("getById hides an invoice whose salesOrder row is missing", async () => {
		// invoice row carries salesOrderId, but salesOrders.findFirst → null.
		const ctx = createMockContext({ tenantDb: makeDb({ branchId: null }) });
		await expect(
			call(invoicesRouter.getById, byId, { context: ctx }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("getById hides an invoice whose salesOrder.branchId is null", async () => {
		// salesOrder row EXISTS but its branchId is null — the orphan class case (b)
		// listInvoices hides. (makeDb's branchId:null path returns a null ROW; here we
		// model the distinct returned-row-with-null-branch shape explicitly.)
		const ctx = createMockContext({
			tenantDb: {
				query: {
					roles: { findFirst: mock(() => Promise.resolve(undefined)) },
					permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
					rolePermissions: {
						findFirst: mock(() => Promise.resolve(undefined)),
					},
					invoices: {
						findFirst: mock(() => Promise.resolve(invoiceRow())),
					},
					paymentItems: { findMany: mock(() => Promise.resolve([])) },
					salesOrders: {
						findFirst: mock(() =>
							Promise.resolve({ id: SALES_ORDER_ID, branchId: null }),
						),
					},
				},
				execute: mock(() => Promise.resolve({ rows: [] })),
			} as unknown as never,
		});
		await expect(
			call(invoicesRouter.getById, byId, { context: ctx }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("getDetail hides an invoice with no salesOrderId", async () => {
		const ctx = createMockContext({
			tenantDb: makeDb({ branchId: null, invoiceSalesOrderId: null }),
		});
		await expect(
			call(invoicesRouter.getDetail, byId, { context: ctx }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("paymentStatusHistory hides history when no invoice links the payment", async () => {
		// No invoice owns this paymentId → linkedInvoice is null → orphan class.
		const ctx = createMockContext({
			tenantDb: {
				query: {
					roles: { findFirst: mock(() => Promise.resolve(undefined)) },
					permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
					rolePermissions: {
						findFirst: mock(() => Promise.resolve(undefined)),
					},
					invoices: { findFirst: mock(() => Promise.resolve(undefined)) },
					salesOrders: { findFirst: mock(() => Promise.resolve(null)) },
				},
				execute: mock(() => Promise.resolve({ rows: [] })),
			} as unknown as never,
			honoBindings: { controlPanelDb: {} },
		});
		await expect(
			call(invoicesRouter.paymentStatusHistory, byPayment, { context: ctx }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("invoicesRouter orphan / null-branch (unscoped admin → allowed)", () => {
	const byId = { organizationId: ORG_ID, id: INVOICE_ID };

	it("getById returns an orphan invoice for an unscoped admin (empty scope)", async () => {
		// accessibleNodeIds:[] → resolveAccessibleNodeIds walks descendants
		// (tenantDb.execute → { rows: [] }) → empty scope → org-wide, orphan allowed.
		const ctx = createMockContext({
			accessibleNodeIds: [],
			tenantDb: makeDb({ branchId: null, invoiceSalesOrderId: null }),
		});
		const result = await call(invoicesRouter.getById, byId, { context: ctx });
		expect(result).toMatchObject({ id: INVOICE_ID });
	});

	it("getById returns an invoice with a null-branch salesOrder for an unscoped admin", async () => {
		const ctx = createMockContext({
			accessibleNodeIds: [],
			tenantDb: {
				query: {
					roles: { findFirst: mock(() => Promise.resolve(undefined)) },
					permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
					rolePermissions: {
						findFirst: mock(() => Promise.resolve(undefined)),
					},
					invoices: { findFirst: mock(() => Promise.resolve(invoiceRow())) },
					paymentItems: { findMany: mock(() => Promise.resolve([])) },
					salesOrders: {
						findFirst: mock(() =>
							Promise.resolve({ id: SALES_ORDER_ID, branchId: null }),
						),
					},
				},
				execute: mock(() => Promise.resolve({ rows: [] })),
			} as unknown as never,
		});
		const result = await call(invoicesRouter.getById, byId, { context: ctx });
		expect(result).toMatchObject({ id: INVOICE_ID });
	});
});
