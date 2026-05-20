import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/money";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

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

// ---------------------------------------------------------------------------
// Avg/mo cell — per-row query (staleTime 5 min keeps re-fetch cost low)
// ---------------------------------------------------------------------------

function AvgSessionsCell({
	serviceId,
	organizationId,
}: {
	serviceId: string;
	organizationId: string;
}) {
	const { data, isLoading } = useQuery({
		...orpc.services.avgSessionsSoldPerMonth.queryOptions({
			input: { organizationId, serviceId },
		}),
		staleTime: 5 * 60 * 1000,
		enabled: !!serviceId && !!organizationId,
	});

	if (isLoading) {
		return (
			<span className="inline-block h-4 w-8 animate-pulse rounded bg-muted font-mono tabular-nums" />
		);
	}
	if (!data) return <span className="text-muted-foreground">—</span>;

	return (
		<span className="font-mono tabular-nums">
			{data.avgSessionsPerMonth.toFixed(1)}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Trainer tiers cell
// ---------------------------------------------------------------------------

function TrainerTiersCell({ tiers }: { tiers?: string[] }) {
	if (!tiers || tiers.length === 0)
		return <span className="text-muted-foreground">—</span>;
	return (
		<div className="flex flex-wrap gap-1">
			{tiers.map((tier) => (
				<Badge key={tier} variant="outline" className="capitalize">
					{tier}
				</Badge>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

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
		cell: ({ getValue }) => {
			const val = getValue<number>();
			return val != null ? (
				<span className="font-mono tabular-nums">
					{formatPrice(val, "MYR")}
				</span>
			) : (
				"—"
			);
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
			const count = getValue<number | null>();
			return count != null ? (
				<span className="font-mono tabular-nums">{count}</span>
			) : (
				"—"
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		id: "avgPerMonth",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Avg/mo" />
		),
		cell: ({ row, table }) => {
			const serviceId: string | undefined = row.original.id;
			const organizationId: string | undefined = (
				table.options.meta as { organizationId?: string } | undefined
			)?.organizationId;
			if (!serviceId || !organizationId)
				return <span className="text-muted-foreground">—</span>;
			return (
				<AvgSessionsCell
					serviceId={serviceId}
					organizationId={organizationId}
				/>
			);
		},
		enableSorting: false,
		enableHiding: true,
	},
	{
		id: "trainerTiers",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Trainer Tiers" />
		),
		cell: ({ row }) => (
			<TrainerTiersCell tiers={row.original.eligibleTrainerTiers} />
		),
		enableSorting: false,
		enableHiding: true,
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
