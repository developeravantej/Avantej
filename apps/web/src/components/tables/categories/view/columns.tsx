import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

export interface CategoryRow {
	Name: string;
	"External Code": string;
	"Products Assigned": number;
	ID: string;
}

export const columns: ColumnDef<CategoryRow>[] = [
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
		accessorKey: "External Code",
		header: () => (
			<div className="text-center">External Code</div>
		),
		cell: ({ row }) => {
			const externalCode = row.getValue("External Code") as string;
			return (
				<div className="text-center">{externalCode || "N/A"}</div>
			);
		},
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
