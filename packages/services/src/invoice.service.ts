import { eq, and, asc, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { paymentItems } from "@avantej-core/db/schema/tenant/payment-items";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { resolveBranchCurrency } from "./currency.service";
import { nextBranchDocNumber } from "./numbering.service";

/**
 * The issuing branch's company/legal/tax profile for an invoice (WS3), plus
 * the branch's resolved currency (WS1). Printed on the invoice PDF. Null when
 * the invoice has no linked sales order (orphan/manual invoice → no branch).
 */
export type InvoiceBranchProfile = {
	branchNodeId: string;
	branchName: string | null;
	companyLegalName: string | null;
	registrationNumber: string | null;
	taxId: string | null;
	address: string | null;
	currency: string;
} | null;

/** An invoice plus its line-item breakdown (resolved from the linked payment). */
export type InvoiceWithItems = {
	invoice: typeof invoices.$inferSelect;
	items: (typeof paymentItems.$inferSelect)[];
	/** Issuing-branch company/tax profile (WS3); null for orphan invoices. */
	branch: InvoiceBranchProfile;
};

export type CreateInvoiceParams = {
	invoiceNumber?: string;
	salesOrderId?: string;
	paymentId?: string;
	/**
	 * WS3: when set and the branch has an invoice prefix configured, the
	 * invoice number is minted from the branch's gapless counter instead of
	 * the global sequence. Omitted → unchanged global-sequence behavior.
	 */
	branchNodeId?: string | null;
	date: Date;
	dueDate?: Date;
	customerId?: string;
	customerName: string;
	createdBy: string;
	paymentMode?: string;
	totalAmount: number;
	amountPaid?: number;
	status:
		| "draft"
		| "sent"
		| "paid"
		| "partially_paid"
		| "overdue"
		| "cancelled";
	eInvoiceStatus?: string;
	eInvoiceId?: string;
};

export type UpdateInvoiceParams = Partial<
	Omit<CreateInvoiceParams, "createdBy">
>;

/** Local-date → YYYYMMDD (zero-padded month/day). Pure. */
export function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

/**
 * Compose the invoice number from a date and a monotonic sequence value:
 * `INV-YYYYMMDD-NNNNNN`. The sequence comes from `nextval('tenant_invoice_seq')`
 * (collision-free); this just formats it. Pure — unit-tested. The 6-digit pad
 * is a minimum width, not a cap: a seq past 999999 grows rather than truncates.
 */
export function buildInvoiceNumber(date: Date, seq: number): string {
	return `INV-${formatDateYYYYMMDD(date)}-${String(seq).padStart(6, "0")}`;
}

async function generateInvoiceNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date,
): Promise<string> {
	const result = await tenantDb.execute<{ seq: string }>(
		sql`SELECT nextval('tenant_invoice_seq') AS seq`,
	);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return buildInvoiceNumber(date, seq);
}

export async function listInvoices(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		status?: string;
		customerId?: string;
		from?: Date;
		to?: Date;
		salesOrderId?: string;
		accessibleNodeIds?: string[];
	} = {},
): Promise<(typeof invoices.$inferSelect)[]> {
	const { status, customerId, from, to, salesOrderId, accessibleNodeIds } =
		params;

	// When accessibleNodeIds is provided, scope to invoices whose linked sales order
	// falls within the accessible branches. Invoices with no sales order (orphans) are
	// hidden from scoped staff — this is the safe default (no sales order = no branch
	// context to authorise against). Admins get accessibleNodeIds=undefined and bypass.
	if (accessibleNodeIds !== undefined && accessibleNodeIds.length > 0) {
		// JOIN through salesOrders to filter by branchId
		const invoiceConditions = [];
		if (status) invoiceConditions.push(eq(invoices.status, status));
		if (customerId) invoiceConditions.push(eq(invoices.customerId, customerId));
		if (from) invoiceConditions.push(gte(invoices.date, from));
		if (to) invoiceConditions.push(lte(invoices.date, to));
		if (salesOrderId)
			invoiceConditions.push(eq(invoices.salesOrderId, salesOrderId));
		invoiceConditions.push(inArray(salesOrders.branchId, accessibleNodeIds));

		return tenantDb
			.select({ invoice: invoices })
			.from(invoices)
			.innerJoin(salesOrders, eq(invoices.salesOrderId, salesOrders.id))
			.where(and(...invoiceConditions))
			.orderBy(desc(invoices.date))
			.then((rows) => rows.map((r) => r.invoice));
	}

	const conditions = [];
	if (status) {
		conditions.push(eq(invoices.status, status));
	}
	if (customerId) {
		conditions.push(eq(invoices.customerId, customerId));
	}
	if (from) {
		conditions.push(gte(invoices.date, from));
	}
	if (to) {
		conditions.push(lte(invoices.date, to));
	}
	if (salesOrderId) {
		conditions.push(eq(invoices.salesOrderId, salesOrderId));
	}

	return tenantDb.query.invoices.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(invoices.date)],
	});
}

export async function getInvoiceById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof invoices.$inferSelect | null> {
	const row = await tenantDb.query.invoices.findFirst({
		where: eq(invoices.id, id),
	});
	return row ?? null;
}

/**
 * Fetch an invoice together with its line items. Line items live on the linked
 * payment (`payment_items` keyed by `paymentId`), so an invoice with no payment
 * (e.g. a manual/draft invoice) resolves to an empty `items` array. Returns null
 * when the invoice id does not exist. Used by the invoice-PDF download flow.
 */
export async function getInvoiceWithItems(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<InvoiceWithItems | null> {
	const invoice = await getInvoiceById(tenantDb, id);
	if (!invoice) return null;

	const items = invoice.paymentId
		? await tenantDb.query.paymentItems.findMany({
				where: eq(paymentItems.paymentId, invoice.paymentId),
				orderBy: [asc(paymentItems.createdAt)],
			})
		: [];

	const branch = await resolveInvoiceBranchProfile(tenantDb, invoice);
	return { invoice, items, branch };
}

/**
 * Resolve the issuing-branch company/tax profile for an invoice. Branch is
 * reached via the linked sales order (invoices carry no branchId). Orphan
 * invoices (no sales order → no branch) return null. Null-safe throughout —
 * a branch with no branch_details row still returns a profile with the
 * resolved currency and null company fields.
 */
async function resolveInvoiceBranchProfile(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	invoice: typeof invoices.$inferSelect,
): Promise<InvoiceBranchProfile> {
	if (!invoice.salesOrderId) return null;

	const [order] = await tenantDb
		.select({ branchId: salesOrders.branchId })
		.from(salesOrders)
		.where(eq(salesOrders.id, invoice.salesOrderId))
		.limit(1);
	if (!order?.branchId) return null;

	const [node] = await tenantDb
		.select({ name: hierarchyNodes.name })
		.from(hierarchyNodes)
		.where(eq(hierarchyNodes.id, order.branchId))
		.limit(1);

	const [detail] = await tenantDb
		.select({
			companyLegalName: branchDetails.companyLegalName,
			registrationNumber: branchDetails.registrationNumber,
			taxId: branchDetails.taxId,
			address: branchDetails.address,
		})
		.from(branchDetails)
		.where(eq(branchDetails.nodeId, order.branchId))
		.limit(1);

	const currency = await resolveBranchCurrency(tenantDb, order.branchId);

	return {
		branchNodeId: order.branchId,
		branchName: node?.name ?? null,
		companyLegalName: detail?.companyLegalName ?? null,
		registrationNumber: detail?.registrationNumber ?? null,
		taxId: detail?.taxId ?? null,
		address: detail?.address ?? null,
		currency,
	};
}

/**
 * The payment_items snapshot split for the printable invoice document:
 * goods rows (package/booking/fee/product/…), the snapshotted `type='tax'`
 * rows, and `type='discount'` rows, plus the reconciliation guard.
 */
export type ClassifiedInvoiceItems = {
	goodsItems: (typeof paymentItems.$inferSelect)[];
	taxItems: (typeof paymentItems.$inferSelect)[];
	discountItems: (typeof paymentItems.$inferSelect)[];
	/** Σ goods totalPrice (pre-tax, pre-discount), in cents. */
	subtotalCents: number;
	/**
	 * True only when Σ ALL item totals === invoices.totalAmount (the POS
	 * convention: subtotal − discounts + tax = total). Manual/legacy invoices
	 * whose snapshot disagrees — or that have no items at all — do NOT
	 * reconcile, and the document must suppress the SST breakdown rather than
	 * print a fabricated tax split.
	 */
	reconciles: boolean;
};

/** Classify an invoice's payment_items snapshot. Pure — unit-tested. */
export function classifyInvoiceItems(
	items: (typeof paymentItems.$inferSelect)[],
	invoiceTotalCents: number,
): ClassifiedInvoiceItems {
	const goodsItems: (typeof paymentItems.$inferSelect)[] = [];
	const taxItems: (typeof paymentItems.$inferSelect)[] = [];
	const discountItems: (typeof paymentItems.$inferSelect)[] = [];
	for (const item of items) {
		if (item.itemType === "tax") taxItems.push(item);
		else if (item.itemType === "discount") discountItems.push(item);
		else goodsItems.push(item);
	}
	const sumAll = items.reduce((s, i) => s + i.totalPrice, 0);
	return {
		goodsItems,
		taxItems,
		discountItems,
		subtotalCents: goodsItems.reduce((s, i) => s + i.totalPrice, 0),
		reconciles: items.length > 0 && sumAll === invoiceTotalCents,
	};
}

/**
 * Installment-plan balance summary for the printed document. For installment
 * sales, Paid to date / Balance due MUST come from here — the plan total
 * includes the installment premium, and invoice.amountPaid goes stale after
 * installment #1 by design (installment confirmations don't write it back).
 */
export type InvoiceInstallmentSummary = {
	/** Σ installment amounts — the premium-inclusive plan total, in cents. */
	planTotalCents: number;
	/** Σ paid installments (amountPaid, falling back to amount), in cents. */
	paidToDateCents: number;
	totalCount: number;
};

export type InvoicePrintView = ClassifiedInvoiceItems & {
	invoice: typeof invoices.$inferSelect;
	items: (typeof paymentItems.$inferSelect)[];
	/** Resolved via the linked sales order (invoices carry no branchId). */
	branchId: string | null;
	salesOrder: typeof salesOrders.$inferSelect | null;
	/** Null for non-installment sales. */
	installmentSummary: InvoiceInstallmentSummary | null;
};

/**
 * Everything the branded, printable invoice document needs from the tenant DB
 * in one call: the invoice, its classified payment_items snapshot, the linked
 * sales order (branch scope + customerType), and the installment summary.
 * Identity/branch-display/customer-contact blocks are resolved at the router
 * layer (they need the control-panel DB and R2). Null when the invoice id
 * does not exist.
 */
export async function getInvoicePrintView(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<InvoicePrintView | null> {
	const invoice = await getInvoiceById(tenantDb, id);
	if (!invoice) return null;

	const items = invoice.paymentId
		? await tenantDb.query.paymentItems.findMany({
				where: eq(paymentItems.paymentId, invoice.paymentId),
				orderBy: [asc(paymentItems.createdAt)],
			})
		: [];

	// Nullable pre-0051 linkage degrades gracefully: no sales order → no branch
	// scope and no installment summary, never a throw.
	let salesOrder: typeof salesOrders.$inferSelect | null = null;
	let installmentSummary: InvoiceInstallmentSummary | null = null;
	if (invoice.salesOrderId) {
		const [order, allInstallments] = await Promise.all([
			tenantDb.query.salesOrders.findFirst({
				where: eq(salesOrders.id, invoice.salesOrderId),
			}),
			tenantDb.query.installments.findMany({
				where: eq(installments.salesOrderId, invoice.salesOrderId),
				orderBy: [asc(installments.installmentNumber)],
			}),
		]);
		salesOrder = order ?? null;
		if (allInstallments.length > 0) {
			installmentSummary = {
				planTotalCents: allInstallments.reduce((s, i) => s + i.amount, 0),
				paidToDateCents: allInstallments
					.filter((i) => i.status === "paid")
					.reduce(
						(s, i) => s + (i.amountPaid > 0 ? i.amountPaid : i.amount),
						0,
					),
				totalCount: allInstallments.length,
			};
		}
	}

	return {
		invoice,
		items,
		...classifyInvoiceItems(items, invoice.totalAmount),
		branchId: salesOrder?.branchId ?? null,
		salesOrder,
		installmentSummary,
	};
}

export async function createInvoice(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateInvoiceParams,
): Promise<typeof invoices.$inferSelect> {
	// WS3: prefer a caller-supplied number, else the branch's gapless counter
	// (when it has an invoice prefix), else the global sequence — unchanged for
	// callers that pass no branchNodeId.
	const invoiceNumber =
		params.invoiceNumber ??
		(await nextBranchDocNumber(tenantDb, params.branchNodeId, "invoice")) ??
		(await generateInvoiceNumber(tenantDb, params.date));

	const [row] = await tenantDb
		.insert(invoices)
		.values({
			invoiceNumber,
			salesOrderId: params.salesOrderId ?? null,
			paymentId: params.paymentId ?? null,
			date: params.date,
			dueDate: params.dueDate ?? null,
			customerId: params.customerId ?? null,
			customerName: params.customerName,
			createdBy: params.createdBy,
			paymentMode: params.paymentMode ?? null,
			totalAmount: params.totalAmount,
			amountPaid: params.amountPaid ?? 0,
			status: params.status,
			eInvoiceStatus: params.eInvoiceStatus ?? null,
			eInvoiceId: params.eInvoiceId ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create invoice");
	}
	return row;
}

export async function updateInvoice(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: UpdateInvoiceParams,
): Promise<typeof invoices.$inferSelect> {
	const [row] = await tenantDb
		.update(invoices)
		.set({
			...(params.invoiceNumber !== undefined && {
				invoiceNumber: params.invoiceNumber,
			}),
			...(params.salesOrderId !== undefined && {
				salesOrderId: params.salesOrderId,
			}),
			...(params.paymentId !== undefined && { paymentId: params.paymentId }),
			...(params.date !== undefined && { date: params.date }),
			...(params.dueDate !== undefined && { dueDate: params.dueDate }),
			...(params.customerId !== undefined && { customerId: params.customerId }),
			...(params.customerName !== undefined && {
				customerName: params.customerName,
			}),
			...(params.paymentMode !== undefined && {
				paymentMode: params.paymentMode,
			}),
			...(params.totalAmount !== undefined && {
				totalAmount: params.totalAmount,
			}),
			...(params.amountPaid !== undefined && { amountPaid: params.amountPaid }),
			...(params.status !== undefined && { status: params.status }),
			...(params.eInvoiceStatus !== undefined && {
				eInvoiceStatus: params.eInvoiceStatus,
			}),
			...(params.eInvoiceId !== undefined && { eInvoiceId: params.eInvoiceId }),
			updatedAt: new Date(),
		})
		.where(eq(invoices.id, id))
		.returning();

	if (!row) {
		throw new Error("Invoice not found");
	}
	return row;
}
