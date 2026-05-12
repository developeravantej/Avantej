import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/money";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
	description: string;
	quantity: number;
	unitPriceCents: number;
}

export interface ReceiptData {
	salesOrderNumber: string;
	invoiceNumber: string;
	date: Date | string;
	customerName: string;
	customerType: "member" | "walk_in";
	items: ReceiptItem[];
	subtotalCents: number;
	discountCents: number;
	taxCents: number;
	totalCents: number;
	paymentMethod: "cash" | "card" | "bank_transfer";
	paymentReference?: string | null;
	amountTenderedCents?: number | null;
	changeDueCents?: number | null;
	branchName?: string | null;
	organizationName?: string | null;
}

// ─── Receipt view component ────────────────────────────────────────────────────

interface ReceiptViewProps {
	data: ReceiptData;
}

function formatPaymentMethod(m: string): string {
	const labels: Record<string, string> = {
		cash: "Cash",
		card: "Card",
		bank_transfer: "Bank Transfer",
	};
	return labels[m] ?? m;
}

function formatDate(d: Date | string): string {
	const date = d instanceof Date ? d : new Date(d);
	return date.toLocaleString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function ReceiptView({ data }: ReceiptViewProps) {
	return (
		<div
			className="receipt-view mx-auto max-w-sm space-y-4 bg-white p-6 font-mono text-foreground text-sm print:mx-0 print:max-w-none print:p-4 print:text-xs"
			style={{ minWidth: 260 }}
		>
			{/* Header */}
			<div className="space-y-1 text-center">
				{data.organizationName && (
					<p className="font-bold text-base uppercase">
						{data.organizationName}
					</p>
				)}
				{data.branchName && (
					<p className="text-muted-foreground text-xs">{data.branchName}</p>
				)}
				<p className="text-muted-foreground text-xs">{formatDate(data.date)}</p>
			</div>

			<Separator />

			{/* Order info */}
			<div className="space-y-0.5">
				<div className="flex justify-between gap-2">
					<span className="text-muted-foreground">Order</span>
					<span className="font-medium">{data.salesOrderNumber}</span>
				</div>
				<div className="flex justify-between gap-2">
					<span className="text-muted-foreground">Invoice</span>
					<span className="font-medium">{data.invoiceNumber}</span>
				</div>
				<div className="flex justify-between gap-2">
					<span className="text-muted-foreground">Customer</span>
					<span className="max-w-[160px] truncate font-medium">
						{data.customerName}
					</span>
				</div>
			</div>

			<Separator />

			{/* Line items */}
			<div className="space-y-1.5">
				{data.items.map((item, idx) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: receipt is static
					// react-doctor-disable-next-line react-doctor/no-array-index-as-key -- position-as-identity: receipt line items are immutable once printed
					<div key={idx} className="space-y-0.5">
						<p className="leading-snug">{item.description}</p>
						<div className="flex justify-between text-xs">
							<span className="text-muted-foreground">
								{item.quantity} × {formatPrice(item.unitPriceCents, "MYR")}
							</span>
							<span>
								{formatPrice(item.unitPriceCents * item.quantity, "MYR")}
							</span>
						</div>
					</div>
				))}
			</div>

			<Separator />

			{/* Totals */}
			<div className="space-y-1">
				<div className="flex justify-between">
					<span className="text-muted-foreground">Subtotal</span>
					<span>{formatPrice(data.subtotalCents, "MYR")}</span>
				</div>
				{data.discountCents > 0 && (
					<div className="flex justify-between text-green-700">
						<span>Discount</span>
						<span>−{formatPrice(data.discountCents, "MYR")}</span>
					</div>
				)}
				{data.taxCents > 0 && (
					<div className="flex justify-between">
						<span className="text-muted-foreground">Tax</span>
						<span>{formatPrice(data.taxCents, "MYR")}</span>
					</div>
				)}
				<div className="mt-1 flex justify-between border-t pt-1 font-bold text-base">
					<span>TOTAL</span>
					<span>{formatPrice(data.totalCents, "MYR")}</span>
				</div>
			</div>

			<Separator />

			{/* Payment details */}
			<div className="space-y-0.5">
				<div className="flex justify-between">
					<span className="text-muted-foreground">Payment</span>
					<span>{formatPaymentMethod(data.paymentMethod)}</span>
				</div>
				{data.paymentReference && (
					<div className="flex justify-between">
						<span className="text-muted-foreground">Ref</span>
						<span className="font-mono text-xs">{data.paymentReference}</span>
					</div>
				)}
				{data.paymentMethod === "cash" && data.amountTenderedCents != null && (
					<div className="flex justify-between">
						<span className="text-muted-foreground">Tendered</span>
						<span>{formatPrice(data.amountTenderedCents, "MYR")}</span>
					</div>
				)}
				{data.paymentMethod === "cash" &&
					data.changeDueCents != null &&
					data.changeDueCents > 0 && (
						<div className="flex justify-between font-medium">
							<span>Change</span>
							<span>{formatPrice(data.changeDueCents, "MYR")}</span>
						</div>
					)}
			</div>

			{/* Footer */}
			<div className="space-y-1 border-t pt-2 text-center text-muted-foreground text-xs">
				<p>Thank you for your purchase!</p>
				<p>Please retain this receipt for your records.</p>
			</div>
		</div>
	);
}
