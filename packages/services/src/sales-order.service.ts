import { eq, and, desc, count, gte, lte, sql } from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { cancelledSales } from "@avantej-core/db/schema/tenant/cancelled-sales";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

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
		.from(cancelledSales)
		.where(sql`${cancelledSales.cancellationNumber} LIKE ${prefix + "%"}`);

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
	params: { cancelledBy: string; reason?: string; refundAmount: number }
): Promise<{ salesOrder: typeof salesOrders.$inferSelect; cancelledSale: typeof cancelledSales.$inferSelect }> {
	const existing = await getSalesOrderById(tenantDb, id);
	if (!existing) {
		throw new Error("Sales order not found");
	}

	const now = new Date();
	const cancellationNumber = await generateCancellationNumber(tenantDb, now);

	return tenantDb.transaction(async (tx) => {
		const [updatedOrder] = await tx
			.update(salesOrders)
			.set({ status: "cancelled", updatedAt: now })
			.where(eq(salesOrders.id, id))
			.returning();

		if (!updatedOrder) {
			throw new Error("Failed to cancel sales order");
		}

		const [cancelledSale] = await tx
			.insert(cancelledSales)
			.values({
				cancellationNumber,
				salesOrderId: id,
				invoiceId: null,
				cancellationDate: now,
				cancelledAmount: params.refundAmount,
				cancellationReason: params.reason ?? null,
				cancelledBy: params.cancelledBy,
				customerId: existing.customerId ?? null,
				customerName: existing.customerName,
			})
			.returning();

		if (!cancelledSale) {
			throw new Error("Failed to create cancelled sale record");
		}

		return { salesOrder: updatedOrder, cancelledSale };
	});
}
