import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/tables/sales/view/data-table";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/commissions/my",
)({
	component: MyCommissionsPage,
});

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

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function CommissionStatusBadge({ status }: { status: string }) {
	const configs: Record<string, { className: string; label: string }> = {
		pending: {
			className:
				"bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
			label: "Pending",
		},
		approved: {
			className:
				"bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
			label: "Approved",
		},
		paid: {
			className:
				"bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
			label: "Paid",
		},
		void: {
			className:
				"bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100",
			label: "Void",
		},
	};
	const cfg = configs[status] ?? { className: "", label: status };
	return <Badge className={cfg.className}>{cfg.label}</Badge>;
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function MyCommissionsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data, isLoading, error } = useQuery({
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
				<CommissionStatusBadge status={row.original.status} />
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

	if (error) {
		return (
			<div className="flex min-h-96 items-center justify-center text-destructive">
				Failed to load your commissions. Please try again.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent">
					<span className="sr-only">Loading…</span>
				</div>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
					<TrendingUp className="h-5 w-5 text-primary" />
				</div>
				<div>
					<h1 className="font-bold font-heading text-2xl">My Commissions</h1>
					<p className="text-muted-foreground text-sm">
						Your personal commission splits — pending, approved, and paid.
					</p>
				</div>
				<div className="ml-auto">
					<Link to="/dashboard/commissions/view">
						<Button variant="outline" size="sm">
							All Commissions
						</Button>
					</Link>
				</div>
			</div>

			{/* Empty state */}
			{rows.length === 0 ? (
				<div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed">
					<p className="text-muted-foreground text-sm">
						No commission splits found for your account.
					</p>
				</div>
			) : (
				<DataTable<MyCommissionRow, unknown> columns={columns} data={rows} />
			)}
		</div>
	);
}
