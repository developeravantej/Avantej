import { eq, and, desc, gte, lte } from "drizzle-orm";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export async function listCommissionSplits(
	tenantDb: TenantDb,
	params: {
		memberId?: string;
		appointmentId?: string;
		from?: Date;
		to?: Date;
		limit?: number;
		offset?: number;
	} = {},
) {
	const { memberId, appointmentId, from, to, limit = 50, offset = 0 } = params;

	const conditions = [];

	if (memberId) {
		conditions.push(eq(commissionSplits.staffId, memberId));
	}

	if (appointmentId) {
		conditions.push(eq(commissionSplits.appointmentId, appointmentId));
	}

	if (from) {
		conditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		conditions.push(lte(commissionSplits.createdAt, to));
	}

	const query = tenantDb
		.select()
		.from(commissionSplits)
		.orderBy(desc(commissionSplits.createdAt))
		.limit(limit)
		.offset(offset);

	if (conditions.length > 0) {
		return query.where(and(...conditions));
	}

	return query;
}

export async function getCommissionsByAppointment(
	tenantDb: TenantDb,
	appointmentId: string,
) {
	return tenantDb
		.select()
		.from(commissionSplits)
		.where(eq(commissionSplits.appointmentId, appointmentId))
		.orderBy(desc(commissionSplits.calculatedAmount));
}

export async function getMyCommissions(
	tenantDb: TenantDb,
	memberId: string,
	params: {
		from?: Date;
		to?: Date;
	} = {},
) {
	const { from, to } = params;

	const conditions = [eq(commissionSplits.staffId, memberId)];

	if (from) {
		conditions.push(gte(commissionSplits.createdAt, from));
	}

	if (to) {
		conditions.push(lte(commissionSplits.createdAt, to));
	}

	const splits = await tenantDb
		.select()
		.from(commissionSplits)
		.where(and(...conditions))
		.orderBy(desc(commissionSplits.createdAt));

	const totalAmount = splits.reduce(
		(sum, s) => sum + (s.calculatedAmount ?? 0),
		0,
	);

	return { splits, totalAmount };
}
