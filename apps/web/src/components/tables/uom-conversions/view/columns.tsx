import type { ColumnDef } from "@tanstack/table-core";
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

export interface UomConversionRow {
	id: string;
	name: string;
	description: string | null;
	baseUomId: string | null;
	conversionFactor: string;
	createdAt: Date;
	updatedAt: Date;
}

export type UomConversionTableMeta = {
	uomMap: Record<string, string>;
	onEdit: (row: UomConversionRow) => void;
	onDelete: (id: string) => void;
};

export const columns: ColumnDef<UomConversionRow>[] = [
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
		id: "baseUom",
		header: "Base UoM",
		cell: ({ row, table }) => {
			const meta = table.options.meta as UomConversionTableMeta | undefined;
			const baseUomId = row.original.baseUomId;
			const baseName = baseUomId ? (meta?.uomMap[baseUomId] ?? baseUomId) : "—";
			return (
				<Badge variant="outline" className="font-mono">
					{baseName}
				</Badge>
			);
		},
	},
	{
		id: "conversion",
		header: "Conversion Factor",
		cell: ({ row, table }) => {
			const meta = table.options.meta as UomConversionTableMeta | undefined;
			const baseUomId = row.original.baseUomId;
			const baseName = baseUomId ? (meta?.uomMap[baseUomId] ?? "base") : "base";
			const factor = Number(row.original.conversionFactor);
			return (
				<div className="flex items-center gap-2 text-sm">
					<Badge variant="outline" className="font-mono">
						1 {row.original.name}
					</Badge>
					<span className="text-muted-foreground">=</span>
					<Badge variant="outline" className="font-mono">
						{factor.toFixed(4)} {baseName}
					</Badge>
				</div>
			);
		},
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ row }) => {
			const description = row.getValue("description") as string | null;
			return (
				<span className="text-sm text-muted-foreground">
					{description || "—"}
				</span>
			);
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row, table }) => {
			const conversion = row.original;
			const meta = table.options.meta as UomConversionTableMeta | undefined;

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
							onClick={() => navigator.clipboard.writeText(conversion.name)}
						>
							Copy name
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => meta?.onEdit(conversion)}>
							Edit conversion
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-destructive"
							onClick={() => meta?.onDelete(conversion.id)}
						>
							Delete conversion
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
