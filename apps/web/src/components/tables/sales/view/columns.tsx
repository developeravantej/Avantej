import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { StatusBadge, type CanonicalStatus } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPrice } from "@/lib/money";
import { Link, useNavigate } from "@tanstack/react-router";

export interface SalesRow {
	id: string;
	date?: string | null;
	sales_order?: string | null;
	total_sales?: number;
	customer_name?: string | null;
	customerId?: string | null;
	service_name?: string | null;
	branch_name?: string | null;
	created_by?: string | null;
	status?: string | null;
	refund_status?: string | null;
}

const formatDate = (dateString: string | null | undefined): string => {
	if (!dateString) return "N/A";
	try {
		return new Date(dateString).toLocaleDateString();
	} catch {
		return "N/A";
	}
};

const REFUND_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
	pending: { label: "Refund Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
	partial:  { label: "Partial Refund", className: "bg-orange-50 text-orange-700 border-orange-200" },
	processed: { label: "Refunded", className: "bg-green-50 text-green-700 border-green-200" },
};

function RefundStatusBadge({ status }: { status: string | null | undefined }) {
	if (!status || status === "none") return <span className="text-[#737373] text-sm">—</span>;
	const cfg = REFUND_STATUS_CONFIG[status];
	if (!cfg) return <span className="text-sm text-[#737373]">{status}</span>;
	return (
		<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.className}`}>
			{cfg.label}
		</span>
	);
}

function SalesActionCell({ row }: { row: import("@tanstack/react-table").Row<SalesRow> }) {
	const navigate = useNavigate();
	return (
		<div className="flex items-center gap-2">
			<Button
				variant="ghost"
				size="sm"
				onClick={() =>
					navigate({
						to: "/dashboard/sales/$id",
						params: { id: row.original.id },
					})
				}
			>
				<Eye className="h-4 w-4 mr-1" /> View
			</Button>
		</div>
	);
}

export const columns: ColumnDef<SalesRow>[] = [
	// 1. When
	{
		accessorKey: "date",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Date" />
		),
		cell: ({ getValue }) => formatDate(getValue<string>()),
		enableSorting: true,
		enableHiding: false,
	},
	// 2. Reference
	{
		accessorKey: "sales_order",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Sales Order" />
		),
		cell: ({ getValue }) => {
			const salesOrder = getValue<string>();
			return salesOrder ? <CopyableCell value={salesOrder} /> : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	// 3. Who
	{
		accessorKey: "customer_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Customer Name" />
		),
		cell: ({ row }) => {
			const name = row.original.customer_name;
			const customerId = row.original.customerId;
			if (customerId) {
				return (
					<Link
						to="/dashboard/customers/v2/view"
						search={{ tab: "customers", customer: customerId }}
						className="text-primary underline-offset-4 hover:underline"
					>
						{name || "N/A"}
					</Link>
				);
			}
			return name || "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	// 4. What
	{
		accessorKey: "service_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Service" />
		),
		cell: ({ getValue }) => {
			const name = getValue<string | null | undefined>();
			return name ? (
				<span className="max-w-[200px] truncate block text-sm" title={name}>
					{name}
				</span>
			) : (
				<span className="text-[#737373] text-sm">—</span>
			);
		},
		enableSorting: false,
		enableHiding: true,
	},
	// 5. Where
	{
		accessorKey: "branch_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Branch" />
		),
		cell: ({ getValue }) => {
			const name = getValue<string | null | undefined>();
			return name ? (
				<span className="text-sm">{name}</span>
			) : (
				<span className="text-[#737373] text-sm">—</span>
			);
		},
		enableSorting: false,
		enableHiding: true,
	},
	// 6. How much
	{
		accessorKey: "total_sales",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Total (MYR)" />
		),
		cell: ({ getValue }) => {
			const totalSales = getValue<number>();
			return totalSales !== undefined ? formatPrice(totalSales, "MYR") : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	// 7. Order state
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ getValue }) => {
			const status = getValue<string>();
			return status ? <StatusBadge status={status as CanonicalStatus} /> : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	// 8. Refund state (child of status)
	{
		accessorKey: "refund_status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Refund" />
		),
		cell: ({ getValue }) => <RefundStatusBadge status={getValue<string>()} />,
		enableSorting: false,
		enableHiding: true,
	},
	// 9. Who processed it
	{
		accessorKey: "created_by",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Created By" />
		),
		cell: ({ getValue }) => {
			const createdBy = getValue<string>();
			if (!createdBy) return <span className="text-[#737373] text-sm">—</span>;
			const initial = createdBy.charAt(0).toUpperCase();
			return (
				<div className="flex items-center gap-2">
					<Avatar className="h-6 w-6">
						<AvatarImage src="" alt={createdBy} />
						<AvatarFallback className="text-xs">{initial}</AvatarFallback>
					</Avatar>
					<span className="text-sm">{createdBy}</span>
				</div>
			);
		},
		enableSorting: true,
		enableHiding: true,
	},
	// 10. Action
	{
		id: "actions",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Action" />
		),
		cell: ({ row }) => <SalesActionCell row={row} />,
		enableSorting: false,
		enableHiding: false,
	},
];
