import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Package } from "lucide-react";
import { toast } from "sonner";
import React from "react";

export interface ProductRow {
	Description: string;
	SKU: string;
	Type: string;
	Barcode: string;
	"Conversion Factor": number;
	Price: number;
	Brand: string;
	Category: string;
	Supplier: string;
	Stock: number;
	Status: string;
}

interface CopyableCellProps {
	value: string | null | undefined;
}

const CopyableCell: React.FC<CopyableCellProps> = ({ value }) => {
	const onCopy = (textToCopy: string) => {
		navigator.clipboard
			.writeText(textToCopy)
			.then(() => toast.success("Copied to clipboard!"))
			.catch((err) => toast.error("Failed to copy: " + err));
	};
	return (
		<div
			className="cursor-pointer flex items-center group"
			onClick={() => value && onCopy(value)}
			onKeyDown={(e) => value && e.key === "Enter" && onCopy(value)}
			role="button"
			tabIndex={0}
		>
			<Badge variant="outline" className="flex items-center gap-x-2 truncate" title={value || undefined}>
				{value || "N/A"}
				<Copy className="h-3.5 w-3.5 text-muted-foreground" />
			</Badge>
		</div>
	);
};

const formatPrice = (price: number): string =>
	new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);

export const columns: ColumnDef<ProductRow>[] = [
	{
		id: "image",
		header: () => null,
		cell: () => (
			<div className="flex items-center justify-center w-12 h-12 relative">
				<div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
					<Package className="h-6 w-6 text-muted-foreground" />
				</div>
			</div>
		),
		enableSorting: false,
		enableHiding: false,
	},
	{
		accessorKey: "Description",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
		cell: ({ getValue }) => getValue<string>() || "N/A",
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "SKU",
		header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
		cell: ({ getValue }) => <CopyableCell value={getValue<string>()} />,
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Type",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
		cell: ({ getValue }) => (
			<Badge variant="outline" className="capitalize">
				{getValue<string>() || "N/A"}
			</Badge>
		),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Barcode",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Barcode" />,
		cell: ({ getValue }) => <CopyableCell value={getValue<string>()} />,
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Price",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
		cell: ({ getValue }) => {
			const price = getValue<number>();
			return price !== undefined ? formatPrice(price) : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Brand",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Brand" />,
		cell: ({ getValue }) => getValue<string>() || "N/A",
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Category",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
		cell: ({ getValue }) => (
			<Badge variant="secondary" className="capitalize">
				{getValue<string>() || "N/A"}
			</Badge>
		),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Supplier",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
		cell: ({ getValue }) => getValue<string>() || "N/A",
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Stock",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />,
		cell: ({ getValue }) => {
			const stock = getValue<number>() ?? 0;
			const variant = stock > 100 ? "default" : stock > 50 ? "secondary" : "destructive";
			return (
				<Badge variant={variant} className="font-mono">
					{stock}
				</Badge>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Status",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
		cell: ({ getValue }) => (
			<Badge variant={getValue<string>() === "Active" ? "default" : "secondary"} className="capitalize">
				{getValue<string>() || "N/A"}
			</Badge>
		),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "Conversion Factor",
		header: ({ column }) => <DataTableColumnHeader column={column} title="Conversion Factor" />,
		cell: ({ getValue }) => getValue<number>() ?? 1,
		enableSorting: true,
		enableHiding: false,
	},
];
