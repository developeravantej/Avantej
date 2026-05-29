/**
 * Refund State Machine Integration Tests
 *
 * Verifies the four-step lifecycle: request → approve|reject → process
 *
 *  TC-RSM-001: request → approve → process happy path
 *  TC-RSM-002: request → reject → asserts correct terminal state, no side-effects
 *  TC-RSM-003: process an un-approved (pending) refund → throws BAD_REQUEST
 *  TC-RSM-004: approve an already-approved refund → throws BAD_REQUEST
 *
 * Cleanup order (FK-safe):
 *   1. audit_logs (entityId = refund ids)
 *   2. refund_items
 *   3. refunds
 *   4. sales_order_items
 *   5. sales_orders
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";
import { refundItems } from "@avantej-core/db/schema/tenant/refund-items";
import { refunds } from "@avantej-core/db/schema/tenant/refunds";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import {
	approveRefund,
	processRefund,
	rejectRefund,
	requestRefund,
} from "@avantej-core/services/refunds.service";
import {
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
	TEST_USER_ID,
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
} from "../helpers/integration-setup";

loadDevVars();
const SKIP = shouldSkipIntegration() || !process.env.TENANT_DATABASE_URL;

let tenantDb: ReturnType<typeof createTenantDb>;

const createdRefundIds: string[] = [];
const createdSalesOrderIds: string[] = [];

const TS = Date.now();

const ACTOR = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedSalesOrder(suffix: string) {
	const [so] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber: `RSM-TEST-${TS}-${suffix}`,
			date: new Date(),
			customerId: TEST_USER_ID,
			customerName: "RSM Integration Test Customer",
			createdBy: TEST_USER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			status: "confirmed",
			totalAmount: 50_000, // RM 500.00
		})
		.returning();
	if (!so) throw new Error("Failed to insert sales_order");
	createdSalesOrderIds.push(so.id);
	return so;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
	if (SKIP) return;
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (SKIP) return;

	// 1. Audit logs referencing created refunds
	if (createdRefundIds.length > 0) {
		await tenantDb
			.delete(auditLogs)
			.where(inArray(auditLogs.entityId, createdRefundIds));
	}

	// 2. Refund items (FK → refunds)
	if (createdRefundIds.length > 0) {
		await tenantDb
			.delete(refundItems)
			.where(inArray(refundItems.refundId, createdRefundIds));
	}

	// 3. Refunds
	if (createdRefundIds.length > 0) {
		await tenantDb
			.delete(refunds)
			.where(inArray(refunds.id, createdRefundIds));
	}

	// 4. Sales order items (FK → sales_orders)
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrderItems)
			.where(inArray(salesOrderItems.salesOrderId, createdSalesOrderIds));
	}

	// 5. Sales orders
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrders)
			.where(inArray(salesOrders.id, createdSalesOrderIds));
	}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Refund State Machine — lifecycle integration", () => {
	/**
	 * TC-RSM-001: request → approve → process happy path
	 *
	 * Asserts:
	 *   after request: status='pending', requestedBy set, requestedAt set
	 *   after approve: status='approved', reviewedBy set, reviewedAt set
	 *   after process: status='processed', processedBy set, processedAt set
	 *   audit rows written for each step
	 */
	test(
		"TC-RSM-001: request → approve → process happy path",
		async () => {
			if (SKIP) return;

			const so = await seedSalesOrder("001");

			// Step 1 — Request
			const requested = await requestRefund(tenantDb, {
				salesOrderId: so.id,
				amountCents: 10_000,
				reason: "Customer requested refund",
				actor: ACTOR,
			});
			createdRefundIds.push(requested.id);

			expect(requested.status).toBe("pending");
			expect(requested.requestedBy).toBe(TEST_USER_ID);
			expect(requested.requestedAt).toBeInstanceOf(Date);
			expect(requested.salesOrderId).toBe(so.id);
			expect(requested.amountCents).toBe(10_000);
			expect(requested.refundNumber).toMatch(/^RF-\d{8}-\d{4}$/);

			// Step 2 — Approve
			const approved = await approveRefund(tenantDb, requested.id, {
				reviewNotes: "Approved — verified purchase",
				actor: ACTOR,
			});

			expect(approved.status).toBe("approved");
			expect(approved.reviewedBy).toBe(TEST_USER_ID);
			expect(approved.reviewedAt).toBeInstanceOf(Date);
			expect(approved.reviewNotes).toBe("Approved — verified purchase");

			// Step 3 — Process
			const processed = await processRefund(tenantDb, requested.id, {
				refundMethod: "cash",
				refundReference: "CASH-RSM-001",
				actor: ACTOR,
			});

			expect(processed.status).toBe("processed");
			expect(processed.processedBy).toBe(TEST_USER_ID);
			expect(processed.processedAt).toBeInstanceOf(Date);
			expect(processed.refundMethod).toBe("cash");
			expect(processed.refundReference).toBe("CASH-RSM-001");

			// Assert audit rows were written (at least 2: request + approve + process)
			const auditRows = await tenantDb
				.select()
				.from(auditLogs)
				.where(eq(auditLogs.entityId, requested.id));
			// request writes 1, approve writes 1, process writes 1 → ≥ 3
			expect(auditRows.length).toBeGreaterThanOrEqual(3);

			// Assert sales_order cancelledAmount updated
			const [updatedOrder] = await tenantDb
				.select()
				.from(salesOrders)
				.where(eq(salesOrders.id, so.id));
			expect(updatedOrder!.cancelledAmount).toBe(10_000);
		},
		30000,
	);

	/**
	 * TC-RSM-002: request → reject → terminal state, no commission reversal, no installment event
	 */
	test(
		"TC-RSM-002: request → reject → status='rejected', no money moves",
		async () => {
			if (SKIP) return;

			const so = await seedSalesOrder("002");

			const requested = await requestRefund(tenantDb, {
				salesOrderId: so.id,
				amountCents: 20_000,
				reason: "Customer changed mind",
				actor: ACTOR,
			});
			createdRefundIds.push(requested.id);

			const rejected = await rejectRefund(tenantDb, requested.id, {
				reviewNotes: "Rejected — outside refund window",
				actor: ACTOR,
			});

			expect(rejected.status).toBe("rejected");
			expect(rejected.reviewedBy).toBe(TEST_USER_ID);
			expect(rejected.reviewedAt).toBeInstanceOf(Date);
			expect(rejected.reviewNotes).toBe("Rejected — outside refund window");

			// Sales order must be untouched (cancelledAmount stays null / 0)
			const [order] = await tenantDb
				.select()
				.from(salesOrders)
				.where(eq(salesOrders.id, so.id));
			expect(order!.cancelledAmount ?? 0).toBe(0);
			expect(order!.status).toBe("confirmed"); // not cancelled
		},
		30000,
	);

	/**
	 * TC-RSM-003: processRefund on a pending (un-approved) refund → throws BAD_REQUEST
	 *
	 * Use try/catch (rather than .rejects) so Bun doesn't hang waiting for a rejection
	 * that surfaces as a thrown plain-object inside a Neon FOR-UPDATE transaction.
	 */
	test(
		"TC-RSM-003: processing un-approved (pending) refund throws BAD_REQUEST",
		async () => {
			if (SKIP) return;

			const so = await seedSalesOrder("003");

			const requested = await requestRefund(tenantDb, {
				salesOrderId: so.id,
				amountCents: 5_000,
				reason: "State guard test",
				actor: ACTOR,
			});
			createdRefundIds.push(requested.id);

			// Attempt to process without approving first — must throw BAD_REQUEST
			let thrown: unknown = null;
			try {
				await processRefund(tenantDb, requested.id, {
					refundMethod: "cash",
					actor: ACTOR,
				});
			} catch (err) {
				thrown = err;
			}

			expect(thrown).not.toBeNull();
			expect((thrown as { code?: string }).code).toBe("BAD_REQUEST");

			// Status must still be 'pending' (no mutation occurred)
			const [row] = await tenantDb
				.select()
				.from(refunds)
				.where(eq(refunds.id, requested.id));
			expect(row!.status).toBe("pending");
		},
		30000,
	);

	/**
	 * TC-RSM-004: approveRefund on an already-approved refund → throws BAD_REQUEST
	 *
	 * Use try/catch (rather than .rejects) so Bun doesn't hang waiting for a rejection
	 * that surfaces as a thrown plain-object inside a Neon FOR-UPDATE transaction.
	 */
	test(
		"TC-RSM-004: double-approve throws BAD_REQUEST",
		async () => {
			if (SKIP) return;

			const so = await seedSalesOrder("004");

			const requested = await requestRefund(tenantDb, {
				salesOrderId: so.id,
				amountCents: 7_500,
				reason: "Idempotency guard test",
				actor: ACTOR,
			});
			createdRefundIds.push(requested.id);

			// First approval — must succeed
			await approveRefund(tenantDb, requested.id, {
				reviewNotes: "First approval",
				actor: ACTOR,
			});

			// Second approval — must throw BAD_REQUEST
			let thrown: unknown = null;
			try {
				await approveRefund(tenantDb, requested.id, {
					reviewNotes: "Duplicate approval",
					actor: ACTOR,
				});
			} catch (err) {
				thrown = err;
			}

			expect(thrown).not.toBeNull();
			expect((thrown as { code?: string }).code).toBe("BAD_REQUEST");

			// Status still 'approved' (not corrupted)
			const [row] = await tenantDb
				.select()
				.from(refunds)
				.where(eq(refunds.id, requested.id));
			expect(row!.status).toBe("approved");
		},
		30000,
	);
});
