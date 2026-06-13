/**
 * Journey: Commission END-TO-END — sales in (full payment AND installment)
 *          → origination commission → approve → payout batch → PAID.
 *
 * Actor: tenant_admin (franchisee@gmail.com), who is also the salesperson
 *        (soldBy) so the on_sale/sales/net_order commission track attributes to them.
 *
 * Prereq: the on_sale commission track must be seeded —
 *   cd apps/server && bun run scripts/seed-commission-track-test-tenant.ts
 *
 * Proves the whole money path the other specs cover only in pieces:
 *
 *  PHASE 1 — FULL PAYMENT: a single-payment package sale with soldBy fires ONE
 *            front-loaded origination split (installmentId = null), amount =
 *            floor(net_order × 10%), status 'pending'.
 *
 *  PHASE 2 — INSTALLMENT: the same package on an N-installment plan, with every
 *            installment confirmed, fires N per-installment origination splits
 *            (installmentId set) whose sum equals the planned origination total
 *            (conservation / true-up).
 *
 *  PHASE 3 — LIFECYCLE: all of the above splits (same staff) go
 *            pending → approve → runBatch(confirmImmediately) → PAID, and the
 *            payout total covers their sum.
 *
 * API-driven for determinism (ids come back from each call).
 *
 * Run: bunx playwright test e2e/commission-sales-to-payout.journey.spec.ts --project=journeys-e2e
 */

import { test, expect, type Page } from "@playwright/test";
import {
	TEST_ORG_ID,
	seedMinimalPosFixture,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstInstallmentPlan,
	recordPosSaleFull,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

const RATE_BPS = 1000; // seeded track: 10%

type UserCtx = { currentOrganizationId?: string; user?: { id?: string } };
type LedgerRow = {
	id: string;
	staffId: string;
	calculatedAmount: number;
	status: string;
	earnReason?: string | null;
	installmentId: string | null;
	salesOrderId: string | null;
};
type InstallmentRow = {
	id: string;
	installmentNumber: number;
	status: string;
	salesOrderId?: string | null;
};

async function ledgerRows(
	page: Page,
	input: Record<string, unknown>,
): Promise<LedgerRow[]> {
	const res = await orpcCall<
		object,
		{ rows?: LedgerRow[]; items?: LedgerRow[] }
	>(page, "commissionSplits", "listLedger", {
		organizationId: TEST_ORG_ID,
		limit: 200,
		...input,
	});
	return res.rows ?? res.items ?? [];
}

test("commission end-to-end — full-payment + installment sales → approve → payout → paid", {
	tag: ["@p0"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	const me = ctx.user?.id ?? "";
	test.skip(!me, "no session user id");

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

	// ════ PHASE 1 — FULL-PAYMENT SALE → front-loaded origination split ════════
	const fullTotal = 12000; // RM 120
	const sale1 = await recordPosSaleFull(page, {
		customerId: client!.userId,
		customerName: client!.name,
		branchId: client!.hierarchyScopeId!,
		items: [
			{
				type: "package",
				refId: service!.id,
				description: service!.name,
				quantity: 1,
				unitPriceCents: fullTotal,
			},
		],
		paymentMethod: "cash",
		soldBy: me, // populates sales_orders.sold_by → origination beneficiary
	});
	await page.waitForTimeout(600); // let the commission engine settle

	const phase1All = await ledgerRows(page, { status: "pending", staffId: me });
	const fullPaySplits = phase1All.filter(
		(s) => s.salesOrderId === sale1.salesOrderId && s.installmentId == null,
	);
	test.skip(
		fullPaySplits.length === 0,
		"No origination split from the full-payment sale — is the on_sale track seeded? " +
			"(cd apps/server && bun run scripts/seed-commission-track-test-tenant.ts)",
	);
	const expectedFullPay = Math.floor((fullTotal * RATE_BPS) / 10000); // 1200
	expect(
		fullPaySplits.reduce((a, s) => a + s.calculatedAmount, 0),
		`full-payment origination = floor(${fullTotal} × 10%) = ${expectedFullPay}`,
	).toBe(expectedFullPay);
	expect(fullPaySplits.every((s) => s.status === "pending")).toBe(true);
	console.log(
		`PHASE 1: full-payment sale ${sale1.salesOrderId} → ${fullPaySplits.length} origination split, ${expectedFullPay}¢`,
	);

	// ════ PHASE 2 — INSTALLMENT SALE → per-installment origination splits ══════
	const n = plan!.numInstallments;
	const instTotal = n * 3000;
	const sale2 = await recordPosSaleFull(page, {
		customerId: client!.userId,
		customerName: client!.name,
		branchId: client!.hierarchyScopeId!,
		items: [
			{
				type: "package",
				refId: service!.id,
				description: service!.name,
				quantity: 1,
				unitPriceCents: instTotal,
			},
		],
		paymentMethod: "cash",
		installmentPlanCode: plan!.code,
		soldBy: me,
	});

	// Confirm every pending installment (installment #1 auto-paid at counter).
	const insts = await orpcCall<object, InstallmentRow[]>(
		page,
		"installments",
		"listByPackageInstance",
		{ organizationId: orgId, packageInstanceId: sale2.packageInstanceIds![0]! },
	);
	const sortedInsts = [...insts].sort(
		(a, b) => a.installmentNumber - b.installmentNumber,
	);
	for (let i = 1; i < n; i++) {
		await orpcCall(page, "installments", "confirmPayment", {
			organizationId: orgId,
			installmentId: sortedInsts[i]!.id,
			paymentMethod: "cash",
		});
	}
	await page.waitForTimeout(600);

	const phase2All = await ledgerRows(page, { status: "pending", staffId: me });
	const instSplits = phase2All.filter(
		(s) => s.salesOrderId === sale2.salesOrderId && s.installmentId != null,
	);
	const expectedInstTotal = Math.floor((instTotal * RATE_BPS) / 10000);
	expect(
		instSplits.length,
		`one origination split per installment (${n})`,
	).toBe(n);
	expect(
		instSplits.reduce((a, s) => a + s.calculatedAmount, 0),
		`per-installment splits sum to planned origination (${expectedInstTotal}) — conservation`,
	).toBe(expectedInstTotal);
	console.log(
		`PHASE 2: installment sale ${sale2.salesOrderId} → ${instSplits.length} splits summing ${expectedInstTotal}¢`,
	);

	// ════ PHASE 3 — APPROVE → PAYOUT BATCH → PAID ═════════════════════════════
	const ourIds = [...fullPaySplits, ...instSplits].map((s) => s.id);
	const ourSum =
		expectedFullPay + instSplits.reduce((a, s) => a + s.calculatedAmount, 0);

	// pending → approved
	await orpcCall(page, "commissionSplits", "approve", {
		organizationId: orgId,
		ids: ourIds,
	});
	const approved = await ledgerRows(page, { status: "approved", staffId: me });
	const approvedOurs = approved.filter((s) => ourIds.includes(s.id));
	expect(approvedOurs.length, "all our splits must be approved").toBe(
		ourIds.length,
	);
	console.log(`PHASE 3a: approved ${approvedOurs.length} splits`);

	// approved → paid via payout batch (confirmImmediately)
	const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

	const preview = await orpcCall<
		object,
		{ totalAmountCents?: number; byStaff?: Array<{ staffId: string }> }
	>(page, "payouts", "previewBatch", {
		organizationId: orgId,
		staffIds: [me],
		periodStart,
		periodEnd,
	});
	// Other approved splits may exist from prior runs → assert it covers AT LEAST ours.
	expect(
		preview.totalAmountCents ?? 0,
		`payout preview total must cover our approved sum (${ourSum})`,
	).toBeGreaterThanOrEqual(ourSum);

	await orpcCall(page, "payouts", "runBatch", {
		organizationId: orgId,
		staffIds: [me],
		periodStart,
		periodEnd,
		paymentMethod: "cash",
		reference: "E2E sales-to-payout",
		confirmImmediately: true,
	});

	const paid = await ledgerRows(page, { status: "paid", staffId: me });
	const paidOurs = paid.filter((s) => ourIds.includes(s.id));
	expect(paidOurs.length, "every split we approved must now be PAID").toBe(
		ourIds.length,
	);
	console.log(
		`PHASE 3b: payout batch PAID ${paidOurs.length} splits (full-payment + installment), total ${ourSum}¢ — end-to-end commission proven`,
	);
});
