// ─── Shared types & helpers for Installment Plans ─────────────────────────────

export type InstallmentPlanRow = {
	id: string;
	code: string;
	name: string;
	numInstallments: number;
	defaultIntervalDays: number;
	pricePremiumBps: number;
	description: string | null;
	isDefault: boolean;
	isActive: boolean;
	sortOrder: number;
	createdAt: string;
};

export type FormState = {
	code: string;
	name: string;
	numInstallments: string;
	defaultIntervalDays: string;
	pricePremiumPct: string;
	description: string;
	isDefault: boolean;
};

export const EMPTY_FORM: FormState = {
	code: "",
	name: "",
	numInstallments: "1",
	defaultIntervalDays: "30",
	pricePremiumPct: "0",
	description: "",
	isDefault: false,
};

/** Format a basis-points premium as a % string */
export function fmtPremium(bps: number) {
	if (bps === 0) return null;
	return `+${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Compute per-installment amount from a sample total (in RM cents-free) */
export function samplePerInstallment(total: number, n: number) {
	if (n <= 0) return total;
	const per = total / n;
	return per % 1 === 0 ? per.toFixed(0) : per.toFixed(2);
}
