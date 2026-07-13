import { asc, eq, sql } from "drizzle-orm";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import {
	receipts,
	type ReceiptLine,
} from "@avantej-core/db/schema/tenant/receipts";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { formatDateYYYYMMDD } from "./invoice.service";

/**
 * Compose the receipt number from a date and a monotonic sequence value:
 * `RCP-YYYYMMDD-NNNNNN` — mirrors buildInvoiceNumber. Pure; the 6-digit pad is
 * a minimum width, not a cap.
 */
export function buildReceiptNumber(date: Date, seq: number): string {
	return `RCP-${formatDateYYYYMMDD(date)}-${String(seq).padStart(6, "0")}`;
}

async function generateReceiptNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date,
): Promise<string> {
	const result = await tenantDb.execute<{ seq: string }>(
		sql`SELECT nextval('tenant_receipt_seq') AS seq`,
	);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return buildReceiptNumber(date, seq);
}

type PaidInstallmentRow = {
	installmentNumber: number;
	amount: number;
	amountPaid: number;
	paidAt: Date | null;
	dueDate: Date;
	paymentMethod: string | null;
};

type PaymentRow = {
	paymentNumber: string | null;
	paymentMethod: string | null;
	description: string | null;
	totalAmount: number;
	status: string;
	createdAt: Date;
};

/**
 * Build receipt lines for an invoice. When the invoice's sales order has paid
 * installments, the lines are the installments ONLY — the POS payment row's
 * totalAmount already IS installment #1 (recordSale collects dueNowCents and
 * auto-confirms installment 1), so including both would double-count it.
 * Non-installment sales use the linked payment row. Pure — unit-tested.
 */
export function buildReceiptLines(
	paidInstallments: PaidInstallmentRow[],
	payment: PaymentRow | null,
	totalInstallmentCount: number,
): ReceiptLine[] {
	if (paidInstallments.length > 0) {
		return paidInstallments.map((inst) => ({
			date: (inst.paidAt ?? inst.dueDate).toISOString(),
			method: inst.paymentMethod ?? "other",
			reference: `Installment ${inst.installmentNumber} of ${totalInstallmentCount}`,
			amountCents: inst.amountPaid > 0 ? inst.amountPaid : inst.amount,
		}));
	}
	// "succeeded" is the ONLY success value ever written to payments.status
	// (POS insert in pos.service.ts and the Stripe webhook flips both use it —
	// Stripe vocabulary; "paid"/"completed" belong to invoices/sales_orders).
	// If a new payments writer introduces another success spelling, add it here
	// or paid invoices will render as "no completed payment recorded".
	if (payment && payment.status === "succeeded") {
		return [
			{
				date: payment.createdAt.toISOString(),
				method: payment.paymentMethod ?? "other",
				reference: payment.paymentNumber ?? payment.description ?? "Payment",
				amountCents: payment.totalAmount,
			},
		];
	}
	return [];
}

function linesEqual(a: ReceiptLine[], b: ReceiptLine[]): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Get or issue the receipt for an invoice.
 *
 * Semantics: one receipt per invoice with a STABLE number. First call issues
 * it (nextval on tenant_receipt_seq). Later calls re-gather the paid lines
 * and, if the set changed (e.g. a later installment was confirmed), refresh
 * lines/totalAmount in place and bump updatedAt — the number never changes.
 *
 * Returns null when the invoice does not exist or has no recorded payment yet
 * (e.g. Stripe-pending sales) — a receipt with zero lines must not be issued.
 */
export async function getOrIssueReceiptForInvoice(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	invoiceId: string,
	actorUserId: string,
): Promise<typeof receipts.$inferSelect | null> {
	const invoice = await tenantDb.query.invoices.findFirst({
		where: eq(invoices.id, invoiceId),
	});
	if (!invoice) return null;

	// Gather paid installments via the sales order (nullable pre-0051 linkage
	// degrades to the payment row below — never throw on missing linkage).
	let paidInstallments: PaidInstallmentRow[] = [];
	let totalInstallmentCount = 0;
	let branchId: string | null = null;
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
		branchId = order?.branchId ?? null;
		totalInstallmentCount = allInstallments.length;
		paidInstallments = allInstallments
			.filter((i) => i.status === "paid")
			.map((i) => ({
				installmentNumber: i.installmentNumber,
				amount: i.amount,
				amountPaid: i.amountPaid,
				paidAt: i.paidAt,
				dueDate: i.dueDate,
				paymentMethod: i.paymentMethod,
			}));
	}

	const payment = invoice.paymentId
		? ((await tenantDb.query.payments.findFirst({
				where: eq(payments.id, invoice.paymentId),
			})) ?? null)
		: null;

	const lines = buildReceiptLines(
		paidInstallments,
		payment
			? {
					paymentNumber: payment.paymentNumber,
					paymentMethod: payment.paymentMethod,
					description: payment.description,
					totalAmount: payment.totalAmount,
					status: payment.status,
					createdAt: payment.createdAt,
				}
			: null,
		totalInstallmentCount,
	);
	if (lines.length === 0) return null;

	const totalAmount = lines.reduce((sum, l) => sum + l.amountCents, 0);

	const existing = await tenantDb.query.receipts.findFirst({
		where: eq(receipts.invoiceId, invoiceId),
	});

	if (existing) {
		if (
			linesEqual(existing.lines, lines) &&
			existing.totalAmount === totalAmount
		) {
			return existing;
		}
		const [updated] = await tenantDb
			.update(receipts)
			.set({ lines, totalAmount, updatedAt: new Date() })
			.where(eq(receipts.id, existing.id))
			.returning();
		return updated ?? existing;
	}

	const now = new Date();
	const receiptNumber = await generateReceiptNumber(tenantDb, now);
	// Two concurrent first-prints of the same invoice both pass the existence
	// check above; receipts_invoice_unique makes the second insert a no-op here
	// instead of a raw unique-violation 500 — the loser re-reads and returns the
	// winner's receipt (one burned sequence number, same stable RCP number).
	const [created] = await tenantDb
		.insert(receipts)
		.values({
			receiptNumber,
			invoiceId: invoice.id,
			invoiceNumber: invoice.invoiceNumber,
			branchId,
			date: now,
			customerId: invoice.customerId,
			customerName: invoice.customerName,
			totalAmount,
			lines,
			createdBy: actorUserId,
		})
		.onConflictDoNothing({ target: receipts.invoiceId })
		.returning();
	if (created) return created;

	const winner = await tenantDb.query.receipts.findFirst({
		where: eq(receipts.invoiceId, invoiceId),
	});
	if (!winner) throw new Error("Failed to create receipt");
	return winner;
}
