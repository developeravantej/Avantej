import type { ReceiptData } from "@/components/pos/receipt-view";

type ReceiptApiResponse = {
	order: {
		salesOrderNumber: string;
		date: Date | string | null;
		customerType: string | null;
		customerName: string | null;
		totalAmount: number | null;
	};
	items: Array<{
		description: string | null;
		serviceName?: string | null;
		quantity: number;
		unitPrice: number;
		totalPrice: number;
	}>;
	payment: {
		paymentMethod: string;
		amount: number | null;
		taxAmount: number | null;
		totalAmount: number | null;
	} | null;
	invoice: { invoiceNumber: string } | null;
};

export function mapReceiptResponse(raw: unknown): ReceiptData {
	const r = raw as ReceiptApiResponse;
	const order = r.order;
	const subtotal = r.items.reduce((s, it) => s + (it.totalPrice ?? 0), 0);
	const tax = r.payment?.taxAmount ?? 0;
	const total = r.payment?.totalAmount ?? order.totalAmount ?? subtotal + tax;
	const method = (r.payment?.paymentMethod ??
		"cash") as ReceiptData["paymentMethod"];
	return {
		salesOrderNumber: order.salesOrderNumber,
		invoiceNumber: r.invoice?.invoiceNumber ?? "—",
		date: order.date ?? new Date(),
		customerName: order.customerName ?? "—",
		customerType: (order.customerType as "member" | "walk_in") ?? "member",
		items: r.items.map((it) => ({
			description: it.description ?? it.serviceName ?? "Item",
			quantity: it.quantity,
			unitPriceCents: it.unitPrice,
		})),
		subtotalCents: subtotal,
		discountCents: 0,
		taxCents: tax,
		totalCents: total,
		paymentMethod: method,
	};
}
