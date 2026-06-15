import type { ColumnDef } from "@tanstack/table-core";
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

export interface UomRow {
	id: string;
	name: string;
	description: string | null;
	baseUomId: string | null;
	conversionFactor: string;
	createdAt: Date;
	updatedAt: Date;
}

export type UomTableMeta = {
	onEdit: (row: UomRow) => void;
	onDelete: (id: string) => void;
};

export const columns: ColumnDef<UomRow>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<Button
				variant="ghost"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Name
				<ArrowUpDown className="ml-2 size-4" />
			</Button>
		),
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ row }) => {
			const description = row.getValue("description") as string | null;
			return (
				<div className="truncate" title={description ?? ""}>
					{description || "—"}
				</div>
			);
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row, table }) => {
			const uom = row.original;
			const meta = table.options.meta as UomTableMeta | undefined;

			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="size-8 p-0">
							<span className="sr-only">Open menu</span>
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => navigator.clipboard.writeText(uom.name)}
						>
							Copy UoM name
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => meta?.onEdit(uom)}>
							Edit UoM
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-destructive"
							onClick={() => meta?.onDelete(uom.id)}
						>
							Delete UoM
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
