import { eq, and, asc, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
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
