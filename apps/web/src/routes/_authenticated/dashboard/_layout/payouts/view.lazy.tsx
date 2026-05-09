import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/sales/view/data-table";
import {
	columns,
	type PayoutRow,
} from "@/components/tables/payouts/view/columns";
import { Banknote } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { formatPrice } from "@/lib/money";

export const Route = createLazyFileRoute(
	"/_authenticated/dashboard/_layout/payouts/view",
)({ component: PayoutsViewPage });

const STATUS_TABS = [
	{ value: undefined, label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "processing", label: "Processing" },
	{ value: "paid", label: "Paid" },
	{ value: "failed", label: "Failed" },
	{ value: "canceled", label: "Canceled" },
] as const;

type PayoutStatus = "pending" | "processing" | "paid" | "failed" | "canceled";

function PayoutsViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [statusFilter, setStatusFilter] = useState<PayoutStatus | undefined>(
		undefined,
	);

	const {
		data: apiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["payouts", organizationId, statusFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.payouts.list({
				organizationId,
				status: statusFilter,
			});
		},
		enabled: !!organizationId,
	});

	const data: PayoutRow[] = apiData.map(
		(item: {
			id: string;
			recipientId: string;
			recipientName: string;
			amount: number;
			status: string;
			paidAt: Date | null;
			appointmentId: string | null;
			createdAt: Date;
			batchId?: string | null;
		}) => ({
			id: item.id,
			recipientId: item.recipientId,
			recipientName: item.recipientName,
			amount: item.amount,
			status: item.status,
			paidAt: item.paidAt ? String(item.paidAt) : null,
			appointmentId: item.appointmentId,
			createdAt: item.createdAt ? String(item.createdAt) : null,
			batchId: item.batchId ?? null,
		}),
	);

	// KPI computations — always run (hooks must not be conditional)
	const pendingRows = data.filter((r) => r.status === "pending");
	const processingRows = data.filter((r) => r.status === "processing");
	const paidRows = data.filter((r) => r.status === "paid");
	const failedRows = data.filter((r) => r.status === "failed");

	const pendingTotal = pendingRows.reduce((s, r) => s + (r.amount ?? 0), 0);
	const paidTotal = paidRows.reduce((s, r) => s + (r.amount ?? 0), 0);

	// Guard: no org selected
	if (!organizationId) {
		return (
			<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
				<div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
					Select an organization to view payouts.
				</div>
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Banknote className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Payouts</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Track payouts to staff and partners
						</p>
					</div>
				</div>
			</div>

			{/* Filter band */}
			<div className="shrink-0 border-b border-border/40 px-6">
				<div className="flex h-10 items-end gap-0">
					{STATUS_TABS.map((tab) => {
						const isActive = statusFilter === tab.value;
						return (
							<button
								key={tab.label}
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => setStatusFilter(tab.value)}
								className={`px-4 pb-2 pt-0 text-sm font-medium border-b-2 transition-colors ${
									isActive
										? "border-foreground text-foreground"
										: "border-transparent text-muted-foreground hover:text-foreground"
								}`}
							>
								{tab.label}
							</button>
						);
					})}
				</div>
			</div>

			{/* Scroll region */}
			<div className="min-h-0 flex-1 overflow-auto p-6 space-y-4">
				{/* KPI strip */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					<div className="rounded-xl border bg-card p-3">
						<div className="text-xs text-muted-foreground">Pending</div>
						<div className="mt-1 text-xl font-semibold tabular-nums">
							{pendingRows.length}
						</div>
						<div className="text-xs text-muted-foreground">
							{formatPrice(pendingTotal, "MYR")} total
						</div>
					</div>
					<div className="rounded-xl border bg-card p-3">
						<div className="text-xs text-muted-foreground">Processing</div>
						<div className="mt-1 text-xl font-semibold tabular-nums">
							{processingRows.length}
						</div>
						<div className="text-xs text-muted-foreground">in progress</div>
					</div>
					<div className="rounded-xl border bg-card p-3">
						<div className="text-xs text-muted-foreground">Paid (this view)</div>
						<div className="mt-1 text-xl font-semibold tabular-nums">
							{formatPrice(paidTotal, "MYR")}
						</div>
						<div className="text-xs text-muted-foreground">
							{paidRows.length} payouts
						</div>
					</div>
					<div
						className={`rounded-xl border p-3 ${
							failedRows.length > 0
								? "bg-amber-50 border-amber-200"
								: "bg-card"
						}`}
					>
						<div
							className={`text-xs ${
								failedRows.length > 0
									? "text-amber-700"
									: "text-muted-foreground"
							}`}
						>
							Failed
						</div>
						<div
							className={`mt-1 text-xl font-semibold tabular-nums ${
								failedRows.length > 0 ? "text-amber-700" : ""
							}`}
						>
							{failedRows.length}
						</div>
						<div
							className={`text-xs ${
								failedRows.length > 0
									? "text-amber-600"
									: "text-muted-foreground"
							}`}
						>
							{failedRows.length > 0 ? "requires attention" : "none"}
						</div>
					</div>
				</div>

				{/* Error callout */}
				{isError && (
					<StatusCallout
						variant="error"
						title="Failed to load payouts"
						onRetry={() => refetch()}
					>
						<p className="text-sm">
							{(error as Error)?.message ?? "An error occurred. Please retry."}
						</p>
					</StatusCallout>
				)}

				{/* Table or empty state */}
				{!isError && data.length === 0 ? (
					<EmptyState
						icon={Banknote}
						title="No payouts found"
						description="Payouts are generated automatically from completed appointments."
					/>
				) : (
					<DataTable<PayoutRow, unknown>
						columns={columns}
						data={data}
						emptyTitle="No payouts found"
						error={isError ? error : undefined}
						onRetry={() => refetch()}
					/>
				)}
			</div>
		</div>
	);
}
