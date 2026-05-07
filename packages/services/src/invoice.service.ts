import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type CreateInvoiceParams = {
	invoiceNumber?: string;
	salesOrderId?: string;
	paymentId?: string;
	date: Date;
	dueDate?: Date;
	customerId?: string;
	customerName: string;
	createdBy: string;
	paymentMode?: string;
	totalAmount: number;
	amountPaid?: number;
	status: "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled";
	eInvoiceStatus?: string;
	eInvoiceId?: string;
};

export type UpdateInvoiceParams = Partial<Omit<CreateInvoiceParams, "createdBy">>;

function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

async function generateInvoiceNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const result = await tenantDb.execute<{ seq: string }>(
		sql`SELECT nextval('tenant_invoice_seq') AS seq`
	);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return `INV-${datePart}-${String(seq).padStart(6, "0")}`;
}

export async function listInvoices(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { status?: string; customerId?: string; from?: Date; to?: Date; salesOrderId?: string; accessibleNodeIds?: string[] } = {}
): Promise<(typeof invoices.$inferSelect)[]> {
	const { status, customerId, from, to, salesOrderId, accessibleNodeIds } = params;

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
		if (salesOrderId) invoiceConditions.push(eq(invoices.salesOrderId, salesOrderId));
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
	id: string
): Promise<(typeof invoices.$inferSelect) | null> {
	const row = await tenantDb.query.invoices.findFirst({
		where: eq(invoices.id, id),
	});
	return row ?? null;
}

export async function createInvoice(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateInvoiceParams
): Promise<typeof invoices.$inferSelect> {
	const invoiceNumber = params.invoiceNumber ?? (await generateInvoiceNumber(tenantDb, params.date));

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
	params: UpdateInvoiceParams
): Promise<typeof invoices.$inferSelect> {
	const [row] = await tenantDb
		.update(invoices)
		.set({
			...(params.invoiceNumber !== undefined && { invoiceNumber: params.invoiceNumber }),
			...(params.salesOrderId !== undefined && { salesOrderId: params.salesOrderId }),
			...(params.paymentId !== undefined && { paymentId: params.paymentId }),
			...(params.date !== undefined && { date: params.date }),
			...(params.dueDate !== undefined && { dueDate: params.dueDate }),
			...(params.customerId !== undefined && { customerId: params.customerId }),
			...(params.customerName !== undefined && { customerName: params.customerName }),
			...(params.paymentMode !== undefined && { paymentMode: params.paymentMode }),
			...(params.totalAmount !== undefined && { totalAmount: params.totalAmount }),
			...(params.amountPaid !== undefined && { amountPaid: params.amountPaid }),
			...(params.status !== undefined && { status: params.status }),
			...(params.eInvoiceStatus !== undefined && { eInvoiceStatus: params.eInvoiceStatus }),
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
