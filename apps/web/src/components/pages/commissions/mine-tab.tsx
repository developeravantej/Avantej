import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge, type CanonicalStatus } from "@/components/ui/status-badge";
import DataTable from "@/components/tables/sales/view/data-table";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type MyCommissionRow = {
	id: string;
	staffId: string;
	appointmentId: string | null;
	salesOrderId: string | null;
	splitPercentage: number;
	calculatedAmount: number;
	status: string;
	notes: string | null;
	createdAt: string | Date;
	// optional enrichment (may come from enriched endpoint)
	serviceName?: string | null;
	branchName?: string | null;
	appointmentNumber?: string | null;
	salesOrderNumber?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}


// ─── SourceCell ───────────────────────────────────────────────────────────────

function SourceCell({ row }: { row: MyCommissionRow }) {
	if (row.appointmentId) {
		const label = row.appointmentNumber
			? `Appointment ${row.appointmentNumber.slice(0, 8)}…`
			: `Appointment ${row.appointmentId.slice(0, 8)}…`;
		return (
			<span className="font-mono text-muted-foreground text-sm">{label}</span>
		);
	}
	if (row.salesOrderId) {
		const label = row.salesOrderNumber
			? `Sale ${row.salesOrderNumber}`
			: `Sale ${row.salesOrderId.slice(0, 8)}…`;
		return (
			<Link
				to="/dashboard/sales/$id"
				params={{ id: row.salesOrderId }}
				className="font-mono text-primary text-sm hover:underline"
			>
				{label}
			</Link>
		);
	}
	return <span className="text-muted-foreground">—</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MyCommissionsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ["my-commissions", organizationId],
		queryFn: () =>
			client.commissionSplits.getMyCommissions({
				organizationId: organizationId ?? "",
			}),
		enabled: !!organizationId,
	});

	const rows: MyCommissionRow[] = (data as any[] | undefined) ?? [];

	// ── Columns ────────────────────────────────────────────────────────────────
	const columns: ColumnDef<MyCommissionRow>[] = [
		{
			id: "createdAt",
			header: "Date",
			cell: ({ row }) => (
				<span className="whitespace-nowrap text-sm">
					{formatDate(row.original.createdAt)}
				</span>
			),
		},
		{
			id: "source",
			header: "Source",
			cell: ({ row }) => <SourceCell row={row.original} />,
		},
		{
			id: "service",
			header: "Service",
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.serviceName ?? (
						<span className="text-muted-foreground">—</span>
					)}
				</span>
			),
		},
		{
			id: "branch",
			header: "Branch",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{row.original.branchName ?? "—"}
				</span>
			),
		},
		{
			id: "splitPercentage",
			header: "Split %",
			cell: ({ row }) => (
				<span className="tabular-nums text-sm">
					{row.original.splitPercentage}%
				</span>
			),
		},
		{
			id: "calculatedAmount",
			header: "Amount",
			cell: ({ row }) => (
				<span className="font-medium tabular-nums text-sm">
					{formatPrice(row.original.calculatedAmount, "MYR")}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<StatusBadge status={row.original.status as CanonicalStatus} />
			),
		},
	];

	// ── Guards ─────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view your commissions.
			</div>
		);
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout variant="error" title="Couldn't load commissions" onRetry={() => refetch()} />
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<div className="space-y-6">
			<DataTable<MyCommissionRow, unknown>
				columns={columns}
				data={rows}
				emptyTitle="No commissions yet"
				emptyDescription="No commission splits found for your account."
			/>
		</div>
	);
}
