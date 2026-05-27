/**
 * Integration test for the installments.setOverdraft API procedure.
 *
 * Requires TENANT_DATABASE_URL in .dev.vars (same requirement as other integration tests).
 * Set SKIP_INTEGRATION_TESTS=true to skip.
 *
 * Test scenario:
 *   1. Find an existing service in the dev tenant DB to satisfy the FK constraint.
 *   2. Insert a minimal packageInstances row with isLocked=true, allowCreditOverdraft=false.
 *   3. Call setPackageOverdraft(enabled=true).
 *   4. Assert: returned row has allowCreditOverdraft=true.
 *   5. Assert: a matching audit_log row exists with action="package.overdraft_enabled".
 *   6. Clean up all created rows.
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
import { setPackageOverdraft } from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";
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
		// installmentEvents has CASCADE on packageInstanceId, so no need to delete those manually.
		// auditLogs has no FK — delete by entityId.
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

describe("installments.setOverdraft integration", () => {
	test(
		"admin sets overdraft=true → returns updated row and audit_log row",
		async () => {
			if (shouldSkipIntegration()) return;

			// Find any active service to satisfy the FK constraint
			const [service] = await tenantDb
				.select({ id: services.id })
				.from(services)
				.limit(1);

			if (!service) {
				console.warn("[integration] No services found in dev tenant DB — skipping test");
				return;
			}

			// Insert a minimal locked package instance
			const now = new Date();
			const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // +90 days

			const [inserted] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
					clientId: TEST_USER_ID,
					source: "assigned",
					paymentStatus: "pending",
					creditsTotal: 4,
					creditsUsed: 0,
					paymentPlanType: "half",
					installmentsTotal: 2,
					installmentsPaid: 0,
					isLocked: true,
					lockedAt: now,
					lockedReason: "non_payment",
					allowCreditOverdraft: false,
					status: "active",
					startsAt: now,
					expiresAt,
				})
				.returning();

			if (!inserted) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(inserted.id);

			// Call the service function directly (mirrors what the router procedure does)
			const ctx = makeIntegrationAdminContext(tenantDb);
			const actor = {
				userId: ctx.session.user.id,
				memberId: ctx.member.id,
				role: ctx.member.role,
			};

			const result = await setPackageOverdraft(
				tenantDb,
				inserted.id,
				true,
				"Integration test: VIP customer override",
				actor,
			);

			// Assert returned row
			expect(result.id).toBe(inserted.id);
			expect(result.allowCreditOverdraft).toBe(true);

			// Assert audit_log row exists
			const auditRows = await tenantDb
				.select()
				.from(auditLogs)
				.where(
					and(
						eq(auditLogs.entityType, "package_instance"),
						eq(auditLogs.entityId as any, inserted.id),
						eq(auditLogs.action, "package.overdraft_enabled"),
					),
				);

			expect(auditRows.length).toBeGreaterThanOrEqual(1);
			expect(auditRows[0]?.actorUserId).toBe(actor.userId);

			// Assert installment_events row exists
			const eventRows = await tenantDb
				.select()
				.from(installmentEvents)
				.where(
					and(
						eq(installmentEvents.packageInstanceId, inserted.id),
						eq(installmentEvents.eventType, "overdraft_enabled"),
					),
				);

			expect(eventRows.length).toBeGreaterThanOrEqual(1);
		},
		30000,
	);

	test(
		"setOverdraft is idempotent — calling enabled=true again returns same row with no new audit row",
		async () => {
			if (shouldSkipIntegration()) return;

			const [service] = await tenantDb
				.select({ id: services.id })
				.from(services)
				.limit(1);

			if (!service) {
				console.warn("[integration] No services found in dev tenant DB — skipping test");
				return;
			}

			const now = new Date();
			const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

			// Insert with allowCreditOverdraft already true
			const [inserted] = await tenantDb
				.insert(packageInstances)
				.values({
					serviceId: service.id,
					clientId: TEST_USER_ID,
					source: "assigned",
					paymentStatus: "pending",
					creditsTotal: 4,
					creditsUsed: 0,
					paymentPlanType: "half",
					installmentsTotal: 2,
					installmentsPaid: 0,
					isLocked: true,
					lockedAt: now,
					lockedReason: "non_payment",
					allowCreditOverdraft: true, // already enabled
					status: "active",
					startsAt: now,
					expiresAt,
				})
				.returning();

			if (!inserted) throw new Error("Failed to insert test packageInstance");
			createdPackageInstanceIds.push(inserted.id);

			const ctx = makeIntegrationAdminContext(tenantDb);
			const actor = {
				userId: ctx.session.user.id,
				memberId: ctx.member.id,
				role: ctx.member.role,
			};

			// Call with enabled=true (same as current state — no-op)
			const result = await setPackageOverdraft(
				tenantDb,
				inserted.id,
				true,
				"Should be no-op",
				actor,
			);

			expect(result.allowCreditOverdraft).toBe(true);

			// No audit row should have been written
			const auditRows = await tenantDb
				.select()
				.from(auditLogs)
				.where(
					and(
						eq(auditLogs.entityType, "package_instance"),
						eq(auditLogs.entityId as any, inserted.id),
					),
				);

			expect(auditRows).toHaveLength(0);
		},
		30000,
	);
});