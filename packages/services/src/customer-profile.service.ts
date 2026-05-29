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

import { eq, isNotNull, sql } from "drizzle-orm";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { creditPointLedger } from "@avantej-core/db/schema/tenant/credit-point-ledger";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
// Drizzle transaction handle — structurally compatible with TenantDb for the
// select/update/insert calls used by the credit-point helpers below.
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

/** Parameters for {@link redeemCreditPoints} / {@link adjustCreditPoints}. */
export type CreditPointMutationParams = {
  customerUserId: string;
  /** Always a positive magnitude; redeem subtracts, adjust adds. */
  points: number;
  reason: string;
  sourceType?: string | null;
  sourceId?: string | null;
  actorUserId?: string | null;
};

export type CreditPointMutationResult = {
  balanceBefore: number;
  balanceAfter: number;
  delta: number;
  ledgerId: string;
};

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
  // === 3.2 lead source / attribution ===
  leadSourceId?: string | null;
  referrerMemberId?: string | null;
  campaignId?: string | null;
  // === /3.2 ===
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
  // F-CRM-07: single atomic upsert keyed on the unique user_id index, so a
  // concurrent caller can't race the old get-then-insert/update into a
  // duplicate-key error or a lost update. `undefined` fields are skipped from
  // the ON CONFLICT update set; explicit `null` clears the column.
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
    // === 3.2 lead source / attribution ===
    ...(params.leadSourceId !== undefined && { leadSourceId: params.leadSourceId }),
    ...(params.referrerMemberId !== undefined && {
      referrerMemberId: params.referrerMemberId,
    }),
    ...(params.campaignId !== undefined && { campaignId: params.campaignId }),
    // === /3.2 ===
    updatedAt: new Date(),
  };

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
      // === 3.2 lead source / attribution ===
      leadSourceId: params.leadSourceId ?? null,
      referrerMemberId: params.referrerMemberId ?? null,
      campaignId: params.campaignId ?? null,
      // === /3.2 ===
    })
    // Target the partial unique index on user_id (WHERE user_id IS NOT NULL).
    // `userId` is always non-null here, so the index always applies.
    .onConflictDoUpdate({
      target: customerProfiles.userId,
      targetWhere: isNotNull(customerProfiles.userId),
      set: setObj,
    })
    .returning();
  if (!row) throw new Error("Failed to upsert customer profile");
  return row;
}

// ---------------------------------------------------------------------------
// F-CRM-02 — credit-point consumption (ledger-backed)
// ---------------------------------------------------------------------------
//
// customer_profiles.creditPoints is the authoritative balance; credit_point_ledger
// is the append-only trail of every change. `delta` is negative for redemptions,
// positive for earn/adjust; `balanceAfter` snapshots the running balance.

/**
 * Apply a credit-point delta atomically on an existing transaction handle.
 *
 * Locks the customer_profiles row FOR UPDATE (so two concurrent redemptions
 * can't both read the same balance and over-spend), validates the resulting
 * balance stays non-negative, decrements/increments creditPoints, and inserts a
 * matching credit_point_ledger row. Throws on missing profile or insufficient
 * balance. `signedDelta` is the actual signed change (negative = redeem).
 *
 * Exposed for callers that need the mutation to participate in their own
 * transaction (e.g. POS checkout). Standalone callers should use
 * {@link redeemCreditPoints} / {@link adjustCreditPoints}.
 */
export async function applyCreditPointDeltaTx(
  tx: TenantTx,
  params: {
    customerUserId: string;
    signedDelta: number;
    reason: string;
    sourceType?: string | null;
    sourceId?: string | null;
    actorUserId?: string | null;
  },
): Promise<CreditPointMutationResult> {
  if (!Number.isInteger(params.signedDelta) || params.signedDelta === 0) {
    throw new Error("Credit-point delta must be a non-zero integer");
  }

  // Lock the profile row so concurrent mutations serialize on it.
  const [profile] = await tx
    .select({ creditPoints: customerProfiles.creditPoints })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, params.customerUserId))
    .for("update")
    .limit(1);

  if (!profile) {
    throw new Error(
      `Customer profile not found for userId: ${params.customerUserId}`,
    );
  }

  const balanceBefore = profile.creditPoints ?? 0;
  const balanceAfter = balanceBefore + params.signedDelta;

  if (balanceAfter < 0) {
    throw new Error(
      `Insufficient credit points: balance ${balanceBefore}, attempted change ${params.signedDelta}`,
    );
  }

  await tx
    .update(customerProfiles)
    .set({
      creditPoints: sql`${customerProfiles.creditPoints} + ${params.signedDelta}`,
      updatedAt: new Date(),
    })
    .where(eq(customerProfiles.userId, params.customerUserId));

  const [ledgerRow] = await tx
    .insert(creditPointLedger)
    .values({
      customerUserId: params.customerUserId,
      delta: params.signedDelta,
      balanceAfter,
      reason: params.reason,
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
      actorUserId: params.actorUserId ?? null,
    })
    .returning({ id: creditPointLedger.id });

  if (!ledgerRow) throw new Error("Failed to insert credit_point_ledger row");

  return {
    balanceBefore,
    balanceAfter,
    delta: params.signedDelta,
    ledgerId: ledgerRow.id,
  };
}

/**
 * Redeem (spend) `points` from a customer's credit-point balance, atomically.
 *
 * Validates `points > 0` and `points <= current balance`, decrements the
 * balance, and records a ledger row with `delta = -points`. Throws on
 * insufficient balance. Runs in its own transaction with the profile row
 * locked FOR UPDATE.
 */
export async function redeemCreditPoints(
  tenantDb: TenantDb,
  params: CreditPointMutationParams,
): Promise<CreditPointMutationResult> {
  if (!Number.isInteger(params.points) || params.points <= 0) {
    throw new Error("points to redeem must be a positive integer");
  }
  return tenantDb.transaction((tx) =>
    applyCreditPointDeltaTx(tx, {
      customerUserId: params.customerUserId,
      signedDelta: -params.points,
      reason: params.reason,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      actorUserId: params.actorUserId,
    }),
  );
}

/**
 * Adjust (add) `points` to a customer's credit-point balance, atomically.
 *
 * For earn / manual top-up flows. Records a ledger row with `delta = +points`.
 * Same atomic + locked pattern as {@link redeemCreditPoints}.
 */
export async function adjustCreditPoints(
  tenantDb: TenantDb,
  params: CreditPointMutationParams,
): Promise<CreditPointMutationResult> {
  if (!Number.isInteger(params.points) || params.points <= 0) {
    throw new Error("points to adjust must be a positive integer");
  }
  return tenantDb.transaction((tx) =>
    applyCreditPointDeltaTx(tx, {
      customerUserId: params.customerUserId,
      signedDelta: params.points,
      reason: params.reason,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      actorUserId: params.actorUserId,
    }),
  );
}
