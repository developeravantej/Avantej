import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface SalesRow {
	date?: string | null;
	sales_order?: string | null;
	total_sales?: number;
	customer_name?: string | null;
	created_by?: string | null;
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

// Helper function to format price in MYR
const formatPriceMYR = (price: number): string => {
	return new Intl.NumberFormat("en-MY", {
		style: "currency",
		currency: "MYR",
	}).format(price);
};

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
			return totalSales !== undefined ? formatPriceMYR(totalSales) : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "customer_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Customer Name" />
		),
		cell: ({ getValue }) => getValue<string>() || "N/A",
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
		id: "actions",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Action" />
		),
		cell: ({ row }) => {
			return (
				<div className="flex items-center gap-2">
					<button
						className="text-blue-600 hover:text-blue-800 text-sm font-medium"
						type="button"
						onClick={() => {
							// Handle view action
							console.log("View sales order:", row.original);
						}}
					>
						View
					</button>
					<button
						className="text-green-600 hover:text-green-800 text-sm font-medium"
						type="button"
						onClick={() => {
							// Handle edit action
							console.log("Edit sales order:", row.original);
						}}
					>
						Edit
					</button>
				</div>
			);
		},
		enableSorting: false,
		enableHiding: false,
	},
];
