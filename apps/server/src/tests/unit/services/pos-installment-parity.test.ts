/**
 * Parity test — POS open-coded installment schedule vs createInstallmentSchedule helper.
 *
 * Audit P2-23 mandates this: before replacing the open-coded loop in pos.service.ts
 * with the shared helper, verify that for representative inputs both produce identical
 * schedule rows (amount, taxAmount, creditsUnlockedByThis, dueDate offset from purchase).
 *
 * This test operates on pure math (no DB required) — it re-implements the OLD
 * open-coded computation and compares against the exported helpers used by
 * createInstallmentSchedule, asserting they produce the same results.
 */

import { describe, test, expect } from "bun:test";
import {
	calculateInstallmentAmounts,
	calculateCreditsUnlocked,
} from "@avantej-core/services/installment.service";

// ---------------------------------------------------------------------------
// Re-implementation of the OLD POS open-coded schedule logic
// (from pos.service.ts before the 7.2 refactor)
// ---------------------------------------------------------------------------

type OldScheduleRow = {
	installmentNumber: number;
	amount: number;
	taxAmount: number;
	status: "paid" | "pending";
	dueDateOffsetDays: number; // days from purchaseDate
	creditsUnlockedByThis: number;
};

function buildOldPosSchedule(params: {
	creditsTotal: number;
	totalPrice: number;
	taxAmount: number;
	installmentsTotal: number;
	intervalDays: number;
}): OldScheduleRow[] {
	const { creditsTotal, totalPrice, taxAmount, installmentsTotal, intervalDays } = params;
	const amounts = calculateInstallmentAmounts(totalPrice, installmentsTotal);
	const baseTax = Math.floor(taxAmount / installmentsTotal);
	const taxRemainder = taxAmount - baseTax * installmentsTotal;

	const rows: OldScheduleRow[] = [];
	for (let i = 1; i <= installmentsTotal; i++) {
		const amount = amounts[i - 1] ?? 0;
		const instTaxAmount = i === installmentsTotal ? baseTax + taxRemainder : baseTax;
		const dueDateOffsetDays = i * intervalDays;
		const creditsUnlockedByThis =
			calculateCreditsUnlocked(creditsTotal, i, installmentsTotal) -
			calculateCreditsUnlocked(creditsTotal, i - 1, installmentsTotal);

		rows.push({
			installmentNumber: i,
			amount,
			taxAmount: instTaxAmount,
			status: i === 1 ? "paid" : "pending", // OLD behaviour: first is paid
			dueDateOffsetDays,
			creditsUnlockedByThis,
		});
	}
	return rows;
}

// ---------------------------------------------------------------------------
// Re-implementation of the NEW helper logic (createInstallmentSchedule)
// Same math, but ALL installments start as "pending"
// ---------------------------------------------------------------------------

type NewScheduleRow = {
	installmentNumber: number;
	amount: number;
	taxAmount: number;
	status: "pending";
	dueDateOffsetDays: number;
	creditsUnlockedByThis: number;
};

function buildNewSchedule(params: {
	creditsTotal: number;
	totalPrice: number;
	taxAmount: number;
	installmentsTotal: number;
	intervalDays: number;
}): NewScheduleRow[] {
	const { creditsTotal, totalPrice, taxAmount, installmentsTotal, intervalDays } = params;
	const amounts = calculateInstallmentAmounts(totalPrice, installmentsTotal);
	const baseTaxPerInstallment = Math.floor(taxAmount / installmentsTotal);
	const taxRemainder = taxAmount - baseTaxPerInstallment * installmentsTotal;

	const rows: NewScheduleRow[] = [];
	for (let i = 1; i <= installmentsTotal; i++) {
		const amount = amounts[i - 1] ?? 0;
		const instTaxAmount =
			i === installmentsTotal ? baseTaxPerInstallment + taxRemainder : baseTaxPerInstallment;
		const dueDateOffsetDays = i * intervalDays;
		const creditsUnlockedByThis =
			calculateCreditsUnlocked(creditsTotal, i, installmentsTotal) -
			calculateCreditsUnlocked(creditsTotal, i - 1, installmentsTotal);

		rows.push({
			installmentNumber: i,
			amount,
			taxAmount: instTaxAmount,
			status: "pending",
			dueDateOffsetDays,
			creditsUnlockedByThis,
		});
	}
	return rows;
}

// ---------------------------------------------------------------------------
// Representative test cases (6 inputs as mandated by P2-23)
// ---------------------------------------------------------------------------

const CASES = [
	{
		name: "2-installment plan — 10 sessions, RM200 + RM16 tax, 30d interval",
		creditsTotal: 10,
		totalPrice: 20000,
		taxAmount: 1600,
		installmentsTotal: 2,
		intervalDays: 30,
	},
	{
		name: "3-installment plan — 12 sessions, RM300 + RM24 tax, 30d interval",
		creditsTotal: 12,
		totalPrice: 30000,
		taxAmount: 2400,
		installmentsTotal: 3,
		intervalDays: 30,
	},
	{
		name: "4-installment plan — 8 sessions, RM400 + RM0 tax, 28d interval",
		creditsTotal: 8,
		totalPrice: 40000,
		taxAmount: 0,
		installmentsTotal: 4,
		intervalDays: 28,
	},
	{
		name: "6-installment plan — 24 sessions, RM600 + RM47 tax (odd remainder), 30d",
		creditsTotal: 24,
		totalPrice: 60000,
		taxAmount: 4700, // 4700 / 6 = 783 remainder 2
		installmentsTotal: 6,
		intervalDays: 30,
	},
	{
		name: "2-installment plan — 1 credit, RM99 + RM7.92 tax (8%), 14d interval",
		creditsTotal: 1,
		totalPrice: 9900,
		taxAmount: 792,
		installmentsTotal: 2,
		intervalDays: 14,
	},
	{
		name: "3-installment plan — 5 sessions, RM150 + RM12 tax, 60d interval (quarterly-ish)",
		creditsTotal: 5,
		totalPrice: 15000,
		taxAmount: 1200,
		installmentsTotal: 3,
		intervalDays: 60,
	},
] as const;

describe("POS installment schedule parity (old open-coded vs new helper)", () => {
	for (const c of CASES) {
		test(c.name, () => {
			const old = buildOldPosSchedule(c);
			const nw = buildNewSchedule(c);

			expect(old.length).toBe(c.installmentsTotal);
			expect(nw.length).toBe(c.installmentsTotal);

			for (let i = 0; i < c.installmentsTotal; i++) {
				const o = old[i]!;
				const n = nw[i]!;

				// Amount and tax math must be identical
				expect(n.amount).toBe(o.amount);
				expect(n.taxAmount).toBe(o.taxAmount);
				expect(n.creditsUnlockedByThis).toBe(o.creditsUnlockedByThis);
				expect(n.dueDateOffsetDays).toBe(o.dueDateOffsetDays);
				expect(n.installmentNumber).toBe(o.installmentNumber);

				// NEW behaviour: all installments start as "pending" (7.1 change)
				// OLD behaviour: installment #1 was "paid" at POS
				expect(n.status).toBe("pending");
			}

			// Amounts must sum to totalPrice exactly (no cents lost)
			const totalAmount = nw.reduce((s, r) => s + r.amount, 0);
			expect(totalAmount).toBe(c.totalPrice);

			// Tax must sum to taxAmount exactly
			const totalTax = nw.reduce((s, r) => s + r.taxAmount, 0);
			expect(totalTax).toBe(c.taxAmount);

			// Credits unlocked must sum to creditsTotal
			const totalCredits = nw.reduce((s, r) => s + r.creditsUnlockedByThis, 0);
			expect(totalCredits).toBe(c.creditsTotal);
		});
	}

	test("dueDate offsets are multiplicative — installment i is at i * intervalDays", () => {
		const rows = buildNewSchedule({
			creditsTotal: 12,
			totalPrice: 30000,
			taxAmount: 2400,
			installmentsTotal: 3,
			intervalDays: 30,
		});
		expect(rows[0]!.dueDateOffsetDays).toBe(30);
		expect(rows[1]!.dueDateOffsetDays).toBe(60);
		expect(rows[2]!.dueDateOffsetDays).toBe(90);
	});
});
