export type ParseMoneyResult =
	| { ok: true; cents: number }
	| { ok: false; error: string };

export function rmToCents(rm: string | number): number {
	const value = typeof rm === "string" ? Number.parseFloat(rm) : rm;
	if (Number.isNaN(value) || value < 0) throw new Error("Invalid amount");
	return Math.round(value * 100);
}

export function centsToRm(cents: number): string {
	return (cents / 100).toFixed(2);
}

export function formatPrice(cents: number, currency: string = "MYR"): string {
	const amount = cents / 100;
	const upper = currency.toUpperCase();

	if (upper === "MYR") {
		return `RM ${amount.toLocaleString("en-MY", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`;
	}

	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: upper,
	}).format(amount);
}

export function parseMoneyInput(raw: string): ParseMoneyResult {
	const trimmed = raw.trim().replace(/^RM\s*/i, "").replace(/,/g, "");
	if (trimmed.length === 0) return { ok: false, error: "Required" };

	const value = Number.parseFloat(trimmed);
	if (Number.isNaN(value)) return { ok: false, error: "Enter a valid amount" };
	if (value < 0) return { ok: false, error: "Amount must be ≥ 0" };

	return { ok: true, cents: Math.round(value * 100) };
}
