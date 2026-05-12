/**
 * Payouts Service
 *
 * Business logic for managing coach/trainer payouts including
 * commission reversal batch processing.
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { commissionSplitReversals } from "@avantej-core/db/schema/tenant/commission-split-reversals";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { eq, inArray, isNull } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

// ---------------------------------------------------------------------------
// processCommissionReversals
// ---------------------------------------------------------------------------

/**
 * Batch-process all unlinked commission split reversals.
 *
 * Finds every reversal row where `payoutAdjustmentId IS NULL` (i.e. not yet
 * tied to a payout adjustment), groups them by staffId, creates one negative
 * payout row per staff member, and links the reversal rows back to it.
 * Also flips the originating commission_splits to status='reversed'.
 *
 * This function is idempotent when called multiple times — on the second call,
 * `pending` will be empty because all reversals now have a payoutAdjustmentId.
 *
 * @returns processedCount — number of staff members processed (one payout per staff)
 * @returns payoutIds — IDs of the newly created payout rows
 */
export async function processCommissionReversals(
	tenantDb: TenantDb,
	actor: { userId: string; memberId: string },
): Promise<{ processedCount: number; payoutIds: string[] }> {
	// 1. Find all unprocessed reversals (payoutAdjustmentId IS NULL)
	const pending = await tenantDb
		.select({
			reversalId: commissionSplitReversals.id,
			reversedSplitId: commissionSplitReversals.reversedSplitId,
			amountCents: commissionSplitReversals.amountCents,
			staffId: commissionSplits.staffId,
		})
		.from(commissionSplitReversals)
		.innerJoin(
			commissionSplits,
			eq(commissionSplitReversals.reversedSplitId, commissionSplits.id),
		)
		.where(isNull(commissionSplitReversals.payoutAdjustmentId));

	if (pending.length === 0) return { processedCount: 0, payoutIds: [] };

	// 2. Group by staffId
	type PendingRow = (typeof pending)[number];
	const byStaff = new Map<string, PendingRow[]>();
	for (const row of pending) {
		const existing = byStaff.get(row.staffId) ?? [];
		existing.push(row);
		byStaff.set(row.staffId, existing);
	}

	return tenantDb.transaction(async (tx) => {
		const payoutIds: string[] = [];

		for (const [staffId, reversals] of byStaff) {
			// Total clawback amount — stored as a negative value on the payout row
			const totalNegativeAmountCents = -reversals.reduce(
				(sum, r) => sum + r.amountCents,
				0,
			);
			const reversalIds = reversals.map((r) => r.reversalId);
			const splitIds = reversals.map((r) => r.reversedSplitId);

			// 3. Insert negative payout adjustment row
			const [newPayout] = await tx
				.insert(payouts)
				.values({
					recipientId: staffId,
					amount: totalNegativeAmountCents, // negative value = clawback
					currency: "myr",
					payoutMethod: "adjustment",
					status: "pending",
					description: `Commission reversal adjustment for ${reversals.length} refund(s)`,
					appointmentId: null, // not tied to an appointment (nullable after migration 0046)
				})
				.returning({ id: payouts.id });

			if (!newPayout) throw new Error(`Failed to insert payout for staff ${staffId}`);
			payoutIds.push(newPayout.id);

			// 4. Link reversal rows to the new payout adjustment
			await tx
				.update(commissionSplitReversals)
				.set({ payoutAdjustmentId: newPayout.id })
				.where(inArray(commissionSplitReversals.id, reversalIds));

			// 5. Mark the originating commission splits as 'reversed'
			await tx
				.update(commissionSplits)
				.set({ status: "reversed" })
				.where(inArray(commissionSplits.id, splitIds));
		}

		return { processedCount: byStaff.size, payoutIds };
	});
}
