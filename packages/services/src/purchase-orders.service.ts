import { eq, and, desc, inArray, sql, count, gte, lte } from "drizzle-orm";
import {
	purchaseOrders,
	purchaseOrderItems,
} from "@avantej-core/db/schema/tenant/purchase-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";

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

export interface PurchaseOrderActor {
	userId: string;
	memberId: string;
	role: string;
	branchId?: string;
}

export async function approvePurchaseOrder(
	tenantDb: TenantDb,
	id: string,
	actor: PurchaseOrderActor,
) {
	// Phase 8.4 audit wiring — same shape as refunds: wrap mutation + audit
	// write in a single transaction so the audit row rolls back if the
	// status change fails. Row lock prevents concurrent re-approval.
	return tenantDb.transaction(async (tx) => {
		const [existing] = await tx
			.select()
			.from(purchaseOrders)
			.where(eq(purchaseOrders.id, id))
			.for("update");

		if (!existing) {
			throw new Error("Purchase order not found");
		}

		if (existing.status !== "draft") {
			throw new Error("Only draft purchase orders can be approved");
		}

		const [updated] = await tx
			.update(purchaseOrders)
			.set({
				status: "approved",
				approvedBy: actor.userId,
				approvedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(purchaseOrders.id, id))
			.returning();

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "purchase_order.approve",
			entityType: "purchase_order",
			entityId: id,
			branchId: actor.branchId,
			summary: `Approved purchase order ${existing.purchaseOrderNumber} — ${(existing.totalAmount / 100).toFixed(2)} MYR`,
			changes: {
				from: { status: existing.status },
				to: { status: "approved" },
			},
		});

		return updated;
	});
}

export async function receiveItems(
	tenantDb: TenantDb,
	purchaseOrderId: string,
	receivedItems: Array<{ itemId: string; receivedQty: number }>,
) {
	if (receivedItems.length === 0) {
		throw new Error("receivedItems must not be empty");
	}

	return tenantDb.transaction(async (tx) => {
		// IW-06 (mirrors IW-05 createReceipt precondition pattern):
		// 1. Row-lock the PO to prevent concurrent receipt races.
		const [po] = await tx
			.select()
			.from(purchaseOrders)
			.where(eq(purchaseOrders.id, purchaseOrderId))
			.for("update");

		if (!po) {
			throw new Error(`Purchase order ${purchaseOrderId} not found`);
		}

		// 2. Status guard: only receive items on approved / ordered / partially-received POs.
		const allowedStatuses = ["approved", "ordered", "partially_received"];
		if (!allowedStatuses.includes(po.status)) {
			throw new Error(
				`Cannot receive items on a purchase order with status "${po.status}". ` +
					`Allowed statuses: ${allowedStatuses.join(", ")}.`,
			);
		}

		// 3. Fetch all PO items and build an allowed-item set for scope validation.
		const existingItems = await tx
			.select()
			.from(purchaseOrderItems)
			.where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));

		const legalItemIds = new Set(existingItems.map((i) => i.id));

		// Validate every input item belongs to this PO (reject cross-PO mixing).
		for (const item of receivedItems) {
			if (!legalItemIds.has(item.itemId)) {
				throw new Error(
					`Item ${item.itemId} does not belong to purchase order ${purchaseOrderId}`,
				);
			}
		}

		// 4. Apply over-receipt clamp and update receivedQty with scoped WHERE clause.
		const itemMap = new Map(existingItems.map((i) => [i.id, i]));

		for (const item of receivedItems) {
			const existing = itemMap.get(item.itemId)!;
			const remaining = existing.orderedQty - existing.receivedQty;
			const clampedQty = Math.min(item.receivedQty, remaining);

			if (clampedQty <= 0) {
				// Already fully received — skip silently (idempotent).
				continue;
			}

			// Scope the UPDATE to both id AND purchaseOrderId for safety.
			await tx
				.update(purchaseOrderItems)
				.set({
					receivedQty: sql`${purchaseOrderItems.receivedQty} + ${clampedQty}`,
				})
				.where(
					and(
						eq(purchaseOrderItems.id, item.itemId),
						eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId),
					),
				);

			// Sync the in-memory map so status rollup below is accurate.
			existing.receivedQty += clampedQty;
		}

		// 5. Roll PO status based on updated totals (re-read from memory map after clamp).
		const allFullyReceived = existingItems.every(
			(item) => item.receivedQty >= item.orderedQty,
		);
		const anyReceived = existingItems.some((item) => item.receivedQty > 0);

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

export async function cancelPurchaseOrder(
	tenantDb: TenantDb,
	id: string,
	actor: PurchaseOrderActor,
) {
	// Phase 8.9 added the transaction + row lock; 8.4 adds the audit write.
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

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "purchase_order.cancel",
			entityType: "purchase_order",
			entityId: id,
			branchId: actor.branchId,
			summary: `Cancelled purchase order ${existing.purchaseOrderNumber} — ${(existing.totalAmount / 100).toFixed(2)} MYR`,
			changes: {
				from: { status: existing.status },
				to: { status: "cancelled" },
			},
		});

		return updated;
	});
}
