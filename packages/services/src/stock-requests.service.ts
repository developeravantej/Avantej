import { eq, and, desc, count, sql } from "drizzle-orm";
import { stockRequests } from "@avantej-core/db/schema/tenant/stock-requests";
import { stockRequestItems } from "@avantej-core/db/schema/tenant/stock-request-items";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { adjustStock } from "./products.service";

export type CreateStockRequestParams = {
	dateIssued: Date;
	issuedByMemberId: string;
	fromBranchId?: string;
	toBranchId: string;
	destinationLabel?: string;
	notes?: string;
	items: { productId: string; quantityRequested: number; notes?: string }[];
};

function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

async function generateRequestNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const prefix = `SR-${datePart}-`;

	const result = await tenantDb
		.select({ total: count() })
		.from(stockRequests)
		.where(sql`${stockRequests.requestNumber} LIKE ${prefix + "%"}`);

	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

export type StockRequestWithItems = (typeof stockRequests.$inferSelect) & {
	items: (typeof stockRequestItems.$inferSelect)[];
};

export async function listStockRequests(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		status?: string;
		fromBranchId?: string;
		toBranchId?: string;
		accessibleNodeIds?: string[];
	} = {}
): Promise<(typeof stockRequests.$inferSelect)[]> {
	const { status, fromBranchId, toBranchId, accessibleNodeIds } = params;

	const conditions = [];
	if (status) {
		conditions.push(eq(stockRequests.status, status));
	}
	if (fromBranchId) {
		conditions.push(eq(stockRequests.fromBranchId, fromBranchId));
	}
	if (toBranchId) {
		conditions.push(eq(stockRequests.toBranchId, toBranchId));
	}

	const rows = await tenantDb.query.stockRequests.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(stockRequests.dateIssued)],
	});

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		return rows.filter((row) => accessibleNodeIds.includes(row.toBranchId));
	}

	return rows;
}

export async function getStockRequestById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<StockRequestWithItems | null> {
	const row = await tenantDb.query.stockRequests.findFirst({
		where: eq(stockRequests.id, id),
	});

	if (!row) {
		return null;
	}

	const items = await tenantDb.query.stockRequestItems.findMany({
		where: eq(stockRequestItems.stockRequestId, id),
	});

	return { ...row, items };
}

export async function createStockRequest(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateStockRequestParams
): Promise<StockRequestWithItems> {
	const requestNumber = await generateRequestNumber(tenantDb, params.dateIssued);

	return tenantDb.transaction(async (tx) => {
		const [header] = await tx
			.insert(stockRequests)
			.values({
				requestNumber,
				dateIssued: params.dateIssued,
				issuedByMemberId: params.issuedByMemberId,
				fromBranchId: params.fromBranchId ?? null,
				toBranchId: params.toBranchId,
				destinationLabel: params.destinationLabel ?? null,
				status: "pending",
				notes: params.notes ?? null,
			})
			.returning();

		if (!header) {
			throw new Error("Failed to create stock request");
		}

		const itemRows = await tx
			.insert(stockRequestItems)
			.values(
				params.items.map((item) => ({
					stockRequestId: header.id,
					productId: item.productId,
					quantityRequested: item.quantityRequested,
					quantityFulfilled: 0,
					notes: item.notes ?? null,
				}))
			)
			.returning();

		return { ...header, items: itemRows };
	});
}

export async function approveStockRequest(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<typeof stockRequests.$inferSelect> {
	const [row] = await tenantDb
		.update(stockRequests)
		.set({ status: "approved", updatedAt: new Date() })
		.where(eq(stockRequests.id, id))
		.returning();

	if (!row) {
		throw new Error("Stock request not found");
	}
	return row;
}

export async function fulfillStockRequest(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	items: { itemId: string; quantityFulfilled: number }[]
): Promise<typeof stockRequests.$inferSelect> {
	const request = await getStockRequestById(tenantDb, id);
	if (!request) {
		throw new Error("Stock request not found");
	}

	return tenantDb.transaction(async (tx) => {
		for (const item of items) {
			await tx
				.update(stockRequestItems)
				.set({ quantityFulfilled: item.quantityFulfilled })
				.where(eq(stockRequestItems.id, item.itemId));
		}

		// Adjust stock: deduct from fromBranch, add to toBranch
		if (request.fromBranchId) {
			for (const item of items) {
				const requestItem = request.items.find((i) => i.id === item.itemId);
				if (requestItem) {
					await adjustStock(tx as unknown as NeonDatabase<typeof tenantSchema>, requestItem.productId, request.fromBranchId!, -item.quantityFulfilled);
					await adjustStock(tx as unknown as NeonDatabase<typeof tenantSchema>, requestItem.productId, request.toBranchId, item.quantityFulfilled);
				}
			}
		} else {
			for (const item of items) {
				const requestItem = request.items.find((i) => i.id === item.itemId);
				if (requestItem) {
					await adjustStock(tx as unknown as NeonDatabase<typeof tenantSchema>, requestItem.productId, request.toBranchId, item.quantityFulfilled);
				}
			}
		}

		const [updated] = await tx
			.update(stockRequests)
			.set({ status: "fulfilled", updatedAt: new Date() })
			.where(eq(stockRequests.id, id))
			.returning();

		if (!updated) {
			throw new Error("Failed to update stock request status");
		}
		return updated;
	});
}

export async function rejectStockRequest(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<typeof stockRequests.$inferSelect> {
	const [row] = await tenantDb
		.update(stockRequests)
		.set({ status: "rejected", updatedAt: new Date() })
		.where(eq(stockRequests.id, id))
		.returning();

	if (!row) {
		throw new Error("Stock request not found");
	}
	return row;
}
