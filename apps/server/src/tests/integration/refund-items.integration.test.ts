/**
 * Refund Items Integration Tests (Agent 2.8 — Phase 2 Wave 3d — J5)
 *
 * Verifies partial-package refund correctness:
 *   (a) 7/10 credits refunded → credits_used 0 → 7, refund_items row written
 *   (b) Sequential 5+2 refunds → cumulative credits_used = 7
 *   (c) Concurrent refunds — only one of two parallel txs succeeds (FOR UPDATE)
 *   (d) Validation: refund > remaining → throws
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { refundItems } from "@avantej-core/db/schema/tenant/refund-items";
import { refunds } from "@avantej-core/db/schema/tenant/refunds";
import { createPartialRefund } from "@avantej-core/services/refunds.service";
import {
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
	TEST_USER_ID,
} from "../helpers/integration-setup";

loadDevVars();
const SKIP = shouldSkipIntegration() || !process.env.TENANT_DATABASE_URL;

let tenantDb: ReturnType<typeof createTenantDb>;
const createdPackageInstanceIds: string[] = [];
const createdRefundIds: string[] = [];

beforeAll(() => {
	if (SKIP) return;
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (SKIP) return;
	if (createdRefundIds.length > 0) {
		// refund_items cascades on refunds delete via FK; explicit cleanup just in case
		await tenantDb
			.delete(refundItems)
			.where(inArray(refundItems.refundId, createdRefundIds));
		await tenantDb.delete(refunds).where(inArray(refunds.id, createdRefundIds));
	}
	if (createdPackageInstanceIds.length > 0) {
		await tenantDb
			.delete(packageInstances)
			.where(inArray(packageInstances.id, createdPackageInstanceIds));
	}
});

async function seedPackageInstance(opts: {
	creditsTotal: number;
	totalPrice: number;
	clientId?: string;
}) {
	const someService = await tenantDb.query.services.findFirst();
	if (!someService) throw new Error("no services row in tenant DB; cannot test");

	const now = new Date();
	const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
	const [pkg] = await tenantDb
		.insert(packageInstances)
		.values({
			serviceId: someService.id,
			clientId: opts.clientId ?? TEST_USER_ID,
			source: "purchased",
			paymentStatus: "paid",
			creditsTotal: opts.creditsTotal,
			totalPrice: opts.totalPrice,
			startsAt: now,
			expiresAt: expires,
			status: "active",
		})
		.returning();
	if (!pkg) throw new Error("failed to insert package_instances");
	createdPackageInstanceIds.push(pkg.id);
	return pkg;
}

const actor = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

describe("Refund Items — Agent 2.8 — partial package refunds", () => {
	test("(a) refunding 7/10 credits increments credits_used and writes refund_items row", async () => {
		if (SKIP) return;

		const pkg = await seedPackageInstance({
			creditsTotal: 10,
			totalPrice: 100_000, // 1000 MYR — 100 cents per credit (10000 each)
		});

		const result = await createPartialRefund(tenantDb, {
			packageInstanceId: pkg.id,
			creditsRefunded: 7,
			reason: "Customer requested partial refund",
			branchId: TEST_BRANCH_NODE_ID,
			actor,
		});
		createdRefundIds.push(result.refundId);

		expect(result.refundNumber).toMatch(/^RF-\d{8}-\d{4}$/);
		expect(result.amountCents).toBe(70_000); // 7 * 10000

		// Re-fetch package and verify credits_used
		const [updated] = await tenantDb
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, pkg.id));
		expect(updated!.creditsUsed).toBe(7);
		// creditsRemaining is GENERATED — should compute to 3
		expect(updated!.creditsRemaining).toBe(3);

		// Verify refund_items row
		const items = await tenantDb
			.select()
			.from(refundItems)
			.where(eq(refundItems.refundId, result.refundId));
		expect(items.length).toBe(1);
		expect(items[0]!.creditsRefunded).toBe(7);
		expect(items[0]!.amountCents).toBe(70_000);
		expect(items[0]!.packageInstanceId).toBe(pkg.id);
		expect(items[0]!.salesOrderItemId).toBeNull();
	});

	test("(b) sequential refunds (5 + 2) accumulate credits_used to 7", async () => {
		if (SKIP) return;

		const pkg = await seedPackageInstance({
			creditsTotal: 10,
			totalPrice: 100_000,
		});

		const r1 = await createPartialRefund(tenantDb, {
			packageInstanceId: pkg.id,
			creditsRefunded: 5,
			reason: "first batch",
			branchId: TEST_BRANCH_NODE_ID,
			actor,
		});
		createdRefundIds.push(r1.refundId);

		const r2 = await createPartialRefund(tenantDb, {
			packageInstanceId: pkg.id,
			creditsRefunded: 2,
			reason: "second batch",
			branchId: TEST_BRANCH_NODE_ID,
			actor,
		});
		createdRefundIds.push(r2.refundId);

		const [updated] = await tenantDb
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, pkg.id));
		expect(updated!.creditsUsed).toBe(7);
		expect(updated!.creditsRemaining).toBe(3);
	});

	test("(c) concurrent refunds against same instance — both succeed sequentially via FOR UPDATE", async () => {
		if (SKIP) return;

		const pkg = await seedPackageInstance({
			creditsTotal: 10,
			totalPrice: 100_000,
		});

		// Two concurrent refunds of 4 credits each = 8 total (within cap of 10).
		// SELECT FOR UPDATE serializes them; both should succeed and credits_used = 8.
		const results = await Promise.all([
			createPartialRefund(tenantDb, {
				packageInstanceId: pkg.id,
				creditsRefunded: 4,
				reason: "concurrent A",
				branchId: TEST_BRANCH_NODE_ID,
				actor,
			}),
			createPartialRefund(tenantDb, {
				packageInstanceId: pkg.id,
				creditsRefunded: 4,
				reason: "concurrent B",
				branchId: TEST_BRANCH_NODE_ID,
				actor,
			}),
		]);
		for (const r of results) createdRefundIds.push(r.refundId);

		const [updated] = await tenantDb
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, pkg.id));
		expect(updated!.creditsUsed).toBe(8);
	});

	test("(c2) concurrent refunds where total would exceed cap — one succeeds, one fails", async () => {
		if (SKIP) return;

		const pkg = await seedPackageInstance({
			creditsTotal: 10,
			totalPrice: 100_000,
		});

		// Two concurrent refunds of 7 each = 14 total > cap of 10.
		// One must throw BAD_REQUEST; the other must succeed.
		const settled = await Promise.allSettled([
			createPartialRefund(tenantDb, {
				packageInstanceId: pkg.id,
				creditsRefunded: 7,
				reason: "race A",
				branchId: TEST_BRANCH_NODE_ID,
				actor,
			}),
			createPartialRefund(tenantDb, {
				packageInstanceId: pkg.id,
				creditsRefunded: 7,
				reason: "race B",
				branchId: TEST_BRANCH_NODE_ID,
				actor,
			}),
		]);

		const fulfilled = settled.filter((s) => s.status === "fulfilled");
		const rejected = settled.filter((s) => s.status === "rejected");
		expect(fulfilled.length).toBe(1);
		expect(rejected.length).toBe(1);

		// Track the successful refund so cleanup removes it
		const winner = fulfilled[0] as PromiseFulfilledResult<{
			refundId: string;
		}>;
		createdRefundIds.push(winner.value.refundId);

		const [updated] = await tenantDb
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, pkg.id));
		expect(updated!.creditsUsed).toBe(7);
	});

	test("(d) refund > remaining throws BAD_REQUEST and rolls back", async () => {
		if (SKIP) return;

		const pkg = await seedPackageInstance({
			creditsTotal: 5,
			totalPrice: 50_000,
		});

		await expect(
			createPartialRefund(tenantDb, {
				packageInstanceId: pkg.id,
				creditsRefunded: 99,
				reason: "way too many",
				branchId: TEST_BRANCH_NODE_ID,
				actor,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		// credits_used should remain 0 (full rollback)
		const [unchanged] = await tenantDb
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, pkg.id));
		expect(unchanged!.creditsUsed).toBe(0);

		// No refund or refund_items row should exist for this package
		const refundRows = await tenantDb
			.select()
			.from(refunds)
			.where(eq(refunds.packageInstanceId, pkg.id));
		expect(refundRows.length).toBe(0);
	});
});
