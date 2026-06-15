/**
 * Customer journey (UI, video): installment overdue → package lock.
 *
 * An installment plan goes unpaid past its grace period and the package locks
 * (sessions blocked) until payment resumes.
 *
 * There is no API path to seed an overdue instalment — `reschedule` rejects past
 * dates by design — so a TEST-ONLY DB helper (scripts/e2e-backdate-installment.ts)
 * backdates due_date + next_due_date + grace, then invokes the REAL lock evaluator
 * (evaluateAndLockIfOverdue — the same function the nightly sweep runs). The spec
 * then reads the locked state via getPackageState, shows the installments admin
 * view, and manualUnlock resumes it.
 *
 * Record: PW_VIDEO=on bunx playwright test e2e/customer-journey-overdue-lock.journey.spec.ts --project=journeys-e2e
 */

import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	seedMinimalPosFixture,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstInstallmentPlan,
	recordPosSaleFull,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

type UserCtx = { currentOrganizationId?: string; user?: { id?: string } };
type InstallmentRow = { id: string; installmentNumber: number; status: string };
type PackageState = {
	isLocked?: boolean;
	status?: string;
	paymentStatus?: string;
};

test("customer journey — installment overdue past grace → package locks", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	const me = ctx.user?.id ?? "";
	test.skip(!me, "no session user id");

	// ── Plumbing: an installment sale (instalment #1 auto-paid at counter) ────
	await seedMinimalPosFixture(page);
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page, {
		hasSessions: true,
		isPackage: true,
	});
	const plan = await pickFirstInstallmentPlan(page);
	test.skip(
		!client || !service || !plan || plan.numInstallments < 2,
		"fixtures not available — run bun e2e:seed",
	);

	const n = plan!.numInstallments;
	const sale = await recordPosSaleFull(page, {
		customerId: client!.userId,
		customerName: client!.name,
		branchId: client!.hierarchyScopeId!,
		items: [
			{
				type: "package",
				refId: service!.id,
				description: service!.name,
				quantity: 1,
				unitPriceCents: n * 3000,
			},
		],
		paymentMethod: "cash",
		installmentPlanCode: plan!.code,
	});
	const packageInstanceId = sale.packageInstanceIds![0]!;

	const insts = await orpcCall<object, InstallmentRow[]>(
		page,
		"installments",
		"listByPackageInstance",
		{ organizationId: orgId, packageInstanceId },
	);
	const sorted = [...insts].sort(
		(a, b) => a.installmentNumber - b.installmentNumber,
	);
	const nextDue = sorted.find((i) => i.status === "pending");
	test.skip(!nextDue, "no pending installment to make overdue");

	// ── Make it overdue: backdate the next instalment 30 days (> 7-day grace) ─
	// No API path exists (reschedule rejects past dates by design), so a
	// test-only DB helper backdates due_date + next_due_date directly.
	execSync(
		`bun run apps/server/scripts/e2e-backdate-installment.ts ${packageInstanceId} 30`,
		{ stdio: "inherit" },
	);

	// ── Read the locked state (the backdate script already ran the evaluator) ─
	const state = await orpcCall<object, PackageState>(
		page,
		"installments",
		"getPackageState",
		{ organizationId: orgId, packageInstanceId },
	);
	expect(
		state.isLocked,
		"package must be LOCKED once an instalment is overdue past grace",
	).toBe(true);

	// ── Visual: the installments admin view (read-only) ───────────────────────
	await page.goto("/dashboard/packages/installments/view");
	await page.waitForLoadState("networkidle");
	await page.waitForTimeout(2500); // hold the installments view for the video

	// ── Resume path (proves the lock is recoverable): manual unlock ───────────
	await orpcCall(page, "installments", "manualUnlock", {
		organizationId: orgId,
		packageInstanceId,
		reason: "E2E resume",
	});
	const after = await orpcCall<object, PackageState>(
		page,
		"installments",
		"getPackageState",
		{ organizationId: orgId, packageInstanceId },
	);
	expect(after.isLocked, "package unlocks after manual unlock (resume)").toBe(
		false,
	);
});
