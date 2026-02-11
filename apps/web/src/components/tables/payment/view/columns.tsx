import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface PaymentRow {
	date?: string | null;
	invoice?: string | null;
	sales_order?: string | null;
	mode?: string | null;
	total_paid?: number;
	customer_name?: string | null;
	created_by?: string | null;
	e_invoice_status?: string | null;
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

// Helper function to format E-Invoice Status
const formatEInvoiceStatus = (
	status: string | null | undefined,
): React.ReactNode => {
	if (!status) return "N/A";

	const statusConfig = {
		pending: { label: "Pending", variant: "secondary" as const },
		generated: { label: "Generated", variant: "default" as const },
		sent: { label: "Sent", variant: "default" as const },
		failed: { label: "Failed", variant: "destructive" as const },
		cancelled: { label: "Cancelled", variant: "outline" as const },
	};

	const config =
		statusConfig[status.toLowerCase() as keyof typeof statusConfig] || {
			label: status,
			variant: "outline" as const,
		};

	return (
		<Badge variant={config.variant} className="text-xs">
			{config.label}
		</Badge>
	);
};

export const columns: ColumnDef<PaymentRow>[] = [
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
		accessorKey: "invoice",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Invoice" />
		),
		cell: ({ getValue }) => {
			const invoice = getValue<string>();
			return invoice ? (
				<CopyableCell value={invoice} />
			) : (
				"N/A"
			);
		},
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
		accessorKey: "mode",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Mode" />
		),
		cell: ({ getValue }) => {
			const mode = getValue<string>();
			return mode ? (
				<Badge variant="outline" className="text-xs">
					{mode}
				</Badge>
			) : (
				"N/A"
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "total_paid",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Total Paid (MYR)" />
		),
		cell: ({ getValue }) => {
			const totalPaid = getValue<number>();
			return totalPaid !== undefined ? formatPriceMYR(totalPaid) : "N/A";
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
		accessorKey: "e_invoice_status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="E-Invoice Status" />
		),
		cell: ({ getValue }) => formatEInvoiceStatus(getValue<string>()),
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
							console.log("View payment:", row.original);
						}}
					>
						View
					</button>
					<button
						className="text-green-600 hover:text-green-800 text-sm font-medium"
						type="button"
						onClick={() => {
							console.log("Edit payment:", row.original);
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
