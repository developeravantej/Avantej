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

// Commission Tracks — enum unions (Task #10 — Commission Tracks Plan §3.3)
// Applied via text().$type<…>() in Drizzle schema and z.enum([...]) in routers.

/** Who earns this track (role dimension). */
export type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";

/** When the commission triggers relative to the transaction lifecycle. */
export type CommissionTrigger = "on_completion" | "on_sale";

/** How the base amount is calculated before applying rate. */
export type CommissionBasis =
	| "delivery_total"
	| "gross_order"
	| "net_order"
	| "flat";

/** Which entity dimension the track applies to. */
export type CommissionTrackScope = "category" | "org" | "product";

/** How multiple earners on the same track share the pool. */
export type CommissionPoolPolicy = "separate" | "shared";

/** Whether the rate is a fixed amount (cents) or variable (basis points). */
export type CommissionPaymentType = "fixed" | "variable";

/**
 * UAT §12 — which kind of sale an origination track applies to.
 * - "new"     : only a new customer's first purchase (acquisition)
 * - "renewal" : only a returning customer's purchase
 * - "any"     : applies regardless (default; preserves pre-§12 behaviour)
 */
export type CommissionSalesType = "new" | "renewal" | "any";
