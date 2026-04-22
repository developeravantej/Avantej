import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPrice } from "@/lib/currency";
import { Link, useNavigate } from "@tanstack/react-router";

export interface SalesRow {
	id: string;
	date?: string | null;
	sales_order?: string | null;
	total_sales?: number;
	customer_name?: string | null;
	customerId?: string | null;
	created_by?: string | null;
	status?: string | null;
}

// Helper component for copyable cells
interface CopyableCellProps {
	value: string | null | undefined;
	displayText?: React.ReactNode;
}

const CopyableCell: React.FC<CopyableCellProps> = ({ value, displayText }) => {
	const onCopy = (textToCopy: string) => {
		navigator.clipboard
			.writeText(textToCopy)
			.then(() => {
				toast.success("Copied to clipboard!");
			})
			.catch((err) => {
				toast.error("Failed to copy: " + err);
			});
	};

	const displayContent = displayText || value || "N/A";

	return (
		<div
			className="cursor-pointer flex items-center group"
			onClick={() => onCopy(value!)}
		>
			<Badge
				variant="outline"
				className="flex items-center gap-x-2 truncate"
				title={value || undefined}
			>
				{displayContent}
				<Copy className="h-3.5 w-3.5 text-muted-foreground" />
			</Badge>
		</div>
	);
};

// Helper function to format date
const formatDate = (dateString: string | null | undefined): string => {
	if (!dateString) return "N/A";
	try {
		return new Date(dateString).toLocaleDateString();
	} catch {
		return "N/A";
	}
};


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
	{
		accessorKey: "date",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Date" />
		),
		cell: ({ getValue }) => formatDate(getValue<string>()),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "sales_order",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Sales Order" />
		),
		cell: ({ getValue }) => {
			const salesOrder = getValue<string>();
			return salesOrder ? (
				<CopyableCell value={salesOrder} />
			) : (
				"N/A"
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "total_sales",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Total Sales (MYR)" />
		),
		cell: ({ getValue }) => {
			const totalSales = getValue<number>();
			return totalSales !== undefined ? formatPrice(totalSales, "MYR") : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
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
						to="/dashboard/customers/view"
						search={{ customerId }}
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
	{
		accessorKey: "created_by",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Created By" />
		),
		cell: ({ getValue }) => {
			const createdBy = getValue<string>();
			return (
				<div className="flex items-center gap-2">
					<Avatar className="h-6 w-6">
						<AvatarImage src="" alt={createdBy} />
						<AvatarFallback className="text-xs">
							{createdBy ? createdBy.charAt(0).toUpperCase() : "U"}
						</AvatarFallback>
					</Avatar>
					<span className="text-sm">{createdBy || "N/A"}</span>
				</div>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ getValue }) => {
			const status = getValue<string>();
			const statusStyles: Record<string, string> = {
				completed: "bg-green-100 text-green-700 border-green-200",
				confirmed: "bg-blue-100 text-blue-700 border-blue-200",
				draft: "bg-gray-100 text-gray-600 border-gray-200",
				cancelled: "bg-red-100 text-red-700 border-red-200",
			};
			return status ? (
				<Badge className={`capitalize border ${statusStyles[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
					{status}
				</Badge>
			) : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
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
