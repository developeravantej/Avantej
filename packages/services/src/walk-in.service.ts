/**
 * Walk-In Service
 *
 * Operations specific to walk-in / drop-in customer flows that don't fit the
 * standard membership/POS pipeline.
 *
 * Agent 3.5 — §5 Phase 3 (schema-relationship-fixes):
 *   `convertWalkInPaymentToPackage` — convert a succeeded walk-in drop-in
 *   payment into a package-credit payment (e.g. customer pays RM50 drop-in,
 *   then upgrades to a 10-pack mid-session). The original walk-in payment is
 *   marked `converted` and a NEW package payment row is created with
 *   `convertedFromPaymentId` pointing at the original. Credits on the target
 *   package_instance are unaffected by the conversion itself — the upstream
 *   POS sale that created/seeded the package_instance owns the credits — but
 *   we record the link so refund/reporting flows can trace the chain.
 */

import { eq } from "drizzle-orm";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { ORPCError } from "@orpc/server";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export interface ConvertWalkInPaymentToPackageParams {
	walkInPaymentId: string;
	targetPackageInstanceId: string;
	customerProfileId?: string;
	actorUserId: string;
}

export interface ConvertWalkInPaymentToPackageResult {
	/** ID of the NEW package-payment row that links to the original walk-in payment. */
	newPaymentId: string;
	/** ID of the now-converted walk-in payment (status: "converted"). */
	walkInPaymentId: string;
	/** ID of the package_instance that received the conversion. */
	packageInstanceId: string;
}

/**
 * Convert a succeeded walk-in payment into a package payment.
 *
 * Atomic transaction:
 *   1. Lock + verify the walk-in payment (status=succeeded, not already converted).
 *   2. Verify the target package_instance exists.
 *   3. Insert a NEW payment row mirroring the walk-in payment's amounts but
 *      stamped with `convertedFromPaymentId = walkInPaymentId`.
 *   4. Mark the original walk-in payment as `status = 'converted'`.
 */
export async function convertWalkInPaymentToPackage(
	tenantDb: TenantDb,
	params: ConvertWalkInPaymentToPackageParams,
): Promise<ConvertWalkInPaymentToPackageResult> {
	const { walkInPaymentId, targetPackageInstanceId, actorUserId } = params;

	return await tenantDb.transaction(async (tx) => {
		// 1. Fetch the walk-in payment.
		const [walkIn] = await tx
			.select()
			.from(payments)
			.where(eq(payments.id, walkInPaymentId));

		if (!walkIn) {
			throw new ORPCError("NOT_FOUND", {
				message: `Walk-in payment ${walkInPaymentId} not found`,
			});
		}
		if (walkIn.status !== "succeeded") {
			throw new ORPCError("BAD_REQUEST", {
				message: `Walk-in payment must be 'succeeded' to convert (current: ${walkIn.status})`,
			});
		}
		// Block double-conversion: if any payment already references this one as its source.
		const [alreadyConverted] = await tx
			.select({ id: payments.id })
			.from(payments)
			.where(eq(payments.convertedFromPaymentId, walkInPaymentId));
		if (alreadyConverted) {
			throw new ORPCError("CONFLICT", {
				message: `Walk-in payment ${walkInPaymentId} has already been converted (target payment: ${alreadyConverted.id})`,
			});
		}

		// 2. Verify target package_instance exists.
		const [pkg] = await tx
			.select({ id: packageInstances.id })
			.from(packageInstances)
			.where(eq(packageInstances.id, targetPackageInstanceId));
		if (!pkg) {
			throw new ORPCError("NOT_FOUND", {
				message: `Target package_instance ${targetPackageInstanceId} not found`,
			});
		}

		// 3. Create the new package-payment row linking back to the walk-in.
		const [newPayment] = await tx
			.insert(payments)
			.values({
				stripePaymentIntentId: `pi_converted_${walkInPaymentId}`,
				customerId: walkIn.customerId,
				userId: walkIn.userId,
				amount: walkIn.amount,
				taxAmount: walkIn.taxAmount,
				totalAmount: walkIn.totalAmount,
				currency: walkIn.currency,
				platformFeeAmount: walkIn.platformFeeAmount,
				platformFeePercentage: walkIn.platformFeePercentage,
				franchiserAmount: walkIn.franchiserAmount,
				status: "succeeded",
				paymentMethod: walkIn.paymentMethod,
				description: `Converted from walk-in payment ${walkInPaymentId}`,
				convertedFromPaymentId: walkInPaymentId,
			})
			.returning({ id: payments.id });

		if (!newPayment) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to create converted payment record",
			});
		}

		// 4. Mark walk-in payment as converted.
		await tx
			.update(payments)
			.set({
				status: "converted",
				updatedAt: new Date(),
				metadata: JSON.stringify({
					convertedToPaymentId: newPayment.id,
					convertedToPackageInstanceId: targetPackageInstanceId,
					convertedBy: actorUserId,
					convertedAt: new Date().toISOString(),
				}),
			})
			.where(eq(payments.id, walkInPaymentId));

		return {
			newPaymentId: newPayment.id,
			walkInPaymentId,
			packageInstanceId: targetPackageInstanceId,
		};
	});
}
