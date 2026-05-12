import { eq, and, desc, or, lt } from "drizzle-orm";
import { paymentStatusHistory } from "@avantej-core/db/schema/tenant/payment-status-history";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type PaymentHistoryQueryOpts = {
	parsedCursor: { changedAt: Date; id: string } | null;
	limit: number;
};

export async function getPaymentStatusHistory(
	tenantDb: TenantDb,
	paymentId: string,
	{ parsedCursor, limit }: PaymentHistoryQueryOpts,
) {
	return tenantDb
		.select()
		.from(paymentStatusHistory)
		.where(
			and(
				eq(paymentStatusHistory.paymentId, paymentId),
				parsedCursor
					? or(
							lt(paymentStatusHistory.changedAt, parsedCursor.changedAt),
							and(
								eq(paymentStatusHistory.changedAt, parsedCursor.changedAt),
								lt(paymentStatusHistory.id, parsedCursor.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(desc(paymentStatusHistory.changedAt), desc(paymentStatusHistory.id))
		.limit(limit + 1);
}
