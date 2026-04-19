import { eq, and, desc, count, gte, lte, sql } from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";

export type CreateSalesOrderParams = {
	date: Date;
	customerId?: string;
	customerName: string;
	createdBy: string;
	branchId: string;
	status?: "draft" | "confirmed" | "completed" | "cancelled";
	totalAmount: number;
	notes?: string;
};

export type UpdateSalesOrderParams = Partial<
	Omit<CreateSalesOrderParams, "createdBy" | "branchId">
>;

function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

async function generateSalesOrderNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const prefix = `SO-${datePart}-`;

	const result = await tenantDb
		.select({ total: count() })
		.from(salesOrders)
		.where(sql`${salesOrders.salesOrderNumber} LIKE ${prefix + "%"}`);

	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

async function generateCancellationNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const prefix = `CAN-${datePart}-`;

	const result = await tenantDb
		.select({ total: count() })
		.from(salesOrders)
		.where(sql`${salesOrders.cancellationNumber} LIKE ${prefix + "%"}`);

	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function listSalesOrders(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		branchId?: string;
		status?: string;
		customerId?: string;
		from?: Date;
		to?: Date;
		accessibleNodeIds?: string[];
	} = {}
): Promise<(typeof salesOrders.$inferSelect)[]> {
	const { branchId, status, customerId, from, to, accessibleNodeIds } = params;

	const conditions = [];
	if (branchId) {
		conditions.push(eq(salesOrders.branchId, branchId));
	}
	if (status) {
		conditions.push(eq(salesOrders.status, status));
	}
	if (customerId) {
		conditions.push(eq(salesOrders.customerId, customerId));
	}
	if (from) {
		conditions.push(gte(salesOrders.date, from));
	}
	if (to) {
		conditions.push(lte(salesOrders.date, to));
	}

	const rows = await tenantDb.query.salesOrders.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(salesOrders.date)],
	});

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		return rows.filter((row) => accessibleNodeIds.includes(row.branchId));
	}

	return rows;
}

export async function getSalesOrderById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<(typeof salesOrders.$inferSelect) | null> {
	const row = await tenantDb.query.salesOrders.findFirst({
		where: eq(salesOrders.id, id),
	});
	return row ?? null;
}

export async function createSalesOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateSalesOrderParams
): Promise<typeof salesOrders.$inferSelect> {
	const salesOrderNumber = await generateSalesOrderNumber(tenantDb, params.date);

	const [row] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber,
			date: params.date,
			customerId: params.customerId ?? null,
			customerName: params.customerName,
			createdBy: params.createdBy,
			branchId: params.branchId,
			status: params.status ?? "draft",
			totalAmount: params.totalAmount,
			notes: params.notes ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create sales order");
	}
	return row;
}

export async function updateSalesOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: UpdateSalesOrderParams
): Promise<typeof salesOrders.$inferSelect> {
	const [row] = await tenantDb
		.update(salesOrders)
		.set({
			...(params.date !== undefined && { date: params.date }),
			...(params.customerId !== undefined && { customerId: params.customerId }),
			...(params.customerName !== undefined && { customerName: params.customerName }),
			...(params.status !== undefined && { status: params.status }),
			...(params.totalAmount !== undefined && { totalAmount: params.totalAmount }),
			...(params.notes !== undefined && { notes: params.notes }),
			updatedAt: new Date(),
		})
		.where(eq(salesOrders.id, id))
		.returning();

	if (!row) {
		throw new Error("Sales order not found");
	}
	return row;
}

export async function cancelSalesOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: { cancelledBy: string; reason?: string; refundAmount: number },
	actor: { userId: string; memberId: string; role: string },
): Promise<typeof salesOrders.$inferSelect> {
	const existing = await getSalesOrderById(tenantDb, id);
	if (!existing) {
		throw new Error("Sales order not found");
	}

	if (params.refundAmount < 0 || params.refundAmount > existing.totalAmount) {
		throw new Error(
			`refundAmount ${params.refundAmount} is out of range (order total: ${existing.totalAmount})`
		);
	}

	const now = new Date();
	const cancellationNumber = await generateCancellationNumber(tenantDb, now);

	return tenantDb.transaction(async (tx) => {
		const [updatedOrder] = await tx
			.update(salesOrders)
			.set({
				status: "cancelled",
				cancellationNumber,
				cancellationDate: now,
				cancellationReason: params.reason ?? null,
				cancelledBy: params.cancelledBy,
				cancelledAmount: params.refundAmount,
				updatedAt: now,
			})
			.where(eq(salesOrders.id, id))
			.returning();

		if (!updatedOrder) {
			throw new Error("Failed to cancel sales order");
		}

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "sale.cancel",
			entityType: "sales_order",
			entityId: id,
			branchId: existing.branchId,
			summary: `Cancelled sales order ${existing.salesOrderNumber ?? id}`,
			changes: { refundAmount: params.refundAmount, reason: params.reason ?? null },
		});

		return updatedOrder;
	});
}
