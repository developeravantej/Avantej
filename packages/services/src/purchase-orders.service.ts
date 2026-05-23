import { eq, and, desc, inArray, sql, count, gte, lte } from "drizzle-orm";
import {
	purchaseOrders,
	purchaseOrderItems,
} from "@avantej-core/db/schema/tenant/purchase-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

async function generatePONumber(tenantDb: TenantDb): Promise<string> {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	const datePart = `${y}${m}${d}`;
	const prefix = `PO-${datePart}-`;

	const result = await tenantDb
		.select({ total: count() })
		.from(purchaseOrders)
		.where(sql`${purchaseOrders.purchaseOrderNumber} LIKE ${prefix + "%"}`);

	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

export type CreatePurchaseOrderParams = {
	supplierId: string;
	branchId: string;
	orderDate: Date;
	expectedDeliveryDate?: Date;
	notes?: string;
	createdBy: string;
	items: Array<{
		productId: string;
		orderedQty: number;
		unitCost: number;
	}>;
};

export async function listPurchaseOrders(
	tenantDb: TenantDb,
	params: {
		supplierId?: string;
		branchId?: string;
		status?: string;
		from?: Date;
		to?: Date;
		accessibleNodeIds?: string[];
		limit?: number;
		offset?: number;
	} = {},
) {
	const {
		supplierId,
		branchId,
		status,
		from,
		to,
		accessibleNodeIds,
		limit = 50,
		offset = 0,
	} = params;

	const conditions = [];

	if (supplierId) {
		conditions.push(eq(purchaseOrders.supplierId, supplierId));
	}
	if (branchId) {
		conditions.push(eq(purchaseOrders.branchId, branchId));
	}
	if (status) {
		conditions.push(
			eq(
				purchaseOrders.status,
				status as
					| "draft"
					| "approved"
					| "ordered"
					| "partially_received"
					| "received"
					| "cancelled",
			),
		);
	}
	if (from) {
		conditions.push(gte(purchaseOrders.createdAt, from));
	}
	if (to) {
		conditions.push(lte(purchaseOrders.createdAt, to));
	}
	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(purchaseOrders.branchId, accessibleNodeIds));
	}

	const query = tenantDb
		.select()
		.from(purchaseOrders)
		.orderBy(desc(purchaseOrders.createdAt))
		.limit(limit)
		.offset(offset);

	if (conditions.length > 0) {
		return query.where(and(...conditions));
	}

	return query;
}

export async function getPurchaseOrderById(tenantDb: TenantDb, id: string) {
	const order = await tenantDb
		.select()
		.from(purchaseOrders)
		.where(eq(purchaseOrders.id, id))
		.then((rows) => rows[0]);

	if (!order) {
		return undefined;
	}

	const items = await tenantDb
		.select()
		.from(purchaseOrderItems)
		.where(eq(purchaseOrderItems.purchaseOrderId, id));

	return { order, items };
}

export async function createPurchaseOrder(
	tenantDb: TenantDb,
	data: CreatePurchaseOrderParams,
) {
	return tenantDb.transaction(async (tx) => {
		const purchaseOrderNumber = await generatePONumber(
			tx as unknown as TenantDb,
		);

		const itemsWithTotal = data.items.map((item) => ({
			...item,
			totalCost: item.orderedQty * item.unitCost,
		}));

		const subtotalAmount = itemsWithTotal.reduce(
			(sum, item) => sum + item.totalCost,
			0,
		);

		const [order] = await tx
			.insert(purchaseOrders)
			.values({
				purchaseOrderNumber,
				supplierId: data.supplierId,
				branchId: data.branchId,
				status: "draft",
				orderDate: data.orderDate,
				expectedDeliveryDate: data.expectedDeliveryDate,
				notes: data.notes,
				createdBy: data.createdBy,
				subtotal: subtotalAmount,
				totalAmount: subtotalAmount,
			})
			.returning();

		if (!order) {
			throw new Error("Failed to create purchase order");
		}

		await tx.insert(purchaseOrderItems).values(
			itemsWithTotal.map((item) => ({
				purchaseOrderId: order.id,
				productId: item.productId,
				orderedQty: item.orderedQty,
				unitCost: item.unitCost,
				totalCost: item.totalCost,
			})),
		);

		return order;
	});
}

export async function approvePurchaseOrder(
	tenantDb: TenantDb,
	id: string,
	approvedBy: string,
) {
	const existing = await tenantDb
		.select()
		.from(purchaseOrders)
		.where(eq(purchaseOrders.id, id))
		.then((rows) => rows[0]);

	if (!existing) {
		throw new Error("Purchase order not found");
	}

	if (existing.status !== "draft") {
		throw new Error("Only draft purchase orders can be approved");
	}

	const [updated] = await tenantDb
		.update(purchaseOrders)
		.set({
			status: "approved",
			approvedBy,
			approvedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(purchaseOrders.id, id))
		.returning();

	return updated;
}

export async function receiveItems(
	tenantDb: TenantDb,
	purchaseOrderId: string,
	receivedItems: Array<{ itemId: string; receivedQty: number }>,
) {
	return tenantDb.transaction(async (tx) => {
		for (const item of receivedItems) {
			await tx
				.update(purchaseOrderItems)
				.set({
					receivedQty: sql`${purchaseOrderItems.receivedQty} + ${item.receivedQty}`,
				})
				.where(eq(purchaseOrderItems.id, item.itemId));
		}

		const allItems = await tx
			.select()
			.from(purchaseOrderItems)
			.where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));

		const allFullyReceived = allItems.every(
			(item) => item.receivedQty >= item.orderedQty,
		);
		const anyReceived = allItems.some((item) => item.receivedQty > 0);

		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (allFullyReceived) {
			updateData.status = "received";
			updateData.receivedAt = new Date();
		} else if (anyReceived) {
			updateData.status = "partially_received";
		}

		const [updated] = await tx
			.update(purchaseOrders)
			.set(updateData)
			.where(eq(purchaseOrders.id, purchaseOrderId))
			.returning();

		return updated;
	});
}

export async function cancelPurchaseOrder(tenantDb: TenantDb, id: string) {
	// Phase 8.9: wrap SELECT + UPDATE in a single transaction with a row lock.
	// The function is functionally idempotent without this (both concurrent
	// callers would set status='cancelled'), but Phase 8.4 will hook an
	// audit-log write into this handler; without a transaction the audit row
	// could be written for a mutation that ultimately fails.
	return tenantDb.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(purchaseOrders)
			.where(eq(purchaseOrders.id, id))
			.for("update");

		if (!existing) {
			throw new Error("Purchase order not found");
		}

		if (!["draft", "approved"].includes(existing.status)) {
			throw new Error(
				"Only draft or approved purchase orders can be cancelled",
			);
		}

		const [updated] = await tx
			.update(purchaseOrders)
			.set({
				status: "cancelled",
				updatedAt: new Date(),
			})
			.where(eq(purchaseOrders.id, id))
			.returning();

		return updated;
	});
}
