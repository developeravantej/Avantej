/**
 * Goods Receipt Service (Agent 2.11 — schema-relationship-fixes §8.5)
 *
 * 3-way match infrastructure: PO -> goods receipt -> supplier invoice.
 *
 * Lifecycle decisions (codified here for predictability):
 *   * createReceipt posts immediately (status='posted'). It is the canonical
 *     write-through path for inventory deltas — increments product_stock via
 *     ON CONFLICT, AND bumps purchase_order_items.receivedQty + PO status to
 *     keep the legacy receiveItems path in sync. Draft receipts are not
 *     supported at v1.
 *   * cancelReceipt reverses both: decrements stock and rolls back
 *     receivedQty / PO status. Only allowed from 'posted'.
 *   * markInvoiceMatched validates 3-way tolerance (PO ≈ receipt ≈ invoice).
 *
 * Receipt total is computed on demand by joining
 *   goods_receipt_items.quantityReceived * purchase_order_items.unitCost
 * (unit cost is frozen on the PO, not the product).
 */

import { and, desc, eq, inArray, sql, count } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	goodsReceipts,
	goodsReceiptItems,
	supplierInvoices,
	purchaseOrders,
	purchaseOrderItems,
	productStock,
} from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;

// Default tolerance for 3-way match (1% of PO total) measured in cents.
export const DEFAULT_MATCH_TOLERANCE_CENTS = 100;
export const DEFAULT_MATCH_TOLERANCE_BPS = 100; // 1.00%

async function generateReceiptNumber(tenantDb: TenantDb): Promise<string> {
	const now = new Date();
	const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
	const prefix = `GR-${datePart}-`;
	const result = await tenantDb
		.select({ total: count() })
		.from(goodsReceipts)
		.where(sql`${goodsReceipts.receiptNumber} LIKE ${prefix + "%"}`);
	const seq = (result[0]?.total ?? 0) + 1;
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

export type CreateReceiptItemInput = {
	purchaseOrderItemId: string;
	productId: string;
	quantityReceived: number;
	quantityDamaged?: number;
	notes?: string;
};

export type CreateReceiptParams = {
	purchaseOrderId: string;
	branchId: string;
	receivedAt: Date;
	receivedBy: string;
	notes?: string;
	items: CreateReceiptItemInput[];
};

/**
 * Post a goods receipt against a PO. In a single transaction:
 *   1. insert goods_receipts (status='posted')
 *   2. insert goods_receipt_items
 *   3. for each item: increment product_stock via ON CONFLICT
 *   4. for each item: bump purchase_order_items.received_qty
 *   5. roll PO status to partially_received / received based on totals
 */
export async function createReceipt(
	tenantDb: TenantDb,
	params: CreateReceiptParams,
) {
	if (params.items.length === 0) {
		throw new Error("Cannot create a receipt with zero items");
	}

	return tenantDb.transaction(async (tx) => {
		const receiptNumber = await generateReceiptNumber(tx as unknown as TenantDb);

		const [receipt] = await tx
			.insert(goodsReceipts)
			.values({
				receiptNumber,
				purchaseOrderId: params.purchaseOrderId,
				branchId: params.branchId,
				receivedAt: params.receivedAt,
				receivedBy: params.receivedBy,
				status: "posted",
				notes: params.notes,
			})
			.returning();

		if (!receipt) throw new Error("Failed to create goods receipt");

		await tx.insert(goodsReceiptItems).values(
			params.items.map((it) => ({
				goodsReceiptId: receipt.id,
				purchaseOrderItemId: it.purchaseOrderItemId,
				productId: it.productId,
				quantityReceived: it.quantityReceived,
				quantityDamaged: it.quantityDamaged ?? 0,
				notes: it.notes,
			})),
		);

		// Stock write-through. Damaged units do NOT enter sellable stock.
		for (const it of params.items) {
			const sellable = it.quantityReceived - (it.quantityDamaged ?? 0);
			if (sellable <= 0) continue;
			await tx
				.insert(productStock)
				.values({
					productId: it.productId,
					branchId: params.branchId,
					quantity: sellable,
				})
				.onConflictDoUpdate({
					target: [productStock.productId, productStock.branchId],
					set: {
						quantity: sql`${productStock.quantity} + ${sellable}`,
						updatedAt: new Date(),
					},
				});
		}

		// Bump PO item received_qty (keep legacy receiveItems path in sync).
		for (const it of params.items) {
			await tx
				.update(purchaseOrderItems)
				.set({
					receivedQty: sql`${purchaseOrderItems.receivedQty} + ${it.quantityReceived}`,
				})
				.where(eq(purchaseOrderItems.id, it.purchaseOrderItemId));
		}

		// Roll PO status.
		const allItems = await tx
			.select()
			.from(purchaseOrderItems)
			.where(eq(purchaseOrderItems.purchaseOrderId, params.purchaseOrderId));

		const allFull = allItems.every((i) => i.receivedQty >= i.orderedQty);
		const anyReceived = allItems.some((i) => i.receivedQty > 0);

		const poUpdate: Record<string, unknown> = { updatedAt: new Date() };
		if (allFull) {
			poUpdate.status = "received";
			poUpdate.receivedAt = new Date();
		} else if (anyReceived) {
			poUpdate.status = "partially_received";
		}
		await tx
			.update(purchaseOrders)
			.set(poUpdate)
			.where(eq(purchaseOrders.id, params.purchaseOrderId));

		return receipt;
	});
}

/**
 * Cancel a posted receipt. Reverses stock and PO receivedQty in a single
 * transaction. Only allowed from 'posted'.
 */
export async function cancelReceipt(tenantDb: TenantDb, receiptId: string) {
	return tenantDb.transaction(async (tx) => {
		const receipt = await tx
			.select()
			.from(goodsReceipts)
			.where(eq(goodsReceipts.id, receiptId))
			.then((r) => r[0]);
		if (!receipt) throw new Error("Goods receipt not found");
		if (receipt.status !== "posted") {
			throw new Error("Only posted receipts can be cancelled");
		}

		const items = await tx
			.select()
			.from(goodsReceiptItems)
			.where(eq(goodsReceiptItems.goodsReceiptId, receiptId));

		// Reverse stock.
		for (const it of items) {
			const sellable = it.quantityReceived - it.quantityDamaged;
			if (sellable <= 0) continue;
			await tx
				.update(productStock)
				.set({
					quantity: sql`${productStock.quantity} - ${sellable}`,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(productStock.productId, it.productId),
						eq(productStock.branchId, receipt.branchId),
					),
				);
		}

		// Roll back PO item received_qty.
		for (const it of items) {
			await tx
				.update(purchaseOrderItems)
				.set({
					receivedQty: sql`GREATEST(${purchaseOrderItems.receivedQty} - ${it.quantityReceived}, 0)`,
				})
				.where(eq(purchaseOrderItems.id, it.purchaseOrderItemId));
		}

		// Recompute PO status.
		const allItems = await tx
			.select()
			.from(purchaseOrderItems)
			.where(eq(purchaseOrderItems.purchaseOrderId, receipt.purchaseOrderId));
		const allFull = allItems.every((i) => i.receivedQty >= i.orderedQty);
		const anyReceived = allItems.some((i) => i.receivedQty > 0);
		const poUpdate: Record<string, unknown> = { updatedAt: new Date() };
		if (allFull) {
			poUpdate.status = "received";
		} else if (anyReceived) {
			poUpdate.status = "partially_received";
		} else {
			poUpdate.status = "approved";
			poUpdate.receivedAt = null;
		}
		await tx
			.update(purchaseOrders)
			.set(poUpdate)
			.where(eq(purchaseOrders.id, receipt.purchaseOrderId));

		const [updated] = await tx
			.update(goodsReceipts)
			.set({ status: "cancelled" })
			.where(eq(goodsReceipts.id, receiptId))
			.returning();

		return updated;
	});
}

export async function getReceiptById(tenantDb: TenantDb, receiptId: string) {
	const receipt = await tenantDb
		.select()
		.from(goodsReceipts)
		.where(eq(goodsReceipts.id, receiptId))
		.then((r) => r[0]);
	if (!receipt) return undefined;
	const items = await tenantDb
		.select()
		.from(goodsReceiptItems)
		.where(eq(goodsReceiptItems.goodsReceiptId, receiptId));
	return { receipt, items };
}

export async function listReceiptsForPo(
	tenantDb: TenantDb,
	purchaseOrderId: string,
) {
	return tenantDb
		.select()
		.from(goodsReceipts)
		.where(eq(goodsReceipts.purchaseOrderId, purchaseOrderId));
}

/**
 * Compute the financial total of a receipt by joining receipt items to
 * po_items.unit_cost. Damaged units count toward what was "received" from
 * the supplier — they're a quality issue, not a billing issue.
 */
export async function computeReceiptTotalCents(
	tenantDb: TenantDb,
	receiptId: string,
): Promise<number> {
	const rows = await tenantDb
		.select({
			qty: goodsReceiptItems.quantityReceived,
			unitCost: purchaseOrderItems.unitCost,
		})
		.from(goodsReceiptItems)
		.innerJoin(
			purchaseOrderItems,
			eq(goodsReceiptItems.purchaseOrderItemId, purchaseOrderItems.id),
		)
		.where(eq(goodsReceiptItems.goodsReceiptId, receiptId));

	return rows.reduce((sum, r) => sum + r.qty * r.unitCost, 0);
}

export type MarkInvoiceMatchedParams = {
	invoiceId: string;
	matchedBy: string;
	toleranceCents?: number;
};

/**
 * 3-way match: PO total ≈ receipt total ≈ invoice total within tolerance.
 *
 * Tolerance is the larger of `toleranceCents` (default 100¢) and 1% of the
 * PO total — handles small absolute numbers and large invoices alike.
 */
export async function markInvoiceMatched(
	tenantDb: TenantDb,
	params: MarkInvoiceMatchedParams,
) {
	const { invoiceId, matchedBy, toleranceCents } = params;

	const invoice = await tenantDb
		.select()
		.from(supplierInvoices)
		.where(eq(supplierInvoices.id, invoiceId))
		.then((r) => r[0]);
	if (!invoice) throw new Error("Supplier invoice not found");
	if (!["pending", "disputed"].includes(invoice.status)) {
		throw new Error("Only pending or disputed invoices can be matched");
	}
	if (!invoice.purchaseOrderId || !invoice.goodsReceiptId) {
		throw new Error(
			"3-way match requires both purchaseOrderId and goodsReceiptId on the invoice",
		);
	}

	const po = await tenantDb
		.select()
		.from(purchaseOrders)
		.where(eq(purchaseOrders.id, invoice.purchaseOrderId))
		.then((r) => r[0]);
	if (!po) throw new Error("Linked purchase order not found");

	const receiptTotal = await computeReceiptTotalCents(
		tenantDb,
		invoice.goodsReceiptId,
	);

	const tol = Math.max(
		toleranceCents ?? DEFAULT_MATCH_TOLERANCE_CENTS,
		Math.floor((po.totalAmount * DEFAULT_MATCH_TOLERANCE_BPS) / 10_000),
	);
	const within = (a: number, b: number) => Math.abs(a - b) <= tol;

	if (
		!within(po.totalAmount, receiptTotal) ||
		!within(po.totalAmount, invoice.totalCents) ||
		!within(receiptTotal, invoice.totalCents)
	) {
		throw new Error(
			`3-way match failed: PO=${po.totalAmount}, receipt=${receiptTotal}, invoice=${invoice.totalCents} (tolerance=${tol})`,
		);
	}

	const [updated] = await tenantDb
		.update(supplierInvoices)
		.set({
			status: "matched",
			matchedAt: new Date(),
			matchedBy,
		})
		.where(
			and(
				eq(supplierInvoices.id, invoiceId),
				inArray(supplierInvoices.status, ["pending", "disputed"]),
			),
		)
		.returning();

	if (!updated) throw new Error("Invoice status changed by another user (concurrent update)");
	return updated;
}

export type CreateSupplierInvoiceParams = {
	invoiceNumber: string;
	supplierId: string;
	purchaseOrderId?: string;
	goodsReceiptId?: string;
	totalCents: number;
	taxCents?: number;
	invoiceDate: Date;
	dueDate?: Date;
};

export async function createSupplierInvoice(
	tenantDb: TenantDb,
	params: CreateSupplierInvoiceParams,
) {
	const [row] = await tenantDb
		.insert(supplierInvoices)
		.values({
			invoiceNumber: params.invoiceNumber,
			supplierId: params.supplierId,
			purchaseOrderId: params.purchaseOrderId,
			goodsReceiptId: params.goodsReceiptId,
			totalCents: params.totalCents,
			taxCents: params.taxCents ?? 0,
			invoiceDate: params.invoiceDate,
			dueDate: params.dueDate,
			status: "pending",
		})
		.returning();
	return row;
}

export async function listSupplierInvoices(
	tenantDb: TenantDb,
	filters: {
		supplierId?: string;
		status?: string;
		purchaseOrderId?: string;
		limit?: number;
		offset?: number;
	} = {},
) {
	const conditions = [];
	if (filters.supplierId)
		conditions.push(eq(supplierInvoices.supplierId, filters.supplierId));
	if (filters.status)
		conditions.push(eq(supplierInvoices.status, filters.status));
	if (filters.purchaseOrderId)
		conditions.push(eq(supplierInvoices.purchaseOrderId, filters.purchaseOrderId));
	const limit = Math.min(filters.limit ?? 50, 200);
	const offset = filters.offset ?? 0;
	const q = tenantDb.select().from(supplierInvoices);
	const withWhere = conditions.length ? q.where(and(...conditions)) : q;
	return withWhere.orderBy(desc(supplierInvoices.createdAt)).limit(limit).offset(offset);
}

export type DisputeInvoiceParams = {
	invoiceId: string;
	disputeReason: string;
};

export async function disputeInvoice(
	tenantDb: TenantDb,
	params: DisputeInvoiceParams,
) {
	const invoice = await tenantDb
		.select()
		.from(supplierInvoices)
		.where(eq(supplierInvoices.id, params.invoiceId))
		.then((r) => r[0]);
	if (!invoice) throw new Error("Supplier invoice not found");
	if (!["pending", "matched"].includes(invoice.status)) {
		throw new Error("Only pending or matched invoices can be disputed");
	}

	const [updated] = await tenantDb
		.update(supplierInvoices)
		.set({
			status: "disputed",
			disputeReason: params.disputeReason,
			disputedAt: new Date(),
		})
		.where(
			and(
				eq(supplierInvoices.id, params.invoiceId),
				inArray(supplierInvoices.status, ["pending", "matched"]),
			),
		)
		.returning();

	if (!updated) throw new Error("Invoice status changed by another user (concurrent update) or invalid status");
	return updated;
}

export async function markInvoicePaid(
	tenantDb: TenantDb,
	invoiceId: string,
	paidBy: string,
	paymentReference?: string,
) {
	const invoice = await tenantDb
		.select()
		.from(supplierInvoices)
		.where(eq(supplierInvoices.id, invoiceId))
		.then((r) => r[0]);
	if (!invoice) throw new Error("Supplier invoice not found");
	if (invoice.status !== "matched") {
		throw new Error("Only matched invoices can be marked as paid");
	}

	const [updated] = await tenantDb
		.update(supplierInvoices)
		.set({
			status: "paid",
			paidAt: new Date(),
			paidBy,
			paymentReference: paymentReference ?? null,
		})
		.where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.status, "matched")))
		.returning();

	if (!updated) throw new Error("Invoice was already marked paid by another user (concurrent update)");
	return updated;
}

export type InvoicePreviewResult = {
	poTotalCents: number | null;
	receiptTotalCents: number | null;
	invoiceTotalCents: number;
	toleranceCents: number;
	isWithinTolerance: boolean;
	mismatches: string[];
};

export async function getInvoicePreview(
	tenantDb: TenantDb,
	invoiceId: string,
): Promise<InvoicePreviewResult> {
	const invoice = await tenantDb
		.select()
		.from(supplierInvoices)
		.where(eq(supplierInvoices.id, invoiceId))
		.then((r) => r[0]);
	if (!invoice) throw new Error("Supplier invoice not found");

	let poTotalCents: number | null = null;
	let receiptTotalCents: number | null = null;

	if (invoice.purchaseOrderId) {
		const po = await tenantDb
			.select({ totalAmount: purchaseOrders.totalAmount })
			.from(purchaseOrders)
			.where(eq(purchaseOrders.id, invoice.purchaseOrderId))
			.then((r) => r[0]);
		poTotalCents = po?.totalAmount ?? null;
	}

	if (invoice.goodsReceiptId) {
		receiptTotalCents = await computeReceiptTotalCents(tenantDb, invoice.goodsReceiptId);
	}

	const tol = Math.max(
		DEFAULT_MATCH_TOLERANCE_CENTS,
		poTotalCents !== null
			? Math.floor((poTotalCents * DEFAULT_MATCH_TOLERANCE_BPS) / 10_000)
			: 0,
	);

	const within = (a: number, b: number) => Math.abs(a - b) <= tol;
	const mismatches: string[] = [];

	if (poTotalCents !== null && receiptTotalCents !== null) {
		if (!within(poTotalCents, receiptTotalCents)) {
			mismatches.push(`PO (${poTotalCents}¢) vs Receipt (${receiptTotalCents}¢) differ by ${Math.abs(poTotalCents - receiptTotalCents)}¢`);
		}
		if (!within(poTotalCents, invoice.totalCents)) {
			mismatches.push(`PO (${poTotalCents}¢) vs Invoice (${invoice.totalCents}¢) differ by ${Math.abs(poTotalCents - invoice.totalCents)}¢`);
		}
		if (!within(receiptTotalCents, invoice.totalCents)) {
			mismatches.push(`Receipt (${receiptTotalCents}¢) vs Invoice (${invoice.totalCents}¢) differ by ${Math.abs(receiptTotalCents - invoice.totalCents)}¢`);
		}
	} else if (poTotalCents !== null) {
		if (!within(poTotalCents, invoice.totalCents)) {
			mismatches.push(`PO (${poTotalCents}¢) vs Invoice (${invoice.totalCents}¢) differ by ${Math.abs(poTotalCents - invoice.totalCents)}¢`);
		}
	} else if (receiptTotalCents !== null) {
		if (!within(receiptTotalCents, invoice.totalCents)) {
			mismatches.push(`Receipt (${receiptTotalCents}¢) vs Invoice (${invoice.totalCents}¢) differ by ${Math.abs(receiptTotalCents - invoice.totalCents)}¢`);
		}
	}

	return {
		poTotalCents,
		receiptTotalCents,
		invoiceTotalCents: invoice.totalCents,
		toleranceCents: tol,
		isWithinTolerance: mismatches.length === 0,
		mismatches,
	};
}
