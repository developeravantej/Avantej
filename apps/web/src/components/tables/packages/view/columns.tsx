import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";
import { formatPrice } from "@/lib/money";

export interface PackageRow {
	id?: string;
	name?: string | null;
	appointmentType?: string | null;
	sessionCount?: number | null;
	pricePerSession?: number | null;
	maxClientsPerSession?: number | null;
	expiryDays?: number | null;
	expiryDate?: string | null;
	isArchived?: boolean | null;
}

const formatDate = (dateString: string | null | undefined): string => {
	if (!dateString) return "N/A";
	try {
		return new Date(dateString).toLocaleDateString();
	} catch {
		return "N/A";
	}
};

export const columns: ColumnDef<PackageRow>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Name" />
		),
		cell: ({ getValue }) => {
			const name = getValue<string>();
			return (
				<span className="font-semibold">{name || "N/A"}</span>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "appointmentType",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Type" />
		),
		cell: ({ getValue }) => {
			const type = getValue<string>();
			if (!type) return "N/A";
			const label = type === "semi-private" ? "Semi-Private" : type.charAt(0).toUpperCase() + type.slice(1);
			return <Badge variant="outline">{label}</Badge>;
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "sessionCount",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Sessions" />
		),
		cell: ({ getValue }) => {
			const count = getValue<number>();
			return count != null ? count : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "pricePerSession",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Price/Session (MYR)" />
		),
		cell: ({ getValue }) => {
			const price = getValue<number>();
			return price != null ? formatPrice(price, "MYR") : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		id: "validity",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Validity" />
		),
		cell: ({ row }) => {
			const expiryDays = row.original.expiryDays;
			const expiryDate = row.original.expiryDate;
			if (expiryDays != null) {
				return `${expiryDays} days`;
			}
			if (expiryDate) {
				return formatDate(expiryDate);
			}
			return <span className="text-muted-foreground">&mdash;</span>;
		},
		enableSorting: false,
		enableHiding: false,
	},
	{
		accessorKey: "isArchived",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ getValue }) => {
			const isArchived = getValue<boolean>();
			return isArchived ? (
				<Badge variant="outline">Archived</Badge>
			) : (
				<Badge variant="default">Active</Badge>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		id: "actions",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Action" />
		),
		cell: ({ row: _row }) => {
			return (
				<div className="flex items-center gap-2">
					<button
						className="text-blue-600 hover:text-blue-800 text-sm font-medium"
						type="button"
						onClick={() => {
						}}
					>
						Edit
					</button>
				</div>
			);
		},
		enableSorting: false,
		enableHiding: false,
	},
];
