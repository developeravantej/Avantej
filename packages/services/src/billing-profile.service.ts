import { eq } from "drizzle-orm";
import { orgBillingProfile } from "@avantej-core/db/schema/tenant/billing-profile";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

const SINGLETON_ID = "singleton";

/** Logo constraints — printed documents inline the logo as a data URL, so keep it small. */
export const MAX_LOGO_BYTES = 200 * 1024;
export const ALLOWED_LOGO_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
]);

export type BillingProfile = typeof orgBillingProfile.$inferSelect;

export type UpsertBillingProfileParams = Partial<{
	legalName: string | null;
	registrationNo: string | null;
	address: string | null;
	footerNote: string | null;
	logoKey: string | null;
	logoContentType: string | null;
}>;

export async function getBillingProfile(
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<BillingProfile | null> {
	const row = await tenantDb.query.orgBillingProfile.findFirst({
		where: eq(orgBillingProfile.id, SINGLETON_ID),
	});
	return row ?? null;
}

export async function upsertBillingProfile(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: UpsertBillingProfileParams,
): Promise<BillingProfile> {
	const [row] = await tenantDb
		.insert(orgBillingProfile)
		.values({ id: SINGLETON_ID, ...params })
		.onConflictDoUpdate({
			target: orgBillingProfile.id,
			set: { ...params, updatedAt: new Date() },
		})
		.returning();
	if (!row) throw new Error("Failed to upsert billing profile");
	return row;
}
