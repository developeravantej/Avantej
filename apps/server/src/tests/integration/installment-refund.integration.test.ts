/**
 * Integration test: Phase B — processRefund bulk-cancels remaining installments.
 *
 * Scenario: 4-installment package, #1 confirmed paid, call processRefund.
 * Expected: #2-4 → status='cancelled', packageInstance → status='cancelled', paymentStatus='refunded'.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray, and } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	makeIntegrationAdminContext,
	TEST_USER_ID,
} from "../helpers/integration-setup";
import { processRefund } from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";
import { services } from "@avantej-core/db/schema/tenant/services";

const createdPackageInstanceIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || !tenantDb) return;
	if (createdPackageInstanceIds.length > 0) {
		await tenantDb
			.delete(auditLogs)
			.where(
				and(
					eq(auditLogs.entityType, "package_instance"),
					inArray(auditLogs.entityId, createdPackageInstanceIds),
				),
			);
		await tenantDb
			.delete(packageInstances)
			.where(inArray(packageInstances.id, createdPackageInstanceIds));
	}
});

describe("processRefund integration", () => {
	test(
		"refund bulk-cancels all pending/overdue installments and marks package cancelled",
		async () => {
			if (shouldSkipIntegration()) return;

			const [service] = await tenantDb.select({ id: services.id }).from(services).limit(1);
			if (!service) {
				console.warn("[integration] No services found — skipping");
				return;
			}

			const now = new Date();
			const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
			const intervalMs = 30 * 24 * 60 * 60 * 1000;

			// Insert 4-installment package with #1 already paid
			const [pkg] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
					clientId: TEST_USER_ID,
					source: "pos",
					paymentStatus: "pending",
					creditsTotal: 4,
					creditsUsed: 0,
					creditsUnlocked: 1,
					paymentPlanType: "quarterly",
					installmentsTotal: 4,
					installmentsPaid: 1,
					isLocked: false,
					allowCreditOverdraft: false,
					status: "active",
					startsAt: now,
					expiresAt: future,
					nextDueDate: new Date(now.getTime() + intervalMs),
				})
				.returning();

			if (!pkg) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(pkg.id);

			// Insert installment rows: #1 paid, #2-4 pending
			const installmentValues = [
				{ installmentNumber: 1, status: "paid" as const, dueDate: now },
				{ installmentNumber: 2, status: "pending" as const, dueDate: new Date(now.getTime() + intervalMs) },
				{ installmentNumber: 3, status: "pending" as const, dueDate: new Date(now.getTime() + 2 * intervalMs) },
				{ installmentNumber: 4, status: "overdue" as const, dueDate: new Date(now.getTime() - intervalMs) },
			];

			for (const v of installmentValues) {
				await tenantDb.insert(installments).values({
					packageInstanceId: pkg.id,
					installmentNumber: v.installmentNumber,
					amount: 2500,
					taxAmount: 0,
					status: v.status,
					dueDate: v.dueDate,
					creditsUnlockedByThis: 1,
				});
			}

			const ctx = makeIntegrationAdminContext(tenantDb);
			const actor = { userId: ctx.session.user.id, memberId: ctx.member.id, role: ctx.member.role };

			await processRefund(tenantDb, pkg.id, 7500, actor.userId, "Customer requested refund", actor);

			// Package should be cancelled
			const [updatedPkg] = await tenantDb
				.select({ status: packageInstances.status, paymentStatus: packageInstances.paymentStatus })
				.from(packageInstances)
				.where(eq(packageInstances.id, pkg.id));

			expect(updatedPkg?.status).toBe("cancelled");
			expect(updatedPkg?.paymentStatus).toBe("refunded");

			// Installments #2, #3 (pending) and #4 (overdue) should all be cancelled
			const remaining = await tenantDb
				.select({ installmentNumber: installments.installmentNumber, status: installments.status })
				.from(installments)
				.where(eq(installments.packageInstanceId, pkg.id));

			const byNumber = Object.fromEntries(remaining.map((r) => [r.installmentNumber, r.status]));
			expect(byNumber[1]).toBe("paid");    // #1 was already paid — untouched
			expect(byNumber[2]).toBe("cancelled");
			expect(byNumber[3]).toBe("cancelled");
			expect(byNumber[4]).toBe("cancelled");

			// installmentEvents should contain the manual_refund event
			const events = await tenantDb
				.select({ eventType: installmentEvents.eventType })
				.from(installmentEvents)
				.where(eq(installmentEvents.packageInstanceId, pkg.id));

			expect(events.some((e) => e.eventType === "manual_refund")).toBe(true);
		},
		30000,
	);

	test(
		"refund on a package with no pending installments still cancels the package",
		async () => {
			if (shouldSkipIntegration()) return;

			const [service] = await tenantDb.select({ id: services.id }).from(services).limit(1);
			if (!service) return;

			const now = new Date();
			const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

			const [pkg] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
					clientId: TEST_USER_ID,
					source: "pos",
					paymentStatus: "paid",
					creditsTotal: 2,
					creditsUsed: 0,
					creditsUnlocked: 2,
					paymentPlanType: "half",
					installmentsTotal: 2,
					installmentsPaid: 2,
					isLocked: false,
					allowCreditOverdraft: false,
					status: "active",
					startsAt: now,
					expiresAt: future,
				})
				.returning();

			if (!pkg) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(pkg.id);

			const ctx = makeIntegrationAdminContext(tenantDb);
			const actor = { userId: ctx.session.user.id, memberId: ctx.member.id, role: ctx.member.role };

			// Should not throw even with zero pending installments
			await processRefund(tenantDb, pkg.id, 0, actor.userId, "Full usage refund", actor);

			const [updatedPkg] = await tenantDb
				.select({ status: packageInstances.status })
				.from(packageInstances)
				.where(eq(packageInstances.id, pkg.id));

			expect(updatedPkg?.status).toBe("cancelled");
		},
		30000,
	);
});
