import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PayoutListItem } from "../api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(date: Date | string | null | undefined): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	const diff = Date.now() - d.getTime();
	const days = Math.floor(diff / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

function formatPeriod(
	start: Date | string | null | undefined,
	end: Date | string | null | undefined,
): string {
	if (!start || !end) return "—";
	const fmt = (d: Date | string) =>
		new Date(d).toLocaleDateString("en-MY", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	return `${fmt(start)} – ${fmt(end)}`;
}

function paymentMethodLabel(method: string | undefined): string {
	if (!method) return "—";
	const labels: Record<string, string> = {
		bank_transfer: "Bank Transfer",
		manual_bank_transfer: "Bank Transfer",
		cash: "Cash",
		check: "Cheque",
		other: "Other",
	};
	return labels[method] ?? method;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
	const map: Record<string, { label: string; className: string }> = {
		pending: {
			label: "Pending",
			className: "bg-amber-50 text-amber-700 border-amber-200",
		},
		processing: {
			label: "Processing",
			className: "bg-blue-50 text-blue-700 border-blue-200",
		},
		paid: {
			label: "Paid",
			className: "bg-green-50 text-green-700 border-green-200",
		},
		failed: {
			label: "Failed",
			className: "bg-red-50 text-red-700 border-red-200",
		},
		canceled: {
			label: "Cancelled",
			className: "bg-muted text-muted-foreground border-border",
		},
	};
	const config = map[status] ?? {
		label: status,
		className: "bg-muted text-muted-foreground border-border",
	};
	return (
		<Badge
			variant="outline"
			className={cn("text-xs font-medium", config.className)}
		>
			{config.label}
		</Badge>
	);
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const columns: ColumnDef<PayoutListItem>[] = [
	{
		id: "staff",
		header: "Staff",
		cell: ({ row }) => (
			<span className="text-sm font-medium">{row.original.recipientName}</span>
		),
	},
	{
		id: "period",
		header: "Period",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatPeriod(row.original.periodStart, row.original.periodEnd)}
			</span>
		),
	},
	{
		id: "amount",
		header: "Amount",
		cell: ({ row }) => {
			const cents = row.original.amount;
			const isReversal = cents < 0;
			return (
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"text-sm font-semibold tabular-nums",
							isReversal ? "text-destructive" : "text-foreground",
						)}
					>
						{isReversal ? "-" : ""}
						{formatPrice(Math.abs(cents), "MYR")}
					</span>
					{isReversal && (
						<span
							title={
								row.original.appointmentId
									? `Clawback linked to refund on appointment #${row.original.appointmentId}`
									: "Commission reversal / clawback"
							}
						>
							<Badge variant="destructive" className="text-xs">
								Reversal
							</Badge>
						</span>
					)}
				</div>
			);
		},
	},
	{
		id: "method",
		header: "Method",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{paymentMethodLabel(row.original.paymentMethod)}
			</span>
		),
	},
	{
		id: "reference",
		header: "Reference",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground font-mono text-xs">
				{row.original.reference ?? "—"}
			</span>
		),
	},
	{
		id: "paidAt",
		header: "Paid",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatRelativeDate(row.original.paidAt)}
			</span>
		),
	},
	{
		id: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
	},
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PayoutsTableProps {
	data: PayoutListItem[];
	isLoading?: boolean;
}

export function PayoutsTable({ data, isLoading }: PayoutsTableProps) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	if (isLoading) {
		return (
			<div className="rounded-lg border">
				<div className="p-8 flex items-center justify-center">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
				</div>
			</div>
		);
	}

	if (data.length === 0) {
		return (
			<div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed">
				<div className="text-center space-y-1">
					<p className="text-sm font-medium text-muted-foreground">
						No payouts yet
					</p>
					<p className="text-xs text-muted-foreground">
						Use "Run Batch" to create payouts from approved commission splits.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-lg border overflow-hidden">
			<Table data-testid="payouts-table">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="bg-muted/30">
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id} className="text-xs font-medium">
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.map((row) => (
						<TableRow
							key={row.id}
							className={cn(
								"hover:bg-muted/30 transition-colors",
								row.original.amount < 0 && "bg-red-50/40",
							)}
						>
							{row.getVisibleCells().map((cell) => (
								<TableCell key={cell.id} className="py-3">
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
