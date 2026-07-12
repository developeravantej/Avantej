import { test, expect } from "@playwright/test";
import {
	Cleanup,
	getBranchId,
	getOrgId,
	expectRejected,
	rpc,
	rpcRaw,
	testId,
} from "../_safe-mutation";

// ============================================================================
// Payroll period lock/unlock lifecycle (WS5).
//
// The REAL invariant behind lockNow (read from payroll-period.service.ts /
// commission-splits.service.ts): locking a (branch, window) freezes commission
// corrections in it — e.g. commissionSplits/void of a split earned in the
// locked window is rejected with PAYROLL_PERIOD_LOCKED. Unlock (reason
// mandatory, audited as `payroll_period.unlock`) lifts the freeze.
//
// Flow (API-driven, fresh seeds only):
//   seed split in branch (fresh sales order target) → lockNow → assert state
//   → void is BLOCKED (the freeze) → unlock(reason) → state open + reason
//   recorded (row + audit log) → void now SUCCEEDS (freeze lifted — doubles
//   as teardown).
// ============================================================================

test.describe("payroll-periods — lock/unlock lifecycle", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("lock freezes commission corrections; unlock (reason required + audited) lifts it", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// ── 0. Pre-check: don't stomp a real lock on the current window ────────
		const before = await rpc(page.request, "payrollPeriods/list", {
			organizationId,
			branchNodeId: branchId,
		});
		const now = Date.now();
		const currentLocked = (Array.isArray(before) ? before : []).find(
			(p: { periodStart: string; periodEnd: string; state: string }) =>
				p.state === "locked" &&
				new Date(p.periodStart).getTime() <= now &&
				now < new Date(p.periodEnd).getTime(),
		);
		test.skip(
			!!currentLocked,
			"current payroll period is already locked on this tenant — refusing to unlock real state",
		);

		// ── 1. Seed a commission split in this branch (fresh target) ───────────
		const order = await rpc(page.request, "salesOrders/create", {
			organizationId,
			date: new Date().toISOString(),
			customerName: testId("payroll-target"),
			createdBy: "e2e-payroll-lifecycle",
			branchId,
			totalAmount: 999,
		});
		expect(order?.id).toBeTruthy();
		cleanup.add(`sales order ${order.id}`, async () => {
			await rpcRaw(page.request, "salesOrders/cancel", {
				organizationId,
				id: order.id,
				reason: "E2E teardown",
			});
		});

		// Any staff member works as the adjustment recipient.
		const membersRes = await rpc(page.request, "members/list", {
			organizationId,
		});
		const members = (
			Array.isArray(membersRes) ? membersRes : (membersRes?.items ?? [])
		).filter((m: { userId?: string }) => !!m.userId);
		test.skip(members.length === 0, "tenant has no staff members");

		const split = await rpc(
			page.request,
			"commissionSplits/createManualAdjustment",
			{
				organizationId,
				staffId: members[0].userId,
				amountCents: 999, // integer cents, below review threshold
				note: testId("payroll-lock-seed"),
				salesOrderId: order.id,
			},
		);
		expect(split?.id).toBeTruthy();
		// Safety net: if the assertions below fail before the final void, tear
		// the split down anyway (void is idempotent; a still-locked period makes
		// this fail loudly in the cleanup log rather than silently).
		cleanup.add(`commission split ${split.id}`, async () => {
			await rpcRaw(page.request, "commissionSplits/void", {
				organizationId,
				id: split.id,
				reason: "E2E teardown",
			});
		});

		// ── 2. Lock the current window for this branch ─────────────────────────
		const locked = await rpc(page.request, "payrollPeriods/lockNow", {
			organizationId,
			branchNodeId: branchId,
		});
		expect(locked?.id).toBeTruthy();
		expect(locked.state).toBe("locked");
		expect(locked.lockKind).toBe("manual");
		expect(locked.branchNodeId).toBe(branchId);
		// The locked window covers "now" (the seeded split's earnedAt).
		expect(new Date(locked.periodStart).getTime()).toBeLessThanOrEqual(now);
		expect(new Date(locked.periodEnd).getTime()).toBeGreaterThan(now);

		const periodId = locked.id as string;
		cleanup.add(`payroll period ${periodId} (ensure unlocked)`, async () => {
			await rpcRaw(page.request, "payrollPeriods/unlock", {
				organizationId,
				periodId,
				reason: "E2E teardown unlock",
			});
		});

		// List reflects the lock.
		const midList = await rpc(page.request, "payrollPeriods/list", {
			organizationId,
			branchNodeId: branchId,
		});
		const lockedRow = (Array.isArray(midList) ? midList : []).find(
			(p: { id: string }) => p.id === periodId,
		);
		expect(lockedRow?.state).toBe("locked");
		expect(lockedRow?.lockedAt).toBeTruthy();
		expect(lockedRow?.lockedBy).toBeTruthy();

		// ── 3. THE INVARIANT: the locked window freezes commission corrections ─
		const voidRes = await rpcRaw(page.request, "commissionSplits/void", {
			organizationId,
			id: split.id,
			reason: "must be blocked by the lock",
		});
		expect(
			voidRes.status(),
			"void inside a locked period must be rejected",
		).toBe(400);
		const voidBody = await voidRes.text();
		expect(voidBody).toContain("PAYROLL_PERIOD_LOCKED");

		// ── 4. Unlock requires a real reason (server zod: min 3 chars) ─────────
		await expectRejected(
			page.request,
			"payrollPeriods/unlock",
			{ organizationId, periodId, reason: "ab" },
			[400],
		);

		// ── 5. Unlock with a proper reason ─────────────────────────────────────
		const unlockReason = testId("unlock-reason");
		const unlocked = await rpc(page.request, "payrollPeriods/unlock", {
			organizationId,
			periodId,
			reason: unlockReason,
		});
		expect(unlocked.state).toBe("open");
		expect(unlocked.unlockReason).toBe(unlockReason);

		// The list row records the reason too.
		const afterList = await rpc(page.request, "payrollPeriods/list", {
			organizationId,
			branchNodeId: branchId,
		});
		const openRow = (Array.isArray(afterList) ? afterList : []).find(
			(p: { id: string }) => p.id === periodId,
		);
		expect(openRow?.state).toBe("open");
		expect(openRow?.unlockReason).toBe(unlockReason);

		// ── 6. Audit trail: payroll_period.unlock carries the reason ───────────
		const auditRes = await rpc(page.request, "auditLogs/list", {
			organizationId,
			action: "payroll_period.unlock",
			entityId: periodId,
			limit: 20,
		});
		const auditRows = Array.isArray(auditRes)
			? auditRes
			: (auditRes?.rows ?? auditRes?.items ?? []);
		const ourAudit = auditRows.find(
			(r: { entityId?: string; summary?: string }) =>
				r.entityId === periodId && (r.summary ?? "").includes(unlockReason),
		);
		expect(
			ourAudit,
			`expected a payroll_period.unlock audit row for ${periodId} containing the reason`,
		).toBeTruthy();

		// ── 7. Freeze lifted: the void that was blocked now succeeds ───────────
		const voided = await rpc(page.request, "commissionSplits/void", {
			organizationId,
			id: split.id,
			reason: "E2E teardown (post-unlock)",
		});
		expect(voided.status).toBe("void");
	});
});
