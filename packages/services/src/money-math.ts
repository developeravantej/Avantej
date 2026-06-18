/**
 * money-math.ts — pure money arithmetic, no DB access.
 *
 * These helpers centralise the integer-cent / basis-point formulas that
 * otherwise live inline across the POS, promotions, tax and installment paths.
 * Extracting them makes the money-critical arithmetic unit-testable in
 * isolation (see money-math.test.ts) and removes the risk of the same formula
 * drifting between call sites.
 *
 * Conventions (locked across the codebase):
 *  - All monetary amounts are integer cents. Never floats.
 *  - Rates/weightages are basis points (bp): 10000 bp = 100.00%.
 *  - Discounts and taxes FLOOR (round toward zero) so the customer/business is
 *    never over-charged by a sub-cent rounding artefact. Premiums ROUND.
 */

export type PromotionType =
	| "percentage"
	| "fixed_amount"
	| "free_item"
	| "buy_x_get_y";

export type PromoDiscountInput = {
	type: PromotionType;
	/** percentage → basis points (2000 = 20%); fixed_amount/free_item → cents. */
	value: number;
	/** order subtotal in cents the discount applies against. */
	orderAmount: number;
	/** cap for percentage discounts, in cents. null/undefined = uncapped. */
	maximumDiscount?: number | null;
};

/**
 * Compute the discount (in cents) a promotion yields for a given order amount.
 *
 * Mirrors the inline logic in promotions.service.ts (validatePromoCode step 8):
 *  - percentage:   floor(orderAmount × value / 10000), capped at maximumDiscount
 *  - fixed_amount: min(value, orderAmount)  — never discount more than the order
 *  - free_item / buy_x_get_y: the raw value (the item's cent value)
 *
 * Never returns more than `orderAmount` for percentage/fixed paths; callers that
 * combine discounts are responsible for clamping the running total.
 */
export function calculatePromoDiscount(input: PromoDiscountInput): number {
	const { type, value, orderAmount, maximumDiscount } = input;

	if (type === "percentage") {
		let discount = Math.floor((orderAmount * value) / 10000);
		if (maximumDiscount != null && discount > maximumDiscount) {
			discount = maximumDiscount;
		}
		return discount;
	}

	if (type === "fixed_amount") {
		return Math.min(value, orderAmount);
	}

	// free_item / buy_x_get_y — discount equals the configured item value.
	return value;
}

/**
 * Apply a tax rate (basis points) to a tax base (cents), flooring the result.
 *
 * Mirrors pos.service.ts: Math.floor((taxBase × rateInBasisPoints) / 10000).
 * A null/zero rate yields 0. Negative bases/rates are not expected; callers
 * pass non-negative integer cents.
 */
export function applyTaxBasisPoints(
	taxBaseCents: number,
	rateInBasisPoints: number | null | undefined,
): number {
	const rate = rateInBasisPoints ?? 0;
	if (rate <= 0 || taxBaseCents <= 0) return 0;
	return Math.floor((taxBaseCents * rate) / 10000);
}

/**
 * Scale a base price by an installment "price premium" (basis points) and round
 * to the nearest cent. e.g. premiumBps=500 (5%) on 30000c → 31500c.
 *
 * Integer-domain form: round((total × (10000 + premiumBps)) / 10000). A zero or
 * negative premium returns the base unchanged.
 */
export function applyInstallmentPremium(
	totalCents: number,
	premiumBps: number | null | undefined,
): number {
	const bps = premiumBps ?? 0;
	if (bps <= 0) return totalCents;
	return Math.round((totalCents * (10000 + bps)) / 10000);
}
