import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge, type CanonicalStatus } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import { CopyableCell } from "@/components/tables/copyable-cell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StockRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

export interface StockRequestRow {
	id: string;
	requestNumber: string;
	dateIssued: string;
	issuedByMemberId: string;
	fromBranchId?: string | null;
	toBranchId: string;
	destinationLabel?: string | null;
	notes?: string | null;
	status: StockRequestStatus;
	items: Array<{
		id: string;
		productId: string;
		quantityRequested: number;
		quantityFulfilled?: number | null;
		notes?: string | null;
	}>;
	createdAt: string;
}


// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const columns: ColumnDef<StockRequestRow>[] = [
	{
		accessorKey: "requestNumber",
		header: ({ column }) => (
			<Button
				variant="ghost"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Request #
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
		accessorKey: "issuedByMemberId",
		header: "Issued By",
		cell: ({ getValue }) => <CopyableCell value={getValue<string>()} />,
	},
	{
		accessorKey: "toBranchId",
		header: "To Branch",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.original.destinationLabel ?? row.original.toBranchId}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ getValue }) => <StatusBadge status={getValue<StockRequestStatus>() as CanonicalStatus} />,
	},
];
