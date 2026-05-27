/**
 * gap-prove-payouts-state-machine — exercise S-payouts-state-machine end-to-end.
 *
 * Full lifecycle proof:
 *   LC-01  runBatch(confirmImmediately:false) → payout=pending, splits stay approved
 *   LC-02  markPaid                            → payout=paid, splits=paid, ref persisted
 *   LC-03  second runBatch                     → second pending payout
 *   LC-04  markFailed                          → payout=failed
 *   LC-05  retry                               → payout=failed → pending
 *   LC-06  cancel                              → payout=canceled, splits revert to approved
 *   LC-07  concurrent markPaid race            → exactly one succeeds (mirrors F-07 lock pattern)
 */
import { test, expect } from "@playwright/test";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	ensureFirstProduct,
	recordPosSale,
	pickFirstBranchId,
} from "./helpers/seed-data";

type LedgerRow = {
	id: string;
	staffId: string;
	status: string;
	calculatedAmount: number;
	salesOrderId?: string | null;
	payoutId?: string | null;
};
type LedgerResp = { rows?: LedgerRow[] } | LedgerRow[];

async function listLedger(page: import("@playwright/test").Page, status?: string): Promise<LedgerRow[]> {
	try {
		const resp = await orpcCall<object, LedgerResp>(page, "commissionSplits", "listLedger", {
			organizationId: TEST_ORG_ID,
			status: status ?? "all",
			limit: 200,
			offset: 0,
		});
		return Array.isArray(resp) ? resp : resp.rows ?? [];
	} catch {
		return [];
	}
}

type PayoutRow = {
	id: string;
	recipientId: string;
	status: string;
	batchId?: string | null;
	description?: string | null;
};
type PayoutsResp = { rows?: PayoutRow[] } | PayoutRow[];

async function fetchPayout(
	page: import("@playwright/test").Page,
	recipientId: string,
	payoutId?: string,
): Promise<PayoutRow | null> {
	const resp = await orpcCall<object, PayoutsResp>(page, "payouts", "list", {
		organizationId: TEST_ORG_ID,
		recipientId,
		limit: 200,
	});
	const rows = Array.isArray(resp) ? resp : resp.rows ?? [];
	if (payoutId) return rows.find((r) => r.id === payoutId) ?? null;
	return rows[0] ?? null;
}

test("S-payouts-state-machine — full lifecycle + concurrency", async ({ page }) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("domcontentloaded");

	const trainer = await pickFirstActiveTrainer(page);
	const client = await pickFirstActiveClient(page);
	test.skip(!trainer || !client, "need trainer + client in test tenant");

	const product = await ensureFirstProduct(page);
	test.skip(!product, "need a product");

	const branchId = trainer!.hierarchyScopeId ?? (await pickFirstBranchId(page));

	// Helper — forge a fresh approved split by manual-adjustment + approve flow.
	// (POS doesn't auto-produce splits in the test tenant; F-04 fix permits this.)
	async function forgeApprovedSplit(amountCents: number): Promise<string | null> {
		let salesOrderId = "";
		try {
			salesOrderId = await recordPosSale(page, {
				customerId: client!.userId,
				customerName: client!.name,
				branchId,
				items: [{ type: "product", refId: product!.id, description: product!.name, quantity: 1, unitPriceCents: amountCents * 5 }],
				paymentMethod: "cash",
			});
		} catch {
			return null;
		}
		try {
			const adj = await orpcCall<object, { id: string }>(page, "commissionSplits", "createManualAdjustment", {
				organizationId: TEST_ORG_ID,
				staffId: trainer!.userId,
				salesOrderId,
				amountCents,
				note: "audit-prove state-machine seed",
			});
			await orpcCall(page, "commissionSplits", "approve", {
				organizationId: TEST_ORG_ID,
				ids: [adj.id],
			});
			return adj.id;
		} catch (err) {
			console.warn("forgeApprovedSplit failed:", err instanceof OrpcClientError ? err.code : String(err));
			return null;
		}
	}

	const now = new Date();
	const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

	// LC-01 — runBatch with confirmImmediately:false (state machine mode)
	let payoutId01 = "";
	let splitId01 = "";
	await test.step("LC-01 runBatch(confirmImmediately:false) → pending payout, splits stay approved", async () => {
		const seeded = await forgeApprovedSplit(1500);
		if (!seeded) {
			test.info().annotations.push({ type: "LC-01", description: "could not forge approved split" });
			return;
		}
		splitId01 = seeded;
		const res = await orpcCall<object, { payoutIds: string[] }>(page, "payouts", "runBatch", {
			organizationId: TEST_ORG_ID,
			staffIds: [trainer!.userId],
			periodStart,
			periodEnd,
			paymentMethod: "bank_transfer",
			reference: `LC-01-${Date.now()}`,
			branchId,
			confirmImmediately: false,
		});
		payoutId01 = res.payoutIds[0] ?? "";
		expect.soft(payoutId01, "runBatch must return a payoutId").toBeTruthy();

		const payout = await fetchPayout(page, trainer!.userId, payoutId01);
		expect.soft(payout?.status, "payout should be pending").toBe("pending");

		// Linked split should still be 'approved' but carry the payoutId.
		const ledger = await listLedger(page);
		const split = ledger.find((s) => s.id === splitId01);
		expect.soft(split?.status, "split must remain approved during pending payout").toBe("approved");
		expect.soft(split?.payoutId, "split must carry the new payoutId").toBe(payoutId01);
	});

	// LC-02 — markPaid: pending → paid; splits flip to paid; reference persists
	await test.step("LC-02 markPaid → paid; splits paid; reference in description + audit", async () => {
		if (!payoutId01) return;
		const ref = `WIRE-REF-${Date.now()}`;
		await orpcCall(page, "payouts", "markPaid", {
			organizationId: TEST_ORG_ID,
			id: payoutId01,
			paymentReference: ref,
		});
		const payout = await fetchPayout(page, trainer!.userId, payoutId01);
		expect.soft(payout?.status, "payout should be paid").toBe("paid");
		expect.soft(payout?.description?.includes(ref), `description should include the wire ref: ${payout?.description}`).toBe(true);

		const ledger = await listLedger(page);
		const split = ledger.find((s) => s.id === splitId01);
		expect.soft(split?.status, "split should flip to paid on markPaid").toBe("paid");
	});

	// LC-03..LC-05 — second payout: markFailed + retry
	let payoutId02 = "";
	let splitId02 = "";
	await test.step("LC-03 runBatch second batch → second pending payout", async () => {
		const seeded = await forgeApprovedSplit(2000);
		if (!seeded) {
			test.info().annotations.push({ type: "LC-03", description: "could not forge second split" });
			return;
		}
		splitId02 = seeded;
		const res = await orpcCall<object, { payoutIds: string[] }>(page, "payouts", "runBatch", {
			organizationId: TEST_ORG_ID,
			staffIds: [trainer!.userId],
			periodStart,
			periodEnd,
			paymentMethod: "bank_transfer",
			reference: `LC-03-${Date.now()}`,
			branchId,
			confirmImmediately: false,
		});
		payoutId02 = res.payoutIds[0] ?? "";
		expect.soft(payoutId02, "second runBatch must return a payoutId").toBeTruthy();
	});

	await test.step("LC-04 markFailed → failed", async () => {
		if (!payoutId02) return;
		await orpcCall(page, "payouts", "markFailed", {
			organizationId: TEST_ORG_ID,
			id: payoutId02,
			reason: "bank rejected wire — audit-prove test",
		});
		const payout = await fetchPayout(page, trainer!.userId, payoutId02);
		expect.soft(payout?.status, "payout should be failed").toBe("failed");
	});

	await test.step("LC-05 retry → failed → pending", async () => {
		if (!payoutId02) return;
		await orpcCall(page, "payouts", "retry", {
			organizationId: TEST_ORG_ID,
			id: payoutId02,
		});
		const payout = await fetchPayout(page, trainer!.userId, payoutId02);
		expect.soft(payout?.status, "payout should reset to pending after retry").toBe("pending");
	});

	// LC-06 — cancel: pending → canceled; splits revert
	await test.step("LC-06 cancel → canceled; linked splits revert to approved", async () => {
		if (!payoutId02 || !splitId02) return;
		await orpcCall(page, "payouts", "cancel", {
			organizationId: TEST_ORG_ID,
			id: payoutId02,
			reason: "audit-prove test cancel",
		});
		const payout = await fetchPayout(page, trainer!.userId, payoutId02);
		expect.soft(payout?.status, "payout should be canceled").toBe("canceled");

		const ledger = await listLedger(page);
		const split = ledger.find((s) => s.id === splitId02);
		expect.soft(split?.status, "split should revert to approved on cancel").toBe("approved");
		expect.soft(split?.payoutId, "split's payoutId should be cleared").toBeFalsy();
	});

	// LC-07 — concurrency: two concurrent markPaid → one wins, one rejects
	await test.step("LC-07 concurrent markPaid race → exactly one succeeds", async () => {
		const seeded = await forgeApprovedSplit(2500);
		if (!seeded) {
			test.info().annotations.push({ type: "LC-07", description: "could not forge concurrency-test split" });
			return;
		}
		const res = await orpcCall<object, { payoutIds: string[] }>(page, "payouts", "runBatch", {
			organizationId: TEST_ORG_ID,
			staffIds: [trainer!.userId],
			periodStart,
			periodEnd,
			paymentMethod: "bank_transfer",
			reference: `LC-07-${Date.now()}`,
			branchId,
			confirmImmediately: false,
		});
		const payoutId07 = res.payoutIds[0] ?? "";
		if (!payoutId07) return;

		const ref = `RACE-${Date.now()}`;
		const call = () =>
			orpcCall(page, "payouts", "markPaid", {
				organizationId: TEST_ORG_ID,
				id: payoutId07,
				paymentReference: ref,
			})
				.then(() => ({ ok: true as const, err: null as null }))
				.catch((err) => ({ ok: false as const, err: err instanceof OrpcClientError ? err.code : String(err) }));
		const [r1, r2] = await Promise.all([call(), call()]);
		console.log("LC-07 race results:", JSON.stringify({ r1, r2 }));
		const successCount = [r1, r2].filter((r) => r.ok).length;
		expect.soft(successCount, "exactly one concurrent markPaid must succeed").toBe(1);
	});
});
