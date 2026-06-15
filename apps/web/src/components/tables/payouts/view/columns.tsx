import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { formatPrice } from "@/lib/money";

export interface PayoutRow {
	id?: string;
	recipientId?: string | null;
	recipientName?: string | null;
	amount?: number | null; // cents
	status?: string | null;
	paidAt?: string | null;
	appointmentId?: string | null;
	createdAt?: string | null;
	// Agent 2.5 — J5 commission audit
	batchId?: string | null;
}

function getStatusVariant(
	status: string | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
	const map: Record<
		string,
		"default" | "secondary" | "destructive" | "outline"
	> = {
		paid: "default",
		pending: "secondary",
		processing: "secondary",
		failed: "destructive",
		canceled: "outline",
	};
	return map[status ?? ""] ?? "outline";
}

const formatDate = (dateString: string | null | undefined): string => {
	if (!dateString) return "N/A";
	try {
		return new Date(dateString).toLocaleDateString();
	} catch {
		return "N/A";
	}
};

export const columns: ColumnDef<PayoutRow>[] = [
	{
		accessorKey: "id",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Payout ID" />
		),
		cell: ({ getValue }) => {
			const id = getValue<string>();
			return id ? (
				// react-doctor-disable-next-line react-doctor/server-dedup-props -- SPA (Vite/TanStack Router), no RSC serialization cost; explicit displayText avoids re-deriving truncation on every render
				<CopyableCell value={id} displayText={id.slice(0, 8)} />
			) : (
				"N/A"
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "recipientName",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Recipient" />
		),
		cell: ({ getValue }) => getValue<string>() || "Unknown",
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "amount",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Amount (MYR)" />
		),
		cell: ({ getValue }) => {
			const amount = getValue<number>();
			return amount != null ? formatPrice(amount, "MYR") : "N/A";
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
			return (
				<Badge variant={getStatusVariant(status)}>
					{status ? status.charAt(0).toUpperCase() + status.slice(1) : "N/A"}
				</Badge>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "paidAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Paid At" />
		),
		cell: ({ getValue }) => formatDate(getValue<string>()),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "createdAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Created" />
		),
		cell: ({ getValue }) => formatDate(getValue<string>()),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "batchId",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Batch" />
		),
		cell: ({ getValue }) => {
			const id = getValue<string | null>();
			return id ? (
				// react-doctor-disable-next-line react-doctor/server-dedup-props -- SPA (Vite/TanStack Router), no RSC serialization cost; explicit displayText avoids re-deriving truncation on every render
				<CopyableCell value={id} displayText={id.slice(0, 8)} />
			) : (
				<span className="text-muted-foreground">-</span>
			);
		},
		enableSorting: true,
		enableHiding: true,
	},
];
