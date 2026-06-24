import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Trash2, Edit } from "lucide-react";

export interface CategoryRow {
	Name: string;
	externalCode: string;
	"Products Assigned": number;
	ID: string;
}

export type CategoryTableMeta = {
	onEdit?: (row: CategoryRow) => void;
	onDelete?: (row: CategoryRow) => void;
};

export const columns: ColumnDef<CategoryRow>[] = [
	{
		accessorKey: "Name",
		header: ({ column }) => {
			return (
				<div className="text-center">
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Name
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				</div>
			);
		},
		cell: ({ row }) => {
			return <div className="text-center">{row.getValue("Name")}</div>;
		},
	},
	{
		accessorKey: "externalCode",
		header: () => <div className="text-center">External Code</div>,
		cell: ({ row }) => {
			const externalCode = row.getValue("externalCode") as string;
			return <div className="text-center">{externalCode || "N/A"}</div>;
		},
	},
	{
		accessorKey: "Products Assigned",
		header: ({ column }) => {
			return (
				<div className="text-center">
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Products Assigned
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				</div>
			);
		},
		cell: ({ row }) => {
			const count = row.getValue("Products Assigned") as number;
			return (
				<div className="text-center">
					<span className="font-medium">{count}</span>
				</div>
			);
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row, table }) => {
			const category = row.original;

			return (
				<div className="text-center flex justify-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="size-8 p-0 text-primary hover:bg-primary/10"
						onClick={() =>
							(table.options.meta as CategoryTableMeta | undefined)?.onEdit?.(
								category,
							)
						}
					>
						<span className="sr-only">Edit category</span>
						<Edit className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="size-8 p-0 text-destructive hover:bg-destructive/10"
						onClick={() =>
							(table.options.meta as CategoryTableMeta | undefined)?.onDelete?.(
								category,
							)
						}
					>
						<span className="sr-only">Delete category</span>
						<Trash2 className="size-4" />
					</Button>
				</div>
			);
		},
	},
];
