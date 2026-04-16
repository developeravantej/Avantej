import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";

const formatPrice = (priceCents: number | null | undefined): string => {
	if (priceCents == null) return "—";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(priceCents / 100);
};

const formatDate = (date: Date | string | null | undefined): string => {
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
};

function formatDuration(duration: number, unit?: string | null): string {
	if (unit === "hours") return `${duration}h`;
	if (unit === "minutes") return `${duration} min`;
	return `${duration} sec`;
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
		accessorKey: "service_category_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Category" />
		),
		cell: ({ getValue }) => getValue<string>() ?? "—",
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "duration",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Duration" />
		),
		cell: ({ row }) => {
			const duration = row.original.duration;
			const unit = row.original.durationUnitType;
			if (duration == null) return "—";
			return formatDuration(duration, unit);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "price",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Price" />
		),
		cell: ({ getValue }) => formatPrice(getValue<number>()),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "sessionCount",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Sessions" />
		),
		cell: ({ getValue }) => {
			const count = getValue<number | null>();
			return count != null ? count : "—";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "schedulingType",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Scheduling" />
		),
		cell: ({ getValue }) => {
			const v = getValue<string>();
			if (!v) return "—";
			return (
				<Badge variant="outline" className="capitalize">
					{v === "class_slot" ? "Class slot" : "Appointment"}
				</Badge>
			);
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
