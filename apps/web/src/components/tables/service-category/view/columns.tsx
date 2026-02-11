import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";

function formatDate(date: Date | string | null | undefined): string {
	if (!date) return "N/A";
	try {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return "N/A";
	}
}

export const columns: ColumnDef<any>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Name" />
		),
		cell: ({ getValue }) => getValue<string>() || "N/A",
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "description",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Description" />
		),
		cell: ({ getValue }) => {
			const v = getValue<string | null>();
			return v ?? "—";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "displayOrder",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Order" />
		),
		cell: ({ getValue }) => {
			const n = getValue<number>();
			return n !== undefined && n !== null ? String(n) : "—";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "isActive",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ getValue }) => {
			const active = getValue<boolean>();
			return active === true ? (
				<Badge variant="default">Active</Badge>
			) : (
				<Badge variant="secondary">Inactive</Badge>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "createdAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Created" />
		),
		cell: ({ getValue }) => formatDate(getValue<Date | string>()),
		enableSorting: true,
		enableHiding: false,
	},
];
