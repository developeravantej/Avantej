import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/sales/view/data-table";
import { Separator } from "@/components/ui/separator";
import {
	columns,
	type PayoutRow,
} from "@/components/tables/payouts/view/columns";
import { Banknote } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payouts/view",
)({
	component: PayoutsViewPage,
});

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

	const { data: apiData = [], isLoading, isError, error, refetch } = useQuery({
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

	const data: PayoutRow[] = apiData.map((item: { id: string; recipientId: string; recipientName: string; amount: number; status: string; paidAt: Date | null; appointmentId: string | null; createdAt: Date }) => ({
		id: item.id,
		recipientId: item.recipientId,
		recipientName: item.recipientName,
		amount: item.amount,
		status: item.status,
		paidAt: item.paidAt ? String(item.paidAt) : null,
		appointmentId: item.appointmentId,
		createdAt: item.createdAt ? String(item.createdAt) : null,
	}));

	// Guard: no org selected — BEFORE isLoading check
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view payouts.
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Banknote className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Payouts</h1>
						<p className="text-brand-secondary-1 text-sm">
							Staff and trainer commission payout records.
						</p>
					</div>
				</div>
				{/* No create button — payouts are auto-generated from appointments */}
			</div>

			{/* Status filter tabs */}
			<div className="flex items-center gap-1 border-b">
				{STATUS_TABS.map((tab) => {
					const isActive = statusFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			<Separator />

			{/* Table */}
			<DataTable<PayoutRow, unknown>
					columns={columns}
					data={data}
					emptyTitle="No payouts found"
					error={isError ? error : undefined}
					onRetry={() => refetch()}
				/>
		</div>
	);
}
