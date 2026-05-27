/**
 * Integration test: Phase C — evaluateAndLockIfOverdue bulk sweep.
 *
 * Scenarios:
 *   A) Package with 3 installments all past due → all 3 marked overdue, gracePeriodEndsAt set.
 *   B) Package with grace period already expired → isLocked=true, gracePeriodEndsAt=null.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray, and } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_USER_ID,
} from "../helpers/integration-setup";
import { evaluateAndLockIfOverdue } from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
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
			.delete(packageInstances)
			.where(inArray(packageInstances.id, createdPackageInstanceIds));
	}
});

describe("evaluateAndLockIfOverdue integration", () => {
	test(
		"3 installments all past due → all marked overdue and gracePeriodEndsAt set",
		async () => {
			if (shouldSkipIntegration()) return;

			const [service] = await tenantDb.select({ id: services.id }).from(services).limit(1);
			if (!service) {
				console.warn("[integration] No services found — skipping");
				return;
			}

			const now = new Date();
			const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
			// nextDueDate 5 days ago — within default 7-day grace
			const overdueDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

			const [pkg] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
					clientId: TEST_USER_ID,
					source: "pos",
					paymentStatus: "pending",
					creditsTotal: 6,
					creditsUsed: 0,
					creditsUnlocked: 0,
					paymentPlanType: "quarterly",
					installmentsTotal: 3,
					installmentsPaid: 0,
					isLocked: false,
					allowCreditOverdraft: false,
					status: "active",
					startsAt: overdueDate,
					expiresAt: future,
					nextDueDate: overdueDate,
					gracePeriodEndsAt: null,
				})
				.returning();

			if (!pkg) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(pkg.id);

			// 3 installments all past due (60, 30, and 5 days ago)
			const dueDates = [
				new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
				new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
				overdueDate,
			];

			for (let i = 0; i < dueDates.length; i++) {
				await tenantDb.insert(installments).values({
					packageInstanceId: pkg.id,
					installmentNumber: i + 1,
					amount: 3000,
					taxAmount: 0,
					status: "pending",
					dueDate: dueDates[i]!,
					creditsUnlockedByThis: 2,
				});
			}

			await evaluateAndLockIfOverdue(tenantDb, pkg.id);

			// All 3 installments should be marked overdue
			const rows = await tenantDb
				.select({ status: installments.status })
				.from(installments)
				.where(eq(installments.packageInstanceId, pkg.id));

			expect(rows).toHaveLength(3);
			expect(rows.every((r) => r.status === "overdue")).toBe(true);

			// Package should have gracePeriodEndsAt set (not locked yet — grace not expired)
			const [updatedPkg] = await tenantDb
				.select({ gracePeriodEndsAt: packageInstances.gracePeriodEndsAt, isLocked: packageInstances.isLocked })
				.from(packageInstances)
				.where(eq(packageInstances.id, pkg.id));

			expect(updatedPkg?.isLocked).toBe(false);
			expect(updatedPkg?.gracePeriodEndsAt).not.toBeNull();

			// installment_overdue events should exist for each row
			const events = await tenantDb
				.select({ eventType: installmentEvents.eventType })
				.from(installmentEvents)
				.where(
					and(
						eq(installmentEvents.packageInstanceId, pkg.id),
						eq(installmentEvents.eventType, "installment_overdue"),
					),
				);

			expect(events.length).toBeGreaterThanOrEqual(3);
		},
		30000,
	);

	test(
		"grace period already expired → package locked, gracePeriodEndsAt cleared",
		async () => {
			if (shouldSkipIntegration()) return;

			const [service] = await tenantDb.select({ id: services.id }).from(services).limit(1);
			if (!service) return;

			const now = new Date();
			const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
			// nextDueDate 30 days ago, grace of 7 days ended 23 days ago
			const overdueDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			const expiredGrace = new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000);

			const [pkg] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
					clientId: TEST_USER_ID,
					source: "pos",
					paymentStatus: "pending",
					creditsTotal: 2,
					creditsUsed: 0,
					creditsUnlocked: 0,
					paymentPlanType: "half",
					installmentsTotal: 2,
					installmentsPaid: 0,
					isLocked: false,
					allowCreditOverdraft: false,
					status: "active",
					startsAt: overdueDate,
					expiresAt: future,
					nextDueDate: overdueDate,
					gracePeriodEndsAt: expiredGrace,
				})
				.returning();

			if (!pkg) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(pkg.id);

			await tenantDb.insert(installments).values({
				packageInstanceId: pkg.id,
				installmentNumber: 1,
				amount: 5000,
				taxAmount: 0,
				status: "overdue",
				dueDate: overdueDate,
				creditsUnlockedByThis: 1,
			});

			await evaluateAndLockIfOverdue(tenantDb, pkg.id);

			const [updatedPkg] = await tenantDb
				.select({
					isLocked: packageInstances.isLocked,
					lockedReason: packageInstances.lockedReason,
					gracePeriodEndsAt: packageInstances.gracePeriodEndsAt,
				})
				.from(packageInstances)
				.where(eq(packageInstances.id, pkg.id));

			expect(updatedPkg?.isLocked).toBe(true);
			expect(updatedPkg?.lockedReason).toBe("non_payment");
			// gracePeriodEndsAt must be cleared on lock (Phase C fix)
			expect(updatedPkg?.gracePeriodEndsAt).toBeNull();
		},
		30000,
	);
});
