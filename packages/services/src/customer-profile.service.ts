/**
 * Customer Profile Service
 *
 * Handles customer profile get/upsert by user_id in tenant databases.
 *
 * Usage:
 * ```typescript
 * import { getCustomerProfile, upsertCustomerProfile } from "@avantej-core/services";
 * const profile = await getCustomerProfile(tenantDb, userId);
 * ```
 */

import { eq } from "drizzle-orm";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type UpsertCustomerProfileParams = {
  userId: string;
  phone?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  medicalNotes?: string | null;
  fitnessGoals?: string[] | null;
  creditPoints?: number;
  notes?: string | null;
};

/**
 * Get customer profile by user_id.
 */
export async function getCustomerProfile(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  userId: string
): Promise<(typeof customerProfiles.$inferSelect) | null> {
  const row = await tenantDb.query.customerProfiles.findFirst({
    where: eq(customerProfiles.userId, userId),
  });
  return row ?? null;
}

/**
 * Upsert customer profile for a user.
 */
export async function upsertCustomerProfile(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: UpsertCustomerProfileParams
): Promise<typeof customerProfiles.$inferSelect> {
  const existing = await getCustomerProfile(tenantDb, params.userId);

  const setObj = {
    ...(params.phone !== undefined && { phone: params.phone }),
    ...(params.dateOfBirth !== undefined && { dateOfBirth: params.dateOfBirth }),
    ...(params.gender !== undefined && { gender: params.gender }),
    ...(params.address !== undefined && { address: params.address }),
    ...(params.emergencyContactName !== undefined && {
      emergencyContactName: params.emergencyContactName,
    }),
    ...(params.emergencyContactPhone !== undefined && {
      emergencyContactPhone: params.emergencyContactPhone,
    }),
    ...(params.medicalNotes !== undefined && { medicalNotes: params.medicalNotes }),
    ...(params.fitnessGoals !== undefined && { fitnessGoals: params.fitnessGoals }),
    ...(params.creditPoints !== undefined && { creditPoints: params.creditPoints }),
    ...(params.notes !== undefined && { notes: params.notes }),
    updatedAt: new Date(),
  };

  if (existing) {
    const [row] = await tenantDb
      .update(customerProfiles)
      .set(setObj)
      .where(eq(customerProfiles.userId, params.userId))
      .returning();
    if (!row) throw new Error("Failed to update customer profile");
    return row;
  }

  const [row] = await tenantDb
    .insert(customerProfiles)
    .values({
      userId: params.userId,
      phone: params.phone ?? null,
      dateOfBirth: params.dateOfBirth ?? null,
      gender: params.gender ?? null,
      address: params.address ?? null,
      emergencyContactName: params.emergencyContactName ?? null,
      emergencyContactPhone: params.emergencyContactPhone ?? null,
      medicalNotes: params.medicalNotes ?? null,
      fitnessGoals: params.fitnessGoals ?? null,
      creditPoints: params.creditPoints ?? 0,
      notes: params.notes ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create customer profile");
  return row;
}
