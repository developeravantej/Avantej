/**
 * Member Profile Service
 *
 * Handles member profile get/upsert by member_id in tenant databases.
 *
 * Usage:
 * ```typescript
 * import { getMemberProfile, upsertMemberProfile } from "@avantej-core/services/member-profile.service";
 * const profile = await getMemberProfile(tenantDb, memberId);
 * ```
 */

import { eq } from "drizzle-orm";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type UpsertMemberProfileParams = {
	displayName?: string | null;
	bio?: string | null;
	specialization?: string | null;
	imageUrl?: string | null;
	phoneNumber?: string | null;
	certifications?: string[] | null;
};

/**
 * Get member profile by member_id.
 */
export async function getMemberProfile(
	tenantDb: TenantDb,
	memberId: string,
): Promise<typeof memberProfiles.$inferSelect | null> {
	const row = await tenantDb.query.memberProfiles.findFirst({
		where: eq(memberProfiles.memberId, memberId),
	});
	return row ?? null;
}

/**
 * Upsert member profile for a member.
 */
export async function upsertMemberProfile(
	tenantDb: TenantDb,
	memberId: string,
	data: UpsertMemberProfileParams,
): Promise<typeof memberProfiles.$inferSelect> {
	const [row] = await tenantDb
		.insert(memberProfiles)
		.values({ memberId, ...data, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: memberProfiles.memberId,
			set: { ...data, updatedAt: new Date() },
		})
		.returning();
	if (!row) throw new Error("Failed to upsert member profile");
	return row;
}
