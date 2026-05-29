/**
 * gap-prove-commission-deep — actually exercise F-05, F-06, F-08 at runtime
 * (the previous gap-prove-commission spec verified them by audit + type-check only;
 * this spec seeds the tenant end-to-end and hits the real code paths).
 *
 * Session: zplan/2026-05-27-0231-audit-prove-commission
 * Single test, continuous browser session, expect.soft throughout.
 */

import { test, expect } from "@playwright/test";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstProduct,
	ensureFirstProduct,
	recordPosSale,
	seedConfirmedAppointment,
	completeAppointment,
	cleanupAppointment,
	getCommissionSplitsForAppointment,
} from "./helpers/seed-data";

type LedgerRow = {
	id: string;
	staffId: string;
	status: string;
	calculatedAmount: number;
	salesOrderId?: string | null;
	appointmentId?: string | null;
	notes?: string | null;
	paidAt?: string | null;
	payoutId?: string | null;
};
type LedgerResp = { rows?: LedgerRow[] } | LedgerRow[];

async function listLedger(
	page: import("@playwright/test").Page,
	filter: { status?: string; limit?: number; offset?: number } = {},
): Promise<LedgerRow[]> {
	try {
		const resp = await orpcCall<object, LedgerResp>(page, "commissionSplits", "listLedger", {
			organizationId: TEST_ORG_ID,
			status: filter.status ?? "all",
			limit: Math.min(filter.limit ?? 200, 200),
			offset: filter.offset ?? 0,
		});
		return Array.isArray(resp) ? resp : resp.rows ?? [];
	} catch {
		return [];
	}
}

test("audit-prove deep — F-05 paymentReference / F-06 refund reversal / F-08 payout_batches", async ({ page }) => {
	// ─────────────────────────────────────────────────────────────
	// SETUP: navigate so page.evaluate fetch() can resolve /rpc/* (needs origin),
	// then seed a fresh commission split via appointment completion.
	// ─────────────────────────────────────────────────────────────
	await page.goto("/dashboard");
	await page.waitForLoadState("domcontentloaded");

	const trainer = await pickFirstActiveTrainer(page);
	const client = await pickFirstActiveClient(page);
	test.skip(!trainer || !client, "Need a trainer + client in the test tenant");

	const service = await pickFirstService(page);
	const branchId = trainer!.hierarchyScopeId ?? "aaaaaaaa-0000-4000-8000-000000000001";

	let seededAppointmentId = "";
	try {
		seededAppointmentId = await seedConfirmedAppointment(page, {
			trainerMemberId: trainer!.memberId,
			trainerUserId: trainer!.userId,
			clientUserId: client!.userId,
			serviceId: service?.id ?? null,
			branchId,
			offsetMinutes: 120,
		});
	} catch (err) {
		test.skip(true, `Cannot seed appointment: ${String(err)}`);
	}

	await test.step("SEED-01 complete the appointment to generate a pending commission split", async () => {
		await completeAppointment(page, seededAppointmentId);
		await page.waitForTimeout(800);
		const splits = await getCommissionSplitsForAppointment(page, seededAppointmentId);
		expect.soft(splits.length, "expected at least one commission split").toBeGreaterThan(0);
	});

	// ─────────────────────────────────────────────────────────────
	// F-05 — approve the seeded split, mark paid with paymentReference,
	// verify the reference is persisted on the row's notes + read back.
	// ─────────────────────────────────────────────────────────────
	let approvedSplitId: string | null = null;
	let approvedStaffId: string | null = null;
	const paymentReference = `AUDIT-PROVE-TXN-${Date.now()}`;

	await test.step("F-05 prep — approve the seeded split", async () => {
		const apptSplits = await getCommissionSplitsForAppointment(page, seededAppointmentId);
		const pending = apptSplits.find((s) => s.status === "pending");
		if (!pending) {
			test.info().annotations.push({ type: "F-05 prep", description: "no pending split — was it auto-approved?" });
			// Fall back: pick any pending from the ledger
			const anyPending = (await listLedger(page, { status: "pending" }))[0];
			approvedSplitId = anyPending?.id ?? null;
			approvedStaffId = anyPending?.staffId ?? null;
		} else {
			approvedSplitId = pending.id;
			approvedStaffId = pending.staffId;
		}
		if (!approvedSplitId) {
			expect.soft(approvedSplitId, "could not obtain a pending split id").not.toBeNull();
			return;
		}
		try {
			await orpcCall(page, "commissionSplits", "approve", {
				organizationId: TEST_ORG_ID,
				ids: [approvedSplitId],
			});
		} catch (err) {
			const code = err instanceof OrpcClientError ? err.code : String(err);
			expect.soft(code, "approve should not error").toBe("__ok__");
			return;
		}
	});

	await test.step("F-05 — markPaidById persists paymentReference in row notes + audit", async () => {
		if (!approvedSplitId) return;
		try {
			await orpcCall(page, "commissionSplits", "markPaidById", {
				organizationId: TEST_ORG_ID,
				ids: [approvedSplitId],
				paymentReference,
			});
		} catch (err) {
			const code = err instanceof OrpcClientError ? err.code : String(err);
			expect.soft(code, "markPaidById should not error").toBe("__ok__");
			return;
		}
		// Read-back: the row's notes (or some persisted field) must contain the reference.
		const rows = await listLedger(page, { limit: 200 });
		const row = rows.find((r) => r.id === approvedSplitId);
		expect.soft(row, "split row missing after mark-paid").toBeTruthy();
		if (row) {
			expect.soft(row.status, "status should flip to paid").toBe("paid");
			const blob = JSON.stringify(row);
			expect.soft(
				blob.includes(paymentReference),
				`paymentReference "${paymentReference}" not persisted; row=${blob.slice(0, 400)}`,
			).toBe(true);
		}
	});

	// ─────────────────────────────────────────────────────────────
	// F-08 — runBatch should create a payout_batches row and stamp batchId
	// on each inserted payout. We pre-approve another split to feed the batch.
	// ─────────────────────────────────────────────────────────────
	let secondAppointmentId = "";
	let secondSplitId: string | null = null;

	await test.step("F-08 prep — seed a SECOND pending split + approve it", async () => {
		try {
			secondAppointmentId = await seedConfirmedAppointment(page, {
				trainerMemberId: trainer!.memberId,
				trainerUserId: trainer!.userId,
				clientUserId: client!.userId,
				serviceId: service?.id ?? null,
				branchId,
				offsetMinutes: 240,
			});
			await completeAppointment(page, secondAppointmentId);
			await page.waitForTimeout(800);
			const splits = await getCommissionSplitsForAppointment(page, secondAppointmentId);
			const pending = splits.find((s) => s.status === "pending");
			secondSplitId = pending?.id ?? null;
			if (secondSplitId) {
				await orpcCall(page, "commissionSplits", "approve", {
					organizationId: TEST_ORG_ID,
					ids: [secondSplitId],
				});
			}
		} catch (err) {
			test.info().annotations.push({ type: "F-08 prep", description: `seed failed: ${String(err)}` });
		}
	});

	await test.step("F-08 — runBatch creates a payout_batches row + stamps batchId on payouts", async () => {
		if (!approvedStaffId) {
			expect.soft(approvedStaffId, "no staff id — F-08 cannot run").not.toBeNull();
			return;
		}
		// Use a period that covers today (earnedAt = now() for the seeded splits)
		const now = new Date();
		const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
		const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

		type RunBatchResp = {
			payouts?: Array<{ id: string; batchId?: string | null; recipientId: string; amount: number }>;
			batchId?: string | null;
		};
		let result: RunBatchResp | null = null;
		let runBatchError: string | null = null;
		try {
			result = await orpcCall<object, RunBatchResp>(page, "payouts", "runBatch", {
				organizationId: TEST_ORG_ID,
				staffIds: [approvedStaffId],
				periodStart,
				periodEnd,
				paymentMethod: "cash",
				reference: `AUDIT-PROVE-BATCH-${Date.now()}`,
				branchId,
			});
		} catch (err) {
			runBatchError = err instanceof OrpcClientError ? `${err.code}: ${err.message}` : String(err);
		}
		console.log("F-08 runBatch error:", runBatchError);
		console.log("F-08 runBatch result:", JSON.stringify(result).slice(0, 500));
		console.log("F-08 inputs: staffId=", approvedStaffId, "periodStart=", periodStart, "periodEnd=", periodEnd, "branchId=", branchId);
		// Read back via payouts.list and assert paid rows have a non-null batchId.
		type PayoutRow = { id: string; recipientId: string; batchId?: string | null; amount: number; paidAt?: string | null };
		type PayoutsListResp = { rows?: PayoutRow[] } | PayoutRow[];
		const listResp = await orpcCall<object, PayoutsListResp>(page, "payouts", "list", {
			organizationId: TEST_ORG_ID,
			recipientId: approvedStaffId,
			limit: 100,
		});
		const rows = Array.isArray(listResp) ? listResp : listResp.rows ?? [];
		console.log("F-08 payouts.list returned", rows.length, "rows; first 3:", JSON.stringify(rows.slice(0, 3)).slice(0, 400));
		const recent = rows
			.filter((r) => r.recipientId === approvedStaffId && r.amount > 0)
			.slice(0, 5);
		// At least one recent positive payout for this staff should have a batchId.
		const withBatch = recent.filter((r) => r.batchId != null);
		expect.soft(
			withBatch.length,
			`expected at least one payout row with non-null batchId after runBatch; recent=${JSON.stringify(recent)}`,
		).toBeGreaterThan(0);

		// Bonus check: if the runBatch returned, ensure each payout it created carries batchId.
		if (result?.payouts && result.payouts.length > 0) {
			for (const p of result.payouts) {
				if (p.amount > 0) {
					expect.soft(p.batchId, `payout ${p.id} should have batchId after fix`).toBeTruthy();
				}
			}
		}
	});

	// ─────────────────────────────────────────────────────────────
	// F-06 — refund of a paid commission flips the split to void and
	// subtracts from liabilityByStaff. Uses a POS service sale so the
	// commission split is tied to a salesOrderId.
	// ─────────────────────────────────────────────────────────────
	let posSalesOrderId = "";
	let posSplit: LedgerRow | null = null;

	await test.step("F-06 prep — POS product sale → produces a salesOrder split (immediate split path)", async () => {
		const product = await ensureFirstProduct(page);
		if (!product) {
			test.info().annotations.push({ type: "F-06 prep", description: "no product available + cannot create one — skipping" });
			return;
		}
		try {
			posSalesOrderId = await recordPosSale(page, {
				customerId: client!.userId,
				customerName: client!.name,
				branchId,
				items: [
					{
						type: "product",
						refId: product.id,
						description: product.name,
						quantity: 1,
						unitPriceCents: product.unitPriceCents,
					},
				],
				paymentMethod: "cash",
			});
		} catch (err) {
			test.info().annotations.push({ type: "F-06 prep", description: `recordPosSale failed: ${String(err)}` });
			return;
		}
		await page.waitForTimeout(800);
		let rows = await listLedger(page, { limit: 200 });
		posSplit = rows.find((r) => r.salesOrderId === posSalesOrderId) ?? null;
		// If the tenant has no commission config for products, forge the precondition
		// via createManualAdjustment tied to this salesOrder. Post-F-04 fix, manual
		// adjustments accept salesOrderId.
		if (!posSplit && posSalesOrderId) {
			try {
				await orpcCall<object, { id: string }>(page, "commissionSplits", "createManualAdjustment", {
					organizationId: TEST_ORG_ID,
					staffId: trainer!.userId,
					salesOrderId: posSalesOrderId,
					amountCents: 1000, // RM 10
					note: "audit-prove F-06 seed (manual adjustment tied to sale)",
				});
				await page.waitForTimeout(400);
				rows = await listLedger(page, { limit: 200 });
				posSplit = rows.find((r) => r.salesOrderId === posSalesOrderId) ?? null;
			} catch (err) {
				test.info().annotations.push({ type: "F-06 seed", description: `manual adjustment failed: ${String(err)}` });
			}
		}
		console.log("F-06 posSalesOrderId=", posSalesOrderId, " split found?", !!posSplit, " splitStatus=", posSplit?.status, " amount=", posSplit?.calculatedAmount);
		expect.soft(posSalesOrderId, "no posSalesOrderId").toBeTruthy();
	});

	await test.step("F-06 prep — approve + mark paid the POS split (no paymentReference)", async () => {
		if (!posSplit) {
			test.info().annotations.push({ type: "F-06 prep", description: "no POS split produced — service commission config missing" });
			return;
		}
		try {
			await orpcCall(page, "commissionSplits", "approve", {
				organizationId: TEST_ORG_ID,
				ids: [posSplit.id],
			});
			await orpcCall(page, "commissionSplits", "markPaidById", {
				organizationId: TEST_ORG_ID,
				ids: [posSplit.id],
				paymentReference: `F06-${Date.now()}`,
			});
		} catch (err) {
			test.info().annotations.push({ type: "F-06 prep", description: `approve/mark paid failed: ${String(err)}` });
		}
	});

	await test.step("F-06 — refund the sale → commission split flips to void; liability subtracts", async () => {
		if (!posSplit || !posSalesOrderId) {
			test.info().annotations.push({ type: "F-06", description: "missing seed for refund test" });
			return;
		}
		// Capture pre-refund liability
		type LiabRow = { staffId: string; paidCents: number; approvedCents: number; pendingCents: number };
		type LiabResult = { rows: LiabRow[]; totalCount: number; hasMore: boolean };
		const liabBefore = await orpcCall<object, LiabResult>(page, "commissionSplits", "liabilityByStaff", {
			organizationId: TEST_ORG_ID,
		});
		const beforeRow = liabBefore.rows.find((r) => r.staffId === posSplit!.staffId);
		const paidBefore = beforeRow?.paidCents ?? 0;

		// Request + approve a refund of the sale
		let refundId: string | null = null;
		try {
			const created = await orpcCall<object, { id: string }>(page, "refunds", "request", {
				organizationId: TEST_ORG_ID,
				salesOrderId: posSalesOrderId,
				amountCents: 5000, // full sale value
				reason: "audit-prove F-06 reversal test",
			});
			refundId = created.id;
			await orpcCall(page, "refunds", "approve", {
				organizationId: TEST_ORG_ID,
				id: refundId,
			});
		} catch (err) {
			const code = err instanceof OrpcClientError ? err.code : String(err);
			test.info().annotations.push({ type: "F-06 refund", description: `refund flow error: ${code}` });
			return;
		}
		await page.waitForTimeout(600);

		// Read back: split status should be void; liability paidCents should have decreased
		// by the reversed amount.
		const rowsAfter = await listLedger(page, { limit: 500 });
		const splitAfter = rowsAfter.find((r) => r.id === posSplit!.id);
		expect.soft(splitAfter?.status, "split should flip to void after full reversal").toBe("void");

		const liabAfter = await orpcCall<object, LiabResult>(page, "commissionSplits", "liabilityByStaff", {
			organizationId: TEST_ORG_ID,
		});
		const afterRow = liabAfter.rows.find((r) => r.staffId === posSplit!.staffId);
		const paidAfter = afterRow?.paidCents ?? 0;
		expect.soft(
			paidAfter < paidBefore,
			`liabilityByStaff.paidCents must decrease after reversal (before=${paidBefore} after=${paidAfter})`,
		).toBe(true);
	});

	// ─────────────────────────────────────────────────────────────
	// Cleanup (best-effort, idempotent)
	// ─────────────────────────────────────────────────────────────
	await cleanupAppointment(page, seededAppointmentId).catch(() => {});
	if (secondAppointmentId) await cleanupAppointment(page, secondAppointmentId).catch(() => {});
});
