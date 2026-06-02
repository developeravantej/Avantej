/**
 * Status History Integration Tests (Agent 2.7)
 *
 * Per the plan: one test per entity transition. Verifies that every status
 * mutation leaves an audit row in the matching `*_status_history` table.
 *
 * Approach: insert minimal seed rows directly via Drizzle (avoiding heavyweight
 * fixture setup), then either call the service hook or the helper directly,
 * and assert exactly one history row was written with the correct from/to/actor.
 *
 * Cleanup: every inserted entity is deleted in reverse dependency order in
 * afterAll so this test is rerunnable on the shared tenant DB.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray, desc } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
	TEST_USER_ID,
} from "../helpers/integration-setup";

import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderStatusHistory } from "@avantej-core/db/schema/tenant/sales-order-status-history";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { paymentStatusHistory } from "@avantej-core/db/schema/tenant/payment-status-history";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { packageInstanceStatusHistory } from "@avantej-core/db/schema/tenant/package-instance-status-history";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentStatusHistory } from "@avantej-core/db/schema/tenant/appointment-status-history";

import {
	updateSalesOrder,
	updatePackageInstance,
} from "@avantej-core/services";
import {
	appendPaymentStatusHistory,
	appendAppointmentStatusHistory,
} from "@avantej-core/services";

// Load .dev.vars FIRST so SKIP can also gate on missing TENANT_DATABASE_URL
loadDevVars();
const SKIP = shouldSkipIntegration() || !process.env.TENANT_DATABASE_URL;

let tenantDb: ReturnType<typeof createTenantDb>;

const createdSalesOrderIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdPackageInstanceIds: string[] = [];
const createdAppointmentIds: string[] = [];

beforeAll(() => {
	if (SKIP) return;
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (SKIP) return;

	// Order matters: history rows cascade on FK delete, so deleting parents
	// is sufficient. But we delete history first explicitly to be defensive
	// against any retained rows from prior partial runs.
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(appointmentStatusHistory)
			.where(
				inArray(appointmentStatusHistory.appointmentId, createdAppointmentIds),
			);
		await tenantDb
			.delete(appointments)
			.where(inArray(appointments.id, createdAppointmentIds));
	}
	if (createdPackageInstanceIds.length > 0) {
		await tenantDb
			.delete(packageInstanceStatusHistory)
			.where(
				inArray(
					packageInstanceStatusHistory.packageInstanceId,
					createdPackageInstanceIds,
				),
			);
		await tenantDb
			.delete(packageInstances)
			.where(inArray(packageInstances.id, createdPackageInstanceIds));
	}
	if (createdPaymentIds.length > 0) {
		await tenantDb
			.delete(paymentStatusHistory)
			.where(inArray(paymentStatusHistory.paymentId, createdPaymentIds));
		await tenantDb
			.delete(payments)
			.where(inArray(payments.id, createdPaymentIds));
	}
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrderStatusHistory)
			.where(
				inArray(salesOrderStatusHistory.salesOrderId, createdSalesOrderIds),
			);
		await tenantDb
			.delete(salesOrders)
			.where(inArray(salesOrders.id, createdSalesOrderIds));
	}
});

describe("Status History — Agent 2.7", () => {
	test("sales_order status update writes a history row (draft → confirmed)", async () => {
		if (SKIP) return;

		const num = `SO-HIST-${Date.now()}`;
		const [order] = await tenantDb
			.insert(salesOrders)
			.values({
				salesOrderNumber: num,
				date: new Date(),
				customerName: "Test Customer (status-history)",
				createdBy: TEST_USER_ID,
				branchId: TEST_BRANCH_NODE_ID,
				status: "draft",
				totalAmount: 5000,
			})
			.returning();
		expect(order).toBeTruthy();
		createdSalesOrderIds.push(order!.id);

		await updateSalesOrder(
			tenantDb,
			order!.id,
			{ status: "confirmed" },
			{ userId: TEST_USER_ID, reason: "test transition" },
		);

		const rows = await tenantDb
			.select()
			.from(salesOrderStatusHistory)
			.where(eq(salesOrderStatusHistory.salesOrderId, order!.id))
			.orderBy(desc(salesOrderStatusHistory.changedAt));

		expect(rows.length).toBe(1);
		expect(rows[0]!.fromStatus).toBe("draft");
		expect(rows[0]!.toStatus).toBe("confirmed");
		expect(rows[0]!.changedBy).toBe(TEST_USER_ID);
		expect(rows[0]!.reason).toBe("test transition");
	});

	test("payment status mutation via helper writes a history row (pending → succeeded)", async () => {
		if (SKIP) return;

		// Direct insert of minimal payment row. payments has many NOT NULL
		// columns; populate the required ones with synthetic values.
		const [payment] = await tenantDb
			.insert(payments)
			.values({
				stripePaymentIntentId: `pi_test_status_history_${Date.now()}`,
				customerId: TEST_USER_ID,
				amount: 5000,
				totalAmount: 5000,
				franchiserAmount: 5000,
				status: "pending",
			})
			.returning();
		expect(payment).toBeTruthy();
		createdPaymentIds.push(payment!.id);

		// Mutate status + write history (mirrors the pattern Agent 2.8/2.9
		// will adopt inside refunds.service.ts when they extend payment writes).
		await tenantDb.transaction(async (tx) => {
			await tx
				.update(payments)
				.set({ status: "succeeded" })
				.where(eq(payments.id, payment!.id));
			await appendPaymentStatusHistory(tx, payment!.id, {
				fromStatus: "pending",
				toStatus: "succeeded",
				changedBy: TEST_USER_ID,
				reason: "test transition",
			});
		});

		const rows = await tenantDb
			.select()
			.from(paymentStatusHistory)
			.where(eq(paymentStatusHistory.paymentId, payment!.id));

		expect(rows.length).toBe(1);
		expect(rows[0]!.fromStatus).toBe("pending");
		expect(rows[0]!.toStatus).toBe("succeeded");
		expect(rows[0]!.changedBy).toBe(TEST_USER_ID);
	});

	test("package_instance status update writes a history row (pending → active)", async () => {
		if (SKIP) return;

		// Need a service id; pull any active service from the test DB. If none,
		// skip this assertion (the tenant fixture must have one).
		const someService = await tenantDb.query.services.findFirst();
		if (!someService) {
			console.warn(
				"[status-history.test] no services row; skipping package test",
			);
			return;
		}

		const now = new Date();
		const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
		const [pkg] = await tenantDb
			.insert(packageInstances)
			.values({
				serviceId: someService.id,
				clientId: TEST_USER_ID,
				source: "purchased",
				paymentStatus: "pending",
				creditsTotal: 10,
				startsAt: now,
				expiresAt: expires,
				status: "pending",
			})
			.returning();
		expect(pkg).toBeTruthy();
		createdPackageInstanceIds.push(pkg!.id);

		await updatePackageInstance(
			tenantDb,
			pkg!.id,
			{ status: "active" },
			{ userId: TEST_USER_ID, reason: "activation" },
		);

		const rows = await tenantDb
			.select()
			.from(packageInstanceStatusHistory)
			.where(eq(packageInstanceStatusHistory.packageInstanceId, pkg!.id));

		expect(rows.length).toBe(1);
		expect(rows[0]!.fromStatus).toBe("pending");
		expect(rows[0]!.toStatus).toBe("active");
		expect(rows[0]!.changedBy).toBe(TEST_USER_ID);
		expect(rows[0]!.reason).toBe("activation");
	});

	test("appointment status mutation via helper writes a history row (pending → confirmed)", async () => {
		if (SKIP) return;

		const start = new Date();
		const end = new Date(start.getTime() + 60 * 60 * 1000);

		const [appt] = await tenantDb
			.insert(appointments)
			.values({
				type: "private",
				startTime: start,
				duration: 60,
				endTime: end,
				branchId: TEST_BRANCH_NODE_ID,
				status: "pending",
				sessionTotal: 5000,
				pricePerClient: 5000,
				createdBy: TEST_USER_ID,
			})
			.returning();
		expect(appt).toBeTruthy();
		createdAppointmentIds.push(appt!.id);

		// Use the helper directly inside a tx (mirrors the in-service pattern).
		// Going through updateAppointment() requires a heavyweight context
		// (services, members, hierarchy, etc.) that's out of scope for this test.
		await tenantDb.transaction(async (tx) => {
			await tx
				.update(appointments)
				.set({ status: "confirmed" })
				.where(eq(appointments.id, appt!.id));
			await appendAppointmentStatusHistory(tx, appt!.id, {
				fromStatus: "pending",
				toStatus: "confirmed",
				changedBy: TEST_USER_ID,
			});
		});

		const rows = await tenantDb
			.select()
			.from(appointmentStatusHistory)
			.where(eq(appointmentStatusHistory.appointmentId, appt!.id));

		expect(rows.length).toBe(1);
		expect(rows[0]!.fromStatus).toBe("pending");
		expect(rows[0]!.toStatus).toBe("confirmed");
		expect(rows[0]!.changedBy).toBe(TEST_USER_ID);
	});
});
