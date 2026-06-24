import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import {
	StatusBadge,
	type CanonicalStatus,
} from "@/components/ui/status-badge";
import type { ColumnDef } from "@tanstack/table-core";
import { Package } from "lucide-react";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { formatPrice } from "@/lib/money";

export interface ProductRow {
	id: string;
	sku: string;
	name: string;
	barcode?: string | null;
	type?: string | null;
	brandId?: string | null;
	categoryId?: string | null;
	supplierId?: string | null;
	uomId?: string | null;
	conversionFactor?: string | null;
	price: number; // integer cents
	status?: string | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
}

export const columns: ColumnDef<ProductRow>[] = [
	{
		id: "image",
		header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
		cell: () => (
			<div className="flex items-center justify-center size-10">
				<div className="size-10 bg-muted rounded-md flex items-center justify-center">
					<Package className="size-5 text-muted-foreground" />
				</div>
			</div>
		),
		enableSorting: false,
		enableHiding: false,
	},
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Name" />
		),
		cell: ({ getValue }) => (
			<span className="font-medium">{getValue<string>() || "—"}</span>
		),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "sku",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="SKU" />
		),
		cell: ({ getValue }) => <CopyableCell value={getValue<string>()} />,
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Type" />
		),
		cell: ({ getValue }) => {
			const type = getValue<string | null | undefined>();
			return (
				<Badge variant="outline" className="capitalize">
					{type?.replace("_", " ") ?? "—"}
				</Badge>
			);
		},
		enableSorting: true,
		enableHiding: true,
	},
	{
		accessorKey: "barcode",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Barcode" />
		),
		cell: ({ getValue }) => {
			const barcode = getValue<string | null | undefined>();
			return barcode ? (
				<CopyableCell value={barcode} />
			) : (
				<span className="text-muted-foreground text-sm">-</span>
			);
		},
		enableSorting: true,
		enableHiding: true,
	},
	{
		accessorKey: "price",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Price (MYR)" />
		),
		cell: ({ getValue }) => {
			const price = getValue<number>();
			return (
				<span className="font-medium">
					{price != null ? formatPrice(price, "MYR") : "—"}
				</span>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ getValue }) => (
			<StatusBadge
				status={
					(getValue<string | null | undefined>() ??
						"inactive") as CanonicalStatus
				}
			/>
		),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "conversionFactor",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Conv. Factor" />
		),
		cell: ({ getValue }) => {
			const factor = getValue<string | null | undefined>();
			return (
				<span className="text-sm text-muted-foreground">{factor ?? "1"}</span>
			);
		},
		enableSorting: false,
		enableHiding: true,
	},
];
