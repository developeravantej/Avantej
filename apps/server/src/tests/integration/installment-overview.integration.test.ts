/**
 * Integration test: Phase D — getAdminInstallmentOverview overdue filter.
 *
 * Scenario: Package with nextDueDate 5 minutes ago, no evaluator run yet
 * (gracePeriodEndsAt IS NULL). Should appear in status="overdue" filter.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
} from "../helpers/integration-setup";
import { getAdminInstallmentOverview } from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
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

describe("getAdminInstallmentOverview overdue filter integration", () => {
	test(
		"package with nextDueDate in the past (no evaluator run) appears in overdue filter",
		async () => {
			if (shouldSkipIntegration()) return;

			const [service] = await tenantDb.select({ id: services.id }).from(services).limit(1);
			if (!service) {
				console.warn("[integration] No services found — skipping");
				return;
			}

			const now = new Date();
			const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
			// nextDueDate 5 minutes ago — evaluator hasn't run yet (gracePeriodEndsAt = null)
			const justOverdue = new Date(now.getTime() - 5 * 60 * 1000);

			const [pkg] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
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
					startsAt: justOverdue,
					expiresAt: future,
					nextDueDate: justOverdue,
					gracePeriodEndsAt: null, // evaluator has NOT run
				})
				.returning();

			if (!pkg) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(pkg.id);

			const result = await getAdminInstallmentOverview(tenantDb, { status: "overdue", limit: 200 });

			const found = result.items.some((item) => item.id === pkg.id);
			expect(found).toBe(true);
		},
		30000,
	);

	test(
		"active package (nextDueDate in future) does NOT appear in overdue filter",
		async () => {
			if (shouldSkipIntegration()) return;

			const [service] = await tenantDb.select({ id: services.id }).from(services).limit(1);
			if (!service) return;

			const now = new Date();
			const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
			const nextDue = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

			const [pkg] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
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
					startsAt: now,
					expiresAt: future,
					nextDueDate: nextDue,
					gracePeriodEndsAt: null,
				})
				.returning();

			if (!pkg) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(pkg.id);

			const result = await getAdminInstallmentOverview(tenantDb, { status: "overdue", limit: 200 });

			const found = result.items.some((item) => item.id === pkg.id);
			expect(found).toBe(false);
		},
		30000,
	);
});
