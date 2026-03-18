import { eq, and, desc, count, sql } from "drizzle-orm";
import { transferOrders } from "@avantej-core/db/schema/tenant/transfer-orders";
import { transferOrderItems } from "@avantej-core/db/schema/tenant/transfer-order-items";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { adjustStock } from "./products.service";

export type CreateTransferOrderParams = {
	dateIssued: Date;
	fromBranchId: string;
	toBranchId: string;
	issuedByMemberId: string;
	notes?: string;
	items: { productId: string; quantityTransferred: number; notes?: string }[];
};

export type TransferOrderWithItems = (typeof transferOrders.$inferSelect) & {
	items: (typeof transferOrderItems.$inferSelect)[];
};

function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

async function generateTransferNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const prefix = `TO-${datePart}-`;

	const result = await tenantDb
		.select({ total: count() })
		.from(transferOrders)
		.where(sql`${transferOrders.transferNumber} LIKE ${prefix + "%"}`);

	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function listTransferOrders(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		status?: string;
		fromBranchId?: string;
		toBranchId?: string;
		accessibleNodeIds?: string[];
	} = {}
): Promise<(typeof transferOrders.$inferSelect)[]> {
	const { status, fromBranchId, toBranchId, accessibleNodeIds } = params;

	const conditions = [];
	if (status) {
		conditions.push(eq(transferOrders.status, status));
	}
	if (fromBranchId) {
		conditions.push(eq(transferOrders.fromBranchId, fromBranchId));
	}
	if (toBranchId) {
		conditions.push(eq(transferOrders.toBranchId, toBranchId));
	}

	const rows = await tenantDb.query.transferOrders.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(transferOrders.dateIssued)],
	});

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		return rows.filter(
			(row) =>
				accessibleNodeIds.includes(row.fromBranchId) ||
				accessibleNodeIds.includes(row.toBranchId)
		);
	}

	return rows;
}

export async function getTransferOrderById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<TransferOrderWithItems | null> {
	const row = await tenantDb.query.transferOrders.findFirst({
		where: eq(transferOrders.id, id),
	});

	if (!row) {
		return null;
	}

	const items = await tenantDb.query.transferOrderItems.findMany({
		where: eq(transferOrderItems.transferOrderId, id),
	});

	return { ...row, items };
}

export async function createTransferOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateTransferOrderParams
): Promise<TransferOrderWithItems> {
	const transferNumber = await generateTransferNumber(tenantDb, params.dateIssued);

	return tenantDb.transaction(async (tx) => {
		const [header] = await tx
			.insert(transferOrders)
			.values({
				transferNumber,
				dateIssued: params.dateIssued,
				fromBranchId: params.fromBranchId,
				toBranchId: params.toBranchId,
				issuedByMemberId: params.issuedByMemberId,
				status: "pending",
				notes: params.notes ?? null,
			})
			.returning();

		if (!header) {
			throw new Error("Failed to create transfer order");
		}

		const itemRows = await tx
			.insert(transferOrderItems)
			.values(
				params.items.map((item) => ({
					transferOrderId: header.id,
					productId: item.productId,
					quantityTransferred: item.quantityTransferred,
					quantityReceived: 0,
					notes: item.notes ?? null,
				}))
			)
			.returning();

		return { ...header, items: itemRows };
	});
}

export async function markInTransit(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<typeof transferOrders.$inferSelect> {
	const [row] = await tenantDb
		.update(transferOrders)
		.set({ status: "in_transit", updatedAt: new Date() })
		.where(eq(transferOrders.id, id))
		.returning();

	if (!row) {
		throw new Error("Transfer order not found");
	}
	return row;
}

export async function completeTransfer(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	items: { itemId: string; quantityReceived: number }[]
): Promise<typeof transferOrders.$inferSelect> {
	const transfer = await getTransferOrderById(tenantDb, id);
	if (!transfer) {
		throw new Error("Transfer order not found");
	}

	return tenantDb.transaction(async (tx) => {
		for (const item of items) {
			await tx
				.update(transferOrderItems)
				.set({ quantityReceived: item.quantityReceived })
				.where(eq(transferOrderItems.id, item.itemId));
		}

		// Adjust stock: deduct from source, add to destination
		for (const item of items) {
			const transferItem = transfer.items.find((i) => i.id === item.itemId);
			if (transferItem) {
				await adjustStock(
					tx as unknown as NeonDatabase<typeof tenantSchema>,
					transferItem.productId,
					transfer.fromBranchId,
					-transferItem.quantityTransferred
				);
				await adjustStock(
					tx as unknown as NeonDatabase<typeof tenantSchema>,
					transferItem.productId,
					transfer.toBranchId,
					item.quantityReceived
				);
			}
		}

		const [updated] = await tx
			.update(transferOrders)
			.set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
			.where(eq(transferOrders.id, id))
			.returning();

		if (!updated) {
			throw new Error("Failed to update transfer order status");
		}
		return updated;
	});
}

export async function cancelTransfer(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<typeof transferOrders.$inferSelect> {
	const [row] = await tenantDb
		.update(transferOrders)
		.set({ status: "cancelled", updatedAt: new Date() })
		.where(eq(transferOrders.id, id))
		.returning();

	if (!row) {
		throw new Error("Transfer order not found");
	}
	return row;
}
