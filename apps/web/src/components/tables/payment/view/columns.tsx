import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPrice } from "@/lib/money";
import { useNavigate } from "@tanstack/react-router";

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

function PaymentActionCell({ row }: { row: import("@tanstack/react-table").Row<PaymentRow> }) {
	const navigate = useNavigate();
	return (
		<div className="flex items-center gap-2">
			<Button
				variant="ghost"
				size="sm"
				onClick={() =>
					navigate({
						to: "/dashboard/sales/$id",
						params: { id: row.original.sales_order ?? "" },
					})
				}
			>
				<Eye className="h-4 w-4 mr-1" /> View
			</Button>
		</div>
	);
}

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
			const modeStyles: Record<string, string> = {
				cash: "bg-green-100 text-green-700 border-green-200",
				card: "bg-blue-100 text-blue-700 border-blue-200",
				bank_transfer: "bg-orange-100 text-orange-700 border-orange-200",
			};
			return mode ? (
				<Badge className={`capitalize border text-xs ${modeStyles[mode] ?? "bg-muted text-muted-foreground border-border"}`}>
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
			return totalPaid !== undefined ? formatPrice(totalPaid, "MYR") : "N/A";
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
		cell: ({ row }) => <PaymentActionCell row={row} />,
		enableSorting: false,
		enableHiding: false,
	},
];
