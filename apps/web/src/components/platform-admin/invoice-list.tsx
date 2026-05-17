/**
 * Platform Admin — Invoice list (Plan F.3-A).
 *
 * Renders a tenant's Stripe invoice history. Shows status, amount, refund
 * state, and per-row Refund button (super_admin only, paid + unrefunded).
 * Pagination via "Load more" using the parent-supplied nextCursor.
 */

import { ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export type Invoice = {
	id: string;
	number: string | null;
	status: string | null;
	amountPaid: number;
	amountDue: number;
	currency: string;
	createdAt: Date | string;
	hostedInvoiceUrl: string | null;
	invoicePdf: string | null;
	paymentIntent: string | null;
	refunded: boolean;
	refundedAmount: number;
};

function fmtMinor(amountMinor: number, currency: string) {
	return `${(amountMinor / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})} ${currency.toUpperCase()}`;
}

function statusVariant(
	status: string | null,
): "default" | "secondary" | "destructive" | "outline" {
	switch (status) {
		case "paid":
			return "default";
		case "open":
			return "outline";
		case "uncollectible":
		case "void":
			return "destructive";
		default:
			return "secondary";
	}
}

export function InvoiceList({
	invoices,
	onRefundClick,
	isSuperAdmin,
	onLoadMore,
	hasMore,
	isLoadingMore,
}: {
	invoices: Invoice[];
	onRefundClick: (invoice: Invoice) => void;
	isSuperAdmin: boolean;
	onLoadMore?: () => void;
	hasMore?: boolean;
	isLoadingMore?: boolean;
}) {
	if (invoices.length === 0) {
		return (
			<div
				className="text-sm text-muted-foreground p-4"
				data-testid="invoice-list-empty"
			>
				No invoices yet.
			</div>
		);
	}

	return (
		<div data-testid="invoice-list">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Invoice</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Date</TableHead>
						<TableHead className="text-right">Amount</TableHead>
						<TableHead>Refund</TableHead>
						<TableHead>Links</TableHead>
						{isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{invoices.map((inv) => {
						const fullyRefunded =
							inv.refunded && inv.refundedAmount >= inv.amountPaid;
						const partiallyRefunded =
							inv.refundedAmount > 0 && !fullyRefunded;
						const canRefund =
							inv.status === "paid" && !fullyRefunded && inv.paymentIntent;
						return (
							<TableRow key={inv.id} data-testid={`invoice-row-${inv.id}`}>
								<TableCell className="font-mono text-xs">
									{inv.number ?? inv.id}
								</TableCell>
								<TableCell>
									<Badge variant={statusVariant(inv.status)}>
										{inv.status ?? "—"}
									</Badge>
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{new Date(inv.createdAt).toLocaleDateString()}
								</TableCell>
								<TableCell className="text-right">
									{fmtMinor(inv.amountPaid, inv.currency)}
								</TableCell>
								<TableCell>
									{fullyRefunded ? (
										<Badge variant="destructive">refunded</Badge>
									) : partiallyRefunded ? (
										<Badge variant="secondary">
											partial · {fmtMinor(inv.refundedAmount, inv.currency)}
										</Badge>
									) : (
										<span className="text-xs text-muted-foreground">—</span>
									)}
								</TableCell>
								<TableCell className="text-xs">
									<div className="flex gap-2">
										{inv.hostedInvoiceUrl && (
											<a
												href={inv.hostedInvoiceUrl}
												target="_blank"
												rel="noreferrer"
												className="hover:underline inline-flex items-center gap-1"
											>
												view <ExternalLink className="h-3 w-3" />
											</a>
										)}
										{inv.invoicePdf && (
											<a
												href={inv.invoicePdf}
												target="_blank"
												rel="noreferrer"
												className="hover:underline inline-flex items-center gap-1"
											>
												<FileText className="h-3 w-3" /> pdf
											</a>
										)}
									</div>
								</TableCell>
								{isSuperAdmin && (
									<TableCell className="text-right">
										{canRefund ? (
											<Button
												size="sm"
												variant="destructive"
												onClick={() => onRefundClick(inv)}
												data-testid={`invoice-refund-btn-${inv.id}`}
											>
												Refund
											</Button>
										) : (
											<span className="text-xs text-muted-foreground">—</span>
										)}
									</TableCell>
								)}
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			{hasMore && onLoadMore && (
				<div className="flex justify-center p-3">
					<Button
						size="sm"
						variant="outline"
						onClick={onLoadMore}
						disabled={isLoadingMore}
						data-testid="invoice-list-load-more"
					>
						{isLoadingMore ? "Loading…" : "Load more"}
					</Button>
				</div>
			)}
		</div>
	);
}
