/**
 * Journey: Idempotency guards — double payment-confirm and double payout
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P0
 *
 * Two independent guards:
 *  (A) Confirming a package payment twice must NOT double-credit — the second
 *      confirmPayment returns { alreadyConfirmed: true } and the package stays paid.
 *  (B) Running a payout batch twice for the same staff + period must NOT pay the
 *      same approved split twice — the first batch marks it paid; the second finds
 *      no eligible (approved) splits and creates no additional paid payout for it.
 *
 * Run: bunx playwright test e2e/commission-payout-idempotency.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstService,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstBranchId,
	seedWalkInCustomer,
	cleanupWalkInCustomer,
	seedConfirmedAppointment,
	completeAppointment,
	cleanupAppointment,
	getCommissionSplitsForAppointment,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

type Page = import("@playwright/test").Page;
type PendingRow = { id: string; status: string; paymentStatus: string | null };

async function listApprovals(page: Page, st: string): Promise<PendingRow[]> {
	try {
		return await orpcCall<object, PendingRow[]>(
			page,
			"packageInstances",
			"listPending",
			{
				organizationId: TEST_ORG_ID,
				scope: "all",
				limit: 200,
				approvalStatus: st,
			},
		);
	} catch {
		return [];
	}
}

// ─── (A) Double payment-confirm ────────────────────────────────────────────────

test("confirming a package payment twice is idempotent (second is a no-op)", {
	tag: ["@p0"],
}, async ({ page }) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const service = await pickFirstService(page, {
		isPackage: true,
		hasSessions: true,
	});
	test.skip(!service, "No package service — skip");

	const rand = Math.floor(Math.random() * 1e6);
	const customer = await seedWalkInCustomer(page, {
		name: `IdemPay ${rand}`,
		phone: `+60 11-${String(rand).slice(0, 4).padStart(4, "0")} ${String(rand).slice(-4).padStart(4, "0")}`,
	});
	test.skip(!customer, "Could not seed customer — skip");

	let packageInstanceId = "";
	try {
		const now = new Date("2026-06-01T00:00:00.000Z").getTime();
		const created = await orpcCall<object, { id: string }>(
			page,
			"packageInstances",
			"create",
			{
				organizationId: TEST_ORG_ID,
				serviceId: service!.id,
				clientId: customer!.userId,
				source: "purchased",
				paymentStatus: "pending", // awaiting_payment
				paymentMethod: "cash",
				totalPrice: 30000,
				creditsTotal:
					service!.sessionCount && service!.sessionCount > 0
						? service!.sessionCount
						: 10,
				startsAt: new Date(now).toISOString(),
				expiresAt: new Date(now + 180 * 86_400_000).toISOString(),
			},
		);
		packageInstanceId = created.id;
		expect(packageInstanceId).toBeTruthy();

		// First confirm → succeeds (not alreadyConfirmed).
		const first = await orpcCall<object, { alreadyConfirmed?: boolean }>(
			page,
			"packageInstances",
			"confirmPayment",
			{ organizationId: TEST_ORG_ID, packageInstanceId, paymentMethod: "cash" },
		);
		expect(first?.alreadyConfirmed ?? false).toBe(false);

		// Second confirm → idempotent no-op.
		const second = await orpcCall<object, { alreadyConfirmed?: boolean }>(
			page,
			"packageInstances",
			"confirmPayment",
			{ organizationId: TEST_ORG_ID, packageInstanceId, paymentMethod: "cash" },
		);
		expect(second?.alreadyConfirmed).toBe(true);

		// The package left awaiting_payment exactly once (now pending, not double).
		expect(
			(await listApprovals(page, "awaiting_payment")).some(
				(r) => r.id === packageInstanceId,
			),
		).toBe(false);
		expect(
			(await listApprovals(page, "pending")).some(
				(r) => r.id === packageInstanceId,
			),
		).toBe(true);
	} finally {
		if (packageInstanceId) {
			try {
				await orpcCall(page, "packageInstances", "reject", {
					organizationId: TEST_ORG_ID,
					packageInstanceId,
					reason: "E2E cleanup",
				});
			} catch (err) {
				if (!(err instanceof OrpcClientError)) throw err;
			}
		}
		if (customer?.userId) await cleanupWalkInCustomer(page, customer.userId);
	}
});

// ─── (B) Double payout batch ────────────────────────────────────────────────────

test("running a payout batch twice does not pay the same split twice", {
	tag: ["@p0"],
}, async ({ page }) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const trainer = await pickFirstActiveTrainer(page);
	test.skip(!trainer, "No active trainer — skip");
	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client — skip");

	const branchId = trainer!.hierarchyScopeId ?? (await pickFirstBranchId(page));
	const service = await pickFirstService(page);

	let appointmentId = "";
	try {
		appointmentId = await seedConfirmedAppointment(page, {
			trainerMemberId: trainer!.memberId,
			trainerUserId: trainer!.userId,
			clientUserId: client!.userId,
			serviceId: service?.id ?? null,
			branchId: branchId!,
			offsetMinutes: 240,
		});
	} catch (err) {
		test.skip(true, `Could not seed appointment: ${String(err)}`);
	}

	await completeAppointment(page, appointmentId);
	await page.waitForTimeout(500);

	const splits = await getCommissionSplitsForAppointment(page, appointmentId);
	test.skip(splits.length === 0, "No commission config — skip");
	const split = splits.find((s) => s.earnReason === "completion")!;
	const splitId = split.id;

	// Approve, then run the batch period that contains the split (earnedAt = now).
	await orpcCall(page, "commissionSplits", "approve", {
		organizationId: TEST_ORG_ID,
		ids: [splitId],
	});

	const period = {
		periodStart: new Date("2026-01-01T00:00:00.000Z").toISOString(),
		periodEnd: new Date("2026-12-31T23:59:59.999Z").toISOString(),
		paymentMethod: "cash" as const,
		confirmImmediately: true,
	};
	const batchInput = {
		organizationId: TEST_ORG_ID,
		staffIds: [trainer!.userId],
		...period,
	};

	// Count the trainer's paid payouts before.
	const paidCount = async (): Promise<number> => {
		type P = { status: string };
		try {
			const rows = await orpcCall<object, P[]>(page, "payouts", "list", {
				organizationId: TEST_ORG_ID,
				recipientId: trainer!.userId,
			});
			return rows.filter((p) => p.status === "paid").length;
		} catch {
			return 0;
		}
	};
	const before = await paidCount();

	// First batch pays the split.
	await orpcCall(page, "payouts", "runBatch", batchInput);
	await expect
		.poll(
			async () =>
				getCommissionSplitsForAppointment(page, appointmentId).then(
					(s) => s.find((x) => x.id === splitId)?.status,
				),
			{ timeout: 10_000 },
		)
		.toBe("paid");
	const afterFirst = await paidCount();
	expect(afterFirst).toBeGreaterThan(before);

	// Second batch — same staff + period — has no approved splits left for this
	// appointment, so it must NOT produce another paid payout for the same split.
	try {
		await orpcCall(page, "payouts", "runBatch", batchInput);
	} catch (err) {
		// Some implementations reject an empty batch — that's an acceptable guard too.
		if (!(err instanceof OrpcClientError)) throw err;
	}

	// The split is still paid exactly once (not reverted, not re-paid into a 2nd row
	// for the same earning) — paid count did not jump by another for this split.
	const after = await getCommissionSplitsForAppointment(page, appointmentId);
	expect(after.find((s) => s.id === splitId)?.status).toBe("paid");
	// No NEW paid payout was created beyond the first batch's.
	expect(await paidCount()).toBe(afterFirst);

	await cleanupAppointment(page, appointmentId);
});
