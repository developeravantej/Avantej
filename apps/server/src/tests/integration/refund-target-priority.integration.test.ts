/**
 * Refund Target Priority Integration Tests
 *
 * Verifies that when a refund has multiple target fields set, the resolved
 * customer/branch is derived from the highest-priority target:
 *   salesOrderId > paymentId > packageInstanceId
 *
 *  TC-RTP-001: salesOrderId + paymentId + packageInstanceId → resolved from salesOrder
 *  TC-RTP-002: paymentId + packageInstanceId (no salesOrderId) → resolved from payment
 *  TC-RTP-003: packageInstanceId only → resolved from packageInstance
 *  TC-RTP-004: no target at all → throws BAD_REQUEST
 *
 * Strategy: each target is seeded with a DISTINCT customerId so priority is
 * unambiguously observable from the resulting refund row.
 *
 * Cleanup order (FK-safe):
 *   1. audit_logs (entityId = refund ids)
 *   2. refund_items
 *   3. refunds
 *   4. sales_order_items (FK → sales_orders)
 *   5. sales_orders
 *   6. payments
 *   7. package_instances
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { refundItems } from "@avantej-core/db/schema/tenant/refund-items";
import { refunds } from "@avantej-core/db/schema/tenant/refunds";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { requestRefund } from "@avantej-core/services/refunds.service";
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
const createdPaymentIds: string[] = [];
const createdPackageInstanceIds: string[] = [];

const TS = Date.now();

const ACTOR = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

// Distinct customer IDs per target type so priority is observable
const SO_CUSTOMER_ID = `rtp-so-customer-${TS}`;
const PMT_CUSTOMER_ID = `rtp-pmt-customer-${TS}`;
const PKG_CUSTOMER_ID = `rtp-pkg-customer-${TS}`;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedSalesOrder(customerId: string, suffix: string) {
	const [so] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber: `RTP-TEST-${TS}-${suffix}`,
			date: new Date(),
			customerId,
			customerName: `RTP Customer ${suffix}`,
			createdBy: TEST_USER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			status: "confirmed",
			totalAmount: 50_000,
		})
		.returning();
	if (!so) throw new Error("Failed to insert sales_order");
	createdSalesOrderIds.push(so.id);
	return so;
}

async function seedPayment(customerId: string, suffix: string) {
	const [pmt] = await tenantDb
		.insert(payments)
		.values({
			stripePaymentIntentId: `pi_rtp_test_${TS}_${suffix}`,
			customerId,
			amount: 40_000,
			taxAmount: 0,
			totalAmount: 40_000,
			currency: "myr",
			platformFeeAmount: 0,
			platformFeePercentage: 0,
			franchiserAmount: 40_000,
			status: "succeeded",
		})
		.returning();
	if (!pmt) throw new Error("Failed to insert payment");
	createdPaymentIds.push(pmt.id);
	return pmt;
}

async function seedPackageInstance(customerId: string) {
	const someService = await tenantDb.query.services.findFirst();
	if (!someService) throw new Error("No services row in tenant DB; cannot seed package_instance");

	const now = new Date();
	const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

	const [pkg] = await tenantDb
		.insert(packageInstances)
		.values({
			serviceId: someService.id,
			clientId: customerId,
			source: "purchased",
			paymentStatus: "paid",
			creditsTotal: 10,
			totalPrice: 100_000,
			startsAt: now,
			expiresAt: expires,
			status: "active",
		})
		.returning();
	if (!pkg) throw new Error("Failed to insert package_instance");
	createdPackageInstanceIds.push(pkg.id);
	return pkg;
}

// ---------------------------------------------------------------------------
// Shared seed state (created in beforeAll or lazily in tests)
// ---------------------------------------------------------------------------

let soId: string;
let pmtId: string;
let pkgId: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
	if (SKIP) return;
	tenantDb = createTenantDb();

	// Sales order and payment are seeded eagerly — no external deps
	const so = await seedSalesOrder(SO_CUSTOMER_ID, "SO");
	soId = so.id;

	const pmt = await seedPayment(PMT_CUSTOMER_ID, "PMT");
	pmtId = pmt.id;

	// Package instance requires a services row. Seed lazily; tests guard themselves.
	try {
		const pkg = await seedPackageInstance(PKG_CUSTOMER_ID);
		pkgId = pkg.id;
	} catch {
		// Leave pkgId undefined — TC-RTP-001/002 will skip the package assertion;
		// TC-RTP-003 will skip entirely if pkgId is not set.
	}
});

afterAll(async () => {
	if (SKIP) return;

	// 1. Audit logs
	if (createdRefundIds.length > 0) {
		await tenantDb
			.delete(auditLogs)
			.where(inArray(auditLogs.entityId, createdRefundIds));
	}

	// 2. Refund items
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

	// 4. Sales order items
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

	// 6. Payments
	if (createdPaymentIds.length > 0) {
		await tenantDb
			.delete(payments)
			.where(inArray(payments.id, createdPaymentIds));
	}

	// 7. Package instances
	if (createdPackageInstanceIds.length > 0) {
		await tenantDb
			.delete(packageInstances)
			.where(inArray(packageInstances.id, createdPackageInstanceIds));
	}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Refund Target Priority — customer/branch resolution", () => {
	/**
	 * TC-RTP-001: all three targets set → customer resolved from salesOrder (highest priority)
	 * Uses pkgId if available; falls back to salesOrderId+paymentId only (still verifies SO wins).
	 */
	test(
		"TC-RTP-001: salesOrderId + paymentId + packageInstanceId → customerId from salesOrder",
		async () => {
			if (SKIP) return;

			const refund = await requestRefund(tenantDb, {
				salesOrderId: soId,
				paymentId: pmtId,
				...(pkgId ? { packageInstanceId: pkgId } : {}),
				amountCents: 1_000,
				reason: "Priority: SO wins",
				branchId: TEST_BRANCH_NODE_ID,
				actor: ACTOR,
			});
			createdRefundIds.push(refund.id);

			// customerId must come from the sales order, not payment or package instance
			expect(refund.customerId).toBe(SO_CUSTOMER_ID);
			expect(refund.salesOrderId).toBe(soId);
			expect(refund.status).toBe("pending");
		},
		30000,
	);

	/**
	 * TC-RTP-002: paymentId + packageInstanceId (no salesOrderId) → customerId from payment
	 * Uses pkgId if available; falls back to paymentId-only (still verifies pmt customer).
	 */
	test(
		"TC-RTP-002: paymentId + packageInstanceId (no salesOrderId) → customerId from payment",
		async () => {
			if (SKIP) return;

			const refund = await requestRefund(tenantDb, {
				paymentId: pmtId,
				...(pkgId ? { packageInstanceId: pkgId } : {}),
				amountCents: 1_000,
				reason: "Priority: payment wins over package",
				branchId: TEST_BRANCH_NODE_ID,
				actor: ACTOR,
			});
			createdRefundIds.push(refund.id);

			// customerId must come from the payment record
			expect(refund.customerId).toBe(PMT_CUSTOMER_ID);
			expect(refund.paymentId).toBe(pmtId);
			expect(refund.salesOrderId).toBeNull();
		},
		30000,
	);

	/**
	 * TC-RTP-003: packageInstanceId only → customerId from package instance (clientId)
	 * Skipped if no services row exists in tenant DB (packageInstance cannot be seeded).
	 */
	test(
		"TC-RTP-003: packageInstanceId only → customerId from packageInstance.clientId",
		async () => {
			if (SKIP) return;
			if (!pkgId) {
				console.log("TC-RTP-003: skipped — no services row in tenant DB, cannot seed package instance");
				return;
			}

			const refund = await requestRefund(tenantDb, {
				packageInstanceId: pkgId,
				amountCents: 1_000,
				reason: "Priority: package only",
				branchId: TEST_BRANCH_NODE_ID,
				actor: ACTOR,
			});
			createdRefundIds.push(refund.id);

			// customerId must come from packageInstance.clientId
			expect(refund.customerId).toBe(PKG_CUSTOMER_ID);
			expect(refund.packageInstanceId).toBe(pkgId);
			expect(refund.salesOrderId).toBeNull();
			expect(refund.paymentId).toBeNull();
		},
		30000,
	);

	/**
	 * TC-RTP-004: no target at all → throws BAD_REQUEST immediately
	 */
	test(
		"TC-RTP-004: no target → throws BAD_REQUEST",
		async () => {
			if (SKIP) return;

			await expect(
				requestRefund(tenantDb, {
					amountCents: 1_000,
					reason: "No target should fail",
					branchId: TEST_BRANCH_NODE_ID,
					actor: ACTOR,
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		},
		30000,
	);
});
