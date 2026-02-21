import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface CancelledSaleRow {
	date?: string | null;
	cancellation?: string | null;
	sales_order?: string | null;
	cancelled_amount?: number;
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

export const columns: ColumnDef<CancelledSaleRow>[] = [
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
		accessorKey: "cancellation",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Cancellation" />
		),
		cell: ({ getValue }) => getValue<string>() || "N/A",
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
		accessorKey: "cancelled_amount",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title="Cancelled Amount (MYR)"
			/>
		),
		cell: ({ getValue }) => {
			const cancelledAmount = getValue<number>();
			return cancelledAmount !== undefined
				? formatPriceMYR(cancelledAmount)
				: "N/A";
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
];
