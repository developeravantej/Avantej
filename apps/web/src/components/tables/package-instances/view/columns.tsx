import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import type { ColumnDef } from "@tanstack/react-table";

export interface PackageInstanceRow {
	id?: string;
	packageId?: string | null;
	packageName?: string | null;
	source?: string | null;
	creditsTotal?: number | null;
	creditsRemaining?: number | null;
	creditsUsed?: number | null;
	totalPrice?: number | null;
	startsAt?: string | null;
	expiresAt?: string | null;
	status?: string | null;
	paymentStatus?: string | null;
}

const formatDate = (dateString: string | null | undefined): string => {
	if (!dateString) return "N/A";
	try {
		return new Date(dateString).toLocaleDateString();
	} catch {
		return "N/A";
	}
};

export const columns: ColumnDef<PackageInstanceRow>[] = [
	{
		accessorKey: "packageName",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Package" />
		),
		cell: ({ row }) => {
			const name = row.original.packageName;
			const packageId = row.original.packageId;
			if (name) {
				return <span className="font-semibold">{name}</span>;
			}
			if (packageId) {
				return <CopyableCell value={packageId} displayText={packageId.slice(0, 8) + "..."} />;
			}
			return "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "source",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Source" />
		),
		cell: ({ getValue }) => {
			const source = getValue<string>();
			if (!source) return "N/A";
			return (
				<Badge variant="outline">
					{source.charAt(0).toUpperCase() + source.slice(1)}
				</Badge>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		id: "sessionsUsed",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Sessions Used" />
		),
		cell: ({ row }) => {
			const used = row.original.creditsUsed;
			const total = row.original.creditsTotal;
			if (used != null && total != null) {
				return `${used} / ${total}`;
			}
			return used != null ? used : "N/A";
		},
		enableSorting: false,
		enableHiding: false,
	},
	{
		accessorKey: "creditsRemaining",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Remaining" />
		),
		cell: ({ getValue }) => {
			const remaining = getValue<number>();
			return remaining != null ? remaining : <span className="text-muted-foreground">&mdash;</span>;
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "totalPrice",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Total (MYR)" />
		),
		cell: ({ getValue }) => {
			const price = getValue<number>();
			return price != null ? formatPrice(price, "MYR") : <span className="text-muted-foreground">&mdash;</span>;
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "startsAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Start Date" />
		),
		cell: ({ getValue }) => formatDate(getValue<string>()),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "expiresAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Expiry" />
		),
		cell: ({ getValue }) => {
			const date = getValue<string>();
			return date ? formatDate(date) : <span className="text-muted-foreground">&mdash;</span>;
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ getValue }) => {
			const status = getValue<string>();
			if (!status) return "N/A";
			const variant = status === "active" ? "default" : "outline";
			const label = status.charAt(0).toUpperCase() + status.slice(1);
			return <Badge variant={variant}>{label}</Badge>;
		},
		enableSorting: true,
		enableHiding: false,
	},
];
