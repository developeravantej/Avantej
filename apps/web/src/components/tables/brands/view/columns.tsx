import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

export interface BrandRow {
	Name: string;
	"Products Assigned": number;
	ID: string;
}

export const columns: ColumnDef<BrandRow>[] = [
	{
		accessorKey: "Name",
		header: ({ column }) => (
			<div className="text-center">
				<Button
					variant="ghost"
					type="button"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Name
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			</div>
		),
		cell: ({ row }) => (
			<div className="text-center">{row.getValue("Name")}</div>
		),
	},
	{
		accessorKey: "Products Assigned",
		header: ({ column }) => (
			<div className="text-center">
				<Button
					variant="ghost"
					type="button"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Products Assigned
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			</div>
		),
		cell: ({ row }) => {
			const count = row.getValue("Products Assigned") as number;
			return (
				<div className="text-center">
					<span className="font-medium">{count}</span>
				</div>
			);
		},
	},
];
