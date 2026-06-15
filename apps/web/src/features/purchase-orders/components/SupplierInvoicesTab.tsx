import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { ColumnDef } from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { MatchReviewDialog } from "./MatchReviewDialog";
import { MarkPaidDialog } from "./MarkPaidDialog";

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "2-digit",
	});
}

export type SupplierInvoicesTabProps = {
	organizationId: string;
	canCreate: boolean;
	canUpdate: boolean;
};

export function SupplierInvoicesTab({
	organizationId,
	canCreate: _canCreate,
	canUpdate,
}: SupplierInvoicesTabProps) {
	const [reviewInvoiceId, setReviewInvoiceId] = useState<string | null>(null);
	const [paidInvoice, setPaidInvoice] = useState<{
		id: string;
		number: string;
	} | null>(null);
	const [statusFilter, setStatusFilter] = useState("");

	const {
		data: invoices = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		...orpc.goodsReceipts.listInvoices.queryOptions({
			input: { organizationId, status: statusFilter || undefined },
		}),
		enabled: !!organizationId,
	});

	const { data: suppliers = [] } = useQuery({
		...orpc.suppliers.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const supplierMap = useMemo(
		() => new Map(suppliers.map((s) => [s.id, s.name])),
		[suppliers],
	);

	type InvoiceRow = (typeof invoices)[number];

	const columns: ColumnDef<InvoiceRow>[] = [
		{
			id: "invoiceNumber",
			header: "Invoice #",
			accessorKey: "invoiceNumber",
			cell: ({ row }) => <CopyableCell value={row.original.invoiceNumber} />,
		},
		{
			id: "supplierId",
			header: "Supplier",
			accessorKey: "supplierId",
			cell: ({ row }) => (
				<span className="text-sm">
					{supplierMap.get(row.original.supplierId) ??
						row.original.supplierId.slice(0, 8) + "…"}
				</span>
			),
		},
		{
			id: "purchaseOrderId",
			header: "PO",
			accessorKey: "purchaseOrderId",
			cell: ({ row }) => (
				<span className="text-xs font-mono text-muted-foreground">
					{row.original.purchaseOrderId
						? row.original.purchaseOrderId.slice(0, 8) + "…"
						: "—"}
				</span>
			),
		},
		{
			id: "invoiceDate",
			header: "Invoice Date",
			accessorKey: "invoiceDate",
			cell: ({ row }) => (
				<span className="text-sm">{formatDate(row.original.invoiceDate)}</span>
			),
		},
		{
			id: "dueDate",
			header: "Due Date",
			accessorKey: "dueDate",
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.dueDate ? (
						formatDate(row.original.dueDate)
					) : (
						<span className="text-muted-foreground">-</span>
					)}
				</span>
			),
		},
		{
			id: "totalCents",
			header: "Amount (MYR)",
			accessorKey: "totalCents",
			cell: ({ row }) => (
				<span className="text-sm font-medium tabular-nums">
					{formatPrice(row.original.totalCents, "MYR")}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			accessorKey: "status",
			cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row }) => {
				const { id, status, invoiceNumber } = row.original;
				if (!canUpdate)
					return <span className="text-muted-foreground text-xs">-</span>;
				return (
					<div className="flex items-center gap-1.5">
						{(status === "pending" || status === "disputed") && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => setReviewInvoiceId(id)}
							>
								Review Match
							</Button>
						)}
						{status === "matched" && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => setPaidInvoice({ id, number: invoiceNumber })}
							>
								Mark Paid
							</Button>
						)}
					</div>
				);
			},
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<Select
					value={statusFilter}
					onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
				>
					<SelectTrigger className="w-40">
						<SelectValue placeholder="All statuses" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						<SelectItem value="pending">Pending</SelectItem>
						<SelectItem value="matched">Matched</SelectItem>
						<SelectItem value="disputed">Disputed</SelectItem>
						<SelectItem value="paid">Paid</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<DataTable<InvoiceRow, unknown>
				columns={columns}
				data={invoices}
				emptyTitle="No supplier invoices found"
				error={isError ? error : undefined}
				onRetry={() => refetch()}
			/>

			{isLoading && (
				<div className="flex justify-center py-6">
					<LoadingSpinner size="md" />
				</div>
			)}

			<MatchReviewDialog
				invoiceId={reviewInvoiceId}
				organizationId={organizationId}
				onClose={() => setReviewInvoiceId(null)}
				onAction={() => refetch()}
			/>

			{paidInvoice && (
				<MarkPaidDialog
					invoiceId={paidInvoice.id}
					invoiceNumber={paidInvoice.number}
					organizationId={organizationId}
					onClose={() => setPaidInvoice(null)}
					onDone={() => refetch()}
				/>
			)}
		</div>
	);
}
