import { test, expect } from "@playwright/test";
import { Cleanup, getBranchId, getOrgId, rpc, rpcRaw } from "../_safe-mutation";
import { smokeLoad } from "../_helpers";

// ============================================================================
// UI journey: the payroll unlock flow now runs through a proper dialog
// (UnlockPeriodDialog) instead of window.prompt — reason required, destructive
// confirm, mutation payload unchanged.
//
// Seeds its own lock via the API (payrollPeriods/lockNow), then drives the
// REAL page: Unlock → dialog opens → confirm disabled until a reason ≥ 3 chars
// → confirm → row flips to Open. Skips if the current window is already
// locked by real usage (never unlock real state).
// ============================================================================

test.describe("payroll-periods — unlock dialog journey", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Unlock opens a reason-required dialog and unlocks the period", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// Refuse to touch a pre-existing real lock on the current window.
		const before = await rpc(page.request, "payrollPeriods/list", {
			organizationId,
			branchNodeId: branchId,
		});
		const now = Date.now();
		const alreadyLocked = (Array.isArray(before) ? before : []).find(
			(p: { periodStart: string; periodEnd: string; state: string }) =>
				p.state === "locked" &&
				new Date(p.periodStart).getTime() <= now &&
				now < new Date(p.periodEnd).getTime(),
		);
		test.skip(
			!!alreadyLocked,
			"current payroll period already locked on this tenant",
		);

		// Seed the lock we will unlock through the UI.
		const locked = await rpc(page.request, "payrollPeriods/lockNow", {
			organizationId,
			branchNodeId: branchId,
		});
		expect(locked?.id).toBeTruthy();
		cleanup.add(`payroll period ${locked.id} (ensure unlocked)`, async () => {
			await rpcRaw(page.request, "payrollPeriods/unlock", {
				organizationId,
				periodId: locked.id,
				reason: "E2E teardown unlock",
			});
		});

		// ── Drive the real page ─────────────────────────────────────────────────
		await smokeLoad(page, "/dashboard/payroll-periods/view");
		await expect(page.getByText("Payroll Periods").first()).toBeVisible();

		// A locked row exposes an Unlock action.
		const unlockButton = page
			.getByRole("button", { name: "Unlock", exact: true })
			.first();
		await expect(unlockButton).toBeVisible({ timeout: 15_000 });

		// No window.prompt — a dialog opens instead.
		page.on("dialog", (d) => {
			throw new Error(`unexpected native dialog: ${d.type()} ${d.message()}`);
		});
		await unlockButton.click();
		await expect(page.getByText("Unlock Payroll Period")).toBeVisible();

		// Confirm is disabled until a reason of ≥ 3 chars is entered.
		const dialog = page.getByRole("dialog");
		const confirm = dialog.getByRole("button", { name: /^Unlock$/ });
		await expect(confirm).toBeDisabled();

		const reasonBox = dialog.getByLabel(/Unlock Reason/i);
		await reasonBox.fill("ab");
		await expect(confirm).toBeDisabled();

		await reasonBox.fill("E2E dialog journey unlock");
		await expect(confirm).toBeEnabled();
		await confirm.click();

		// Dialog closes and the mutation lands.
		await expect(page.getByText("Unlock Payroll Period")).toHaveCount(0, {
			timeout: 15_000,
		});

		// API cross-check: the period is open with the reason recorded.
		await expect
			.poll(async () => {
				const rows = await rpc(page.request, "payrollPeriods/list", {
					organizationId,
					branchNodeId: branchId,
				});
				const row = (Array.isArray(rows) ? rows : []).find(
					(p: { id: string }) => p.id === locked.id,
				);
				return row ? `${row.state}:${row.unlockReason}` : "missing";
			})
			.toBe("open:E2E dialog journey unlock");
	});
});
