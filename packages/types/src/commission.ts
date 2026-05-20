/**
 * Shared commission types for Avantej Core platform.
 *
 * CommissionEarnReason — discriminates WHY a commission split was created.
 *
 * - "completion"   : appointment transitioned to "completed"
 * - "cancellation" : appointment transitioned to "cancelled" (counts as delivery
 *                    per the cancellation policy)
 * - "pos_product"  : POS sale of a physical product (productId IS NOT NULL);
 *                    commissions earn at sale time, no appointment involved
 * - "no_show"      : appointment transitioned to "no_show" (trainer showed up;
 *                    client did not — still counts as delivery)
 * - "manual"       : manually created adjustment split (admin override)
 */
export type CommissionEarnReason =
	| "completion"
	| "cancellation"
	| "no_show"
	| "pos_product"
	| "manual";
