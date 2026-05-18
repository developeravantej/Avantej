/**
 * Shared subscriptions insert fixture for tests/scripts.
 *
 * The `subscriptions` table has several `notNull` columns without defaults
 * (stripePriceId, applicationFeeBps, etc.). This helper returns a valid
 * insert payload so callers don't have to remember every required column.
 */

import type { InferInsertModel } from "drizzle-orm";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

export type SubscriptionInsert = InferInsertModel<typeof subscriptions>;

/**
 * Build a complete, valid subscriptions insert payload. Pass overrides for
 * any field you care about — sensible test defaults fill in the rest.
 */
export function makeSubscriptionFixture(
	overrides: Partial<SubscriptionInsert> = {},
): SubscriptionInsert {
	const suffix = overrides.stripeSubscriptionId ?? `sub_test_${Date.now()}`;
	return {
		stripeSubscriptionId: suffix,
		stripeCustomerId: overrides.stripeCustomerId ?? `cus_test_${Date.now()}`,
		stripePriceId: overrides.stripePriceId ?? "price_test_professional",
		tier: overrides.tier ?? "professional",
		organizationCountLimit: overrides.organizationCountLimit ?? 3,
		applicationFeeBps: overrides.applicationFeeBps ?? 100,
		currency: overrides.currency ?? "usd",
		status: overrides.status ?? "active",
		...overrides,
	};
}
