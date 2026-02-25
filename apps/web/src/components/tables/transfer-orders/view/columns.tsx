import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TransferOrderRow {
	"Transfer Number": string;
	"Date Issued": string;
	Form: string;
	"Issued By": string;
	"Issued To": string;
	Status: string;
}

export const columns: ColumnDef<TransferOrderRow>[] = [
	{
		accessorKey: "Transfer Number",
		header: ({ column }) => (
			<Button
				variant="ghost"
				type="button"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Transfer Number
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
	},
	{
		accessorKey: "Date Issued",
		header: "Date Issued",
		cell: ({ row }) => {
			const date = row.getValue("Date Issued") as string;
			return date ? new Date(date).toLocaleDateString() : "N/A";
		},
	},
	{
		accessorKey: "Form",
		header: "Form",
	},
	{
		accessorKey: "Issued By",
		header: "Issued By",
	},
	{
		accessorKey: "Issued To",
		header: "Issued To",
	},
	{
		accessorKey: "Status",
		header: "Status",
		cell: ({ row }) => {
			const status = row.getValue("Status") as string;
			const statusColors = {
				Pending: "secondary",
				Approved: "default",
				"In Progress": "default",
				Completed: "default",
				Rejected: "destructive",
			} as const;
			return (
				<Badge variant={statusColors[status as keyof typeof statusColors] ?? "secondary"}>
					{status}
				</Badge>
			);
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row }) => {
			const transferOrder = row.original;
			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="h-8 w-8 p-0" type="button">
							<span className="sr-only">Open menu</span>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() =>
								navigator.clipboard.writeText(transferOrder["Transfer Number"])
							}
						>
							Copy transfer number
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem>View details</DropdownMenuItem>
						<DropdownMenuItem>Edit order</DropdownMenuItem>
						<DropdownMenuItem>Approve order</DropdownMenuItem>
						<DropdownMenuItem>Reject order</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
