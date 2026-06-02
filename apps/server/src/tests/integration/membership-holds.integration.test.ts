/**
 * Membership Holds Integration Tests (Phase 3 Agent 3.1 — J4)
 *
 * Covers:
 *   (a) freeze: hold row created, package status='paused', status_history written
 *   (b) resume: hold.status='completed', package status reverted, history row written
 *   (c) auto-resume cron: insert hold w/ end_date past → run cron → assert resumed
 *
 * Uses SKIP_INTEGRATION_TESTS=true gate (mirrors expenses.integration.test.ts).
 *
 * Each test creates its own ephemeral package_instances row (so tests are
 * independent) and tears it down in afterAll alongside membership_holds rows.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { membershipHolds } from "@avantej-core/db/schema/tenant/membership-holds";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { packageInstanceStatusHistory } from "@avantej-core/db/schema/tenant/package-instance-status-history";
import { services } from "@avantej-core/db/schema/tenant/services";
import {
	freezeMembership,
	resumeMembership,
	listHoldsForPackage,
	runAutoResumeHolds,
} from "@avantej-core/services/membership.service";
import {
	createTenantDb,
	loadDevVars,
	shouldSkipIntegration,
	TEST_USER_ID,
} from "../helpers/integration-setup";

let tenantDb: ReturnType<typeof createTenantDb>;
const createdPackageIds: string[] = [];

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || createdPackageIds.length === 0) return;
	// holds cascade on package delete, but be explicit so a leaked package
	// (e.g. from a thrown test) doesn't strand history rows.
	await tenantDb
		.delete(packageInstanceStatusHistory)
		.where(
			inArray(
				packageInstanceStatusHistory.packageInstanceId,
				createdPackageIds,
			),
		);
	await tenantDb
		.delete(membershipHolds)
		.where(inArray(membershipHolds.packageInstanceId, createdPackageIds));
	await tenantDb
		.delete(packageInstances)
		.where(inArray(packageInstances.id, createdPackageIds));
});

/**
 * Insert a minimal `package_instances` row for one test, returning its id.
 * Picks the first existing service in the tenant DB — services aren't
 * created here because they touch FK chains (categories, branches) outside
 * this agent's scope.
 */
async function makeTestPackage(): Promise<string> {
	const svc = await tenantDb.query.services.findFirst();
	if (!svc) {
		throw new Error(
			"No services row exists in tenant DB — required for test package creation",
		);
	}
	const startsAt = new Date();
	const expiresAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
	const [row] = await tenantDb
		.insert(packageInstances)
		.values({
			serviceId: svc.id,
			clientId: TEST_USER_ID,
			source: "assigned",
			assignedBy: TEST_USER_ID,
			creditsTotal: 10,
			creditsUsed: 0,
			startsAt,
			expiresAt,
			status: "active",
			paymentStatus: "paid",
		})
		.returning({ id: packageInstances.id });
	if (!row) throw new Error("Failed to create test package_instances row");
	createdPackageIds.push(row.id);
	return row.id;
}

describe("Membership Holds Integration (J4)", () => {
	test("(a) freeze creates hold, pauses package, writes status_history", async () => {
		if (shouldSkipIntegration()) return;

		const pkgId = await makeTestPackage();
		const start = new Date();
		const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

		const { hold, previousStatus } = await freezeMembership(tenantDb, {
			packageInstanceId: pkgId,
			startDate: start,
			endDate: end,
			reason: "medical",
			feeWaived: true,
			createdBy: TEST_USER_ID,
		});

		expect(hold.status).toBe("active");
		expect(hold.feeWaived).toBe(true);
		expect(hold.reason).toBe("medical");
		expect(previousStatus).toBe("active");

		const pkg = await tenantDb.query.packageInstances.findFirst({
			where: eq(packageInstances.id, pkgId),
		});
		expect(pkg?.status).toBe("paused");

		const history = await tenantDb
			.select()
			.from(packageInstanceStatusHistory)
			.where(eq(packageInstanceStatusHistory.packageInstanceId, pkgId));
		expect(history.length).toBe(1);
		expect(history[0]?.toStatus).toBe("paused");
		expect(history[0]?.fromStatus).toBe("active");
		expect(history[0]?.changedBy).toBe(TEST_USER_ID);
	}, 30000);

	test("(b) resume marks hold completed, reverts package, appends history", async () => {
		if (shouldSkipIntegration()) return;

		const pkgId = await makeTestPackage();
		const start = new Date();
		const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

		const { hold } = await freezeMembership(tenantDb, {
			packageInstanceId: pkgId,
			startDate: start,
			endDate: end,
			reason: "travel",
			createdBy: TEST_USER_ID,
		});

		const { hold: resumed } = await resumeMembership(tenantDb, hold.id, {
			resumedBy: TEST_USER_ID,
		});
		expect(resumed.status).toBe("completed");
		expect(resumed.resumedAt).toBeTruthy();

		const pkg = await tenantDb.query.packageInstances.findFirst({
			where: eq(packageInstances.id, pkgId),
		});
		expect(pkg?.status).toBe("active");

		const history = await tenantDb
			.select()
			.from(packageInstanceStatusHistory)
			.where(eq(packageInstanceStatusHistory.packageInstanceId, pkgId));
		// 1 freeze + 1 resume
		expect(history.length).toBe(2);
		expect(
			history.some((h) => h.toStatus === "active" && h.reason === "resume"),
		).toBe(true);

		// Resuming again throws (hold not active)
		await expect(
			resumeMembership(tenantDb, hold.id, { resumedBy: TEST_USER_ID }),
		).rejects.toThrow("not active");
	}, 30000);

	test("(c) auto-resume cron picks up expired holds and resumes them", async () => {
		if (shouldSkipIntegration()) return;

		const pkgId = await makeTestPackage();
		// Freeze with a window that already ended (start 2d ago, end 1d ago).
		const start = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
		const end = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

		const { hold } = await freezeMembership(tenantDb, {
			packageInstanceId: pkgId,
			startDate: start,
			endDate: end,
			reason: "other",
			createdBy: TEST_USER_ID,
		});
		expect(hold.status).toBe("active");

		const result = await runAutoResumeHolds(tenantDb);
		expect(result.scanned).toBeGreaterThanOrEqual(1);
		expect(result.resumed).toBeGreaterThanOrEqual(1);
		expect(result.errors.length).toBe(0);

		const reloaded = await tenantDb.query.membershipHolds.findFirst({
			where: eq(membershipHolds.id, hold.id),
		});
		expect(reloaded?.status).toBe("completed");

		const pkg = await tenantDb.query.packageInstances.findFirst({
			where: eq(packageInstances.id, pkgId),
		});
		expect(pkg?.status).toBe("active");
	}, 30000);

	test("listHoldsForPackage returns most-recent first", async () => {
		if (shouldSkipIntegration()) return;

		const pkgId = await makeTestPackage();
		const baseStart = new Date(Date.now() + 60_000);
		const { hold: first } = await freezeMembership(tenantDb, {
			packageInstanceId: pkgId,
			startDate: baseStart,
			endDate: new Date(baseStart.getTime() + 24 * 3600 * 1000),
			reason: "medical",
			createdBy: TEST_USER_ID,
		});
		await resumeMembership(tenantDb, first.id, { resumedBy: TEST_USER_ID });

		const laterStart = new Date(baseStart.getTime() + 5 * 60_000);
		const { hold: second } = await freezeMembership(tenantDb, {
			packageInstanceId: pkgId,
			startDate: laterStart,
			endDate: new Date(laterStart.getTime() + 24 * 3600 * 1000),
			reason: "travel",
			createdBy: TEST_USER_ID,
		});

		const list = await listHoldsForPackage(tenantDb, pkgId);
		expect(list.length).toBe(2);
		expect(list[0]?.id).toBe(second.id);
		expect(list[1]?.id).toBe(first.id);
	}, 30000);

	test("freezeMembership rejects when package already paused", async () => {
		if (shouldSkipIntegration()) return;

		const pkgId = await makeTestPackage();
		const start = new Date();
		const end = new Date(start.getTime() + 24 * 3600 * 1000);

		await freezeMembership(tenantDb, {
			packageInstanceId: pkgId,
			startDate: start,
			endDate: end,
			reason: "medical",
			createdBy: TEST_USER_ID,
		});

		await expect(
			freezeMembership(tenantDb, {
				packageInstanceId: pkgId,
				startDate: start,
				endDate: end,
				reason: "medical",
				createdBy: TEST_USER_ID,
			}),
		).rejects.toThrow("cannot be frozen");

		// Touch services schema to keep the import meaningful for Drizzle
		// (relations resolution validates against the schema barrel).
		void services;
	}, 30000);
});
