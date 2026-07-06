/**
 * Default Tax Rate Seed
 *
 * `pos.recordSale` hard-requires an active tax rate — without one, every POS
 * sale returns 400 "No active tax rate is configured for this organisation."
 * A freshly-provisioned tenant has no tax rate, so it cannot record a single
 * sale until an operator manually configures one. Seed a 0% default placeholder
 * so a new tenant can transact immediately; the org replaces it with their real
 * SST / service-tax rate before actually charging tax.
 *
 * Idempotent — no-op if the tenant already has any active tax rate.
 *
 * Usage:
 * ```typescript
 * import { seedDefaultTaxRate } from "@avantej-core/db";
 *
 * await seedDefaultTaxRate(tenantDb);
 * ```
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { taxRates } from "./schema/tenant";
import type * as tenantSchema from "./schema/tenant-schema";

export async function seedDefaultTaxRate(
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<void> {
	const existing = await tenantDb.query.taxRates.findFirst({
		where: (t, { eq }) => eq(t.isActive, true),
	});
	if (existing) return;

	await tenantDb.insert(taxRates).values({
		name: "No Tax (SST 0%)",
		code: "SST0",
		rateInBasisPoints: 0,
		category: "SST",
		isActive: true,
		isDefault: true,
		effectiveFrom: new Date(),
		description:
			"Placeholder 0% default so POS can record sales. Replace with the real SST / service-tax rate before charging tax.",
	});
}
