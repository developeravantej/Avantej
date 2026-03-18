import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import { CopyableCell } from "@/components/tables/copyable-cell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransferOrderStatus = "pending" | "in_transit" | "completed" | "cancelled";

export interface TransferOrderRow {
	id: string;
	transferNumber: string;
	dateIssued: string;
	fromBranchId: string;
	toBranchId: string;
	issuedByMemberId: string;
	notes?: string | null;
	status: TransferOrderStatus;
	items: Array<{
		id: string;
		productId: string;
		quantityTransferred: number;
		quantityReceived?: number | null;
		notes?: string | null;
	}>;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TransferOrderStatus }) {
	switch (status) {
		case "pending":
			return (
				<Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
					Pending
				</Badge>
			);
		case "in_transit":
			return (
				<Badge variant="default" className="bg-orange-500 hover:bg-orange-600">
					In Transit
				</Badge>
			);
		case "completed":
			return (
				<Badge variant="default" className="bg-green-600 hover:bg-green-700">
					Completed
				</Badge>
			);
		case "cancelled":
			return <Badge variant="destructive">Cancelled</Badge>;
	}
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const columns: ColumnDef<TransferOrderRow>[] = [
	{
		accessorKey: "transferNumber",
		header: ({ column }) => (
			<Button
				variant="ghost"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Transfer #
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ getValue }) => <CopyableCell value={getValue<string>()} />,
	},
	{
		accessorKey: "dateIssued",
		header: "Date Issued",
		cell: ({ getValue }) => <span className="text-sm">{getValue<string>()}</span>,
	},
	{
		accessorKey: "fromBranchId",
		header: "From Branch",
		cell: ({ getValue }) => (
			<span className="text-sm text-muted-foreground">{getValue<string>()}</span>
		),
	},
	{
		accessorKey: "toBranchId",
		header: "To Branch",
		cell: ({ getValue }) => (
			<span className="text-sm text-muted-foreground">{getValue<string>()}</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ getValue }) => <StatusBadge status={getValue<TransferOrderStatus>()} />,
	},
];
