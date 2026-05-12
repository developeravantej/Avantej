import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge, type CanonicalStatus } from "@/components/ui/status-badge";
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
				<ArrowUpDown className="ml-2 size-4" />
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
		cell: ({ getValue }) => <StatusBadge status={getValue<TransferOrderStatus>() as CanonicalStatus} />,
	},
];
