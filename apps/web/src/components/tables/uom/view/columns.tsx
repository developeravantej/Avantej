import type { ColumnDef } from "@tanstack/react-table";
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

export interface UoMRow {
	id?: string;
	Name: string;
	Description: string;
	"Base UoM"?: string;
}

export const columns: ColumnDef<UoMRow>[] = [
	{
		accessorKey: "Name",
		header: ({ column }) => (
			<Button
				variant="ghost"
				type="button"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Name
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
	},
	{
		accessorKey: "Description",
		header: "Description",
		cell: ({ row }) => {
			const description = row.getValue("Description") as string;
			return (
				<div className="truncate" title={description}>
					{description || "N/A"}
				</div>
			);
		},
	},
	{
		accessorKey: "Base UoM",
		header: "Base UoM",
		cell: ({ getValue }) => getValue<string>() || "N/A",
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row }) => {
			const uom = row.original;
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
							onClick={() => uom.Name && navigator.clipboard.writeText(uom.Name)}
						>
							Copy UoM name
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem>View details</DropdownMenuItem>
						<DropdownMenuItem>Edit UoM</DropdownMenuItem>
						<DropdownMenuItem>Delete UoM</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
