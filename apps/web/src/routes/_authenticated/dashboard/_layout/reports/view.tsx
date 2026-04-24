import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileChartColumnIncreasing } from "lucide-react";

import { requirePermission } from "@/lib/route-guards";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/reports/view",
)({
	beforeLoad: async () => {
		await requirePermission("reports:read");
	},
	component: ReportsPage,
});

type Period = "today" | "this_week" | "this_month" | "this_year";

function formatMYR(cents: number): string {
	return new Intl.NumberFormat("en-MY", {
		style: "currency",
		currency: "MYR",
	}).format(cents / 100);
}

function ReportsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const [period, setPeriod] = useState<Period>("this_month");

	const {
		data: kpis,
		isLoading: kpisLoading,
		isError: kpisError,
		refetch: refetchKpis,
	} = useQuery({
		queryKey: ["reports.kpis", organizationId, period],
		queryFn: async () => {
			if (!organizationId) return null;
			return client.analytics.getDashboardKpis({ organizationId, period });
		},
		enabled: !!organizationId,
	});

	const {
		data: staff = [],
		isLoading: staffLoading,
		isError: staffError,
	} = useQuery({
		queryKey: ["reports.staff", organizationId, period],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.analytics.getStaffPerformance({ organizationId, period });
		},
		enabled: !!organizationId,
	});

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold font-heading">Reports</h1>
				<p className="text-muted-foreground">No organization selected.</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<FileChartColumnIncreasing className="h-6 w-6 text-muted-foreground" />
					<h1 className="text-3xl font-bold font-heading">Reports</h1>
				</div>
				<div className="flex items-center gap-2">
					<Label htmlFor="period" className="text-sm">
						Period
					</Label>
					<Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
						<SelectTrigger id="period" className="w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="today">Today</SelectItem>
							<SelectItem value="this_week">This week</SelectItem>
							<SelectItem value="this_month">This month</SelectItem>
							<SelectItem value="this_year">This year</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{kpisError ? (
				<StatusCallout
					variant="error"
					title="Couldn't load KPIs"
					onRetry={() => refetchKpis()}
				/>
			) : kpisLoading ? (
				<PageLoader />
			) : kpis ? (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<KpiCard
						label="Total Sales"
						value={formatMYR(kpis.totalSales)}
						sub={`${kpis.salesOrderCount} orders`}
					/>
					<KpiCard
						label="Appointments"
						value={String(kpis.totalAppointments)}
						sub={`${kpis.completedAppointments} completed`}
					/>
					<KpiCard
						label="Active Members"
						value={String(kpis.activeMembersCount)}
					/>
					<KpiCard
						label="Branches Reporting"
						value={String(kpis.revenueByBranch.length)}
					/>
				</div>
			) : null}

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Revenue by branch</h2>
				{kpis && kpis.revenueByBranch.length > 0 ? (
					<div className="rounded-lg border bg-card">
						<table className="w-full text-sm">
							<thead className="border-b text-left text-muted-foreground">
								<tr>
									<th className="px-4 py-2 font-medium">Branch</th>
									<th className="px-4 py-2 font-medium">Orders</th>
									<th className="px-4 py-2 font-medium text-right">Revenue</th>
								</tr>
							</thead>
							<tbody>
								{kpis.revenueByBranch.map((r) => (
									<tr key={r.branchId ?? "unknown"} className="border-b last:border-0">
										<td className="px-4 py-2">{r.branchName ?? "—"}</td>
										<td className="px-4 py-2">{r.orderCount}</td>
										<td className="px-4 py-2 text-right">
											{formatMYR(r.totalRevenue)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<EmptyState
						title="No revenue in this period"
						description="Once sales are recorded they'll appear here grouped by branch."
					/>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">Staff performance</h2>
				{staffError ? (
					<StatusCallout variant="error" title="Couldn't load staff performance" />
				) : staffLoading ? (
					<PageLoader />
				) : staff.length > 0 ? (
					<div className="rounded-lg border bg-card">
						<table className="w-full text-sm">
							<thead className="border-b text-left text-muted-foreground">
								<tr>
									<th className="px-4 py-2 font-medium">Staff</th>
									<th className="px-4 py-2 font-medium">Appointments</th>
									<th className="px-4 py-2 font-medium text-right">Commission</th>
								</tr>
							</thead>
							<tbody>
								{staff.map((row) => (
									<tr key={row.staffId} className="border-b last:border-0">
										<td className="px-4 py-2 font-mono text-xs">{row.staffId}</td>
										<td className="px-4 py-2">{row.appointmentCount}</td>
										<td className="px-4 py-2 text-right">
											{formatMYR(row.totalCommission)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<EmptyState
						title="No completed appointments in this period"
						description="Staff performance will populate once appointments are completed and commissions calculated."
					/>
				)}
			</section>
		</div>
	);
}

function KpiCard({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-lg border bg-card p-4">
			<p className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="mt-1 text-2xl font-semibold">{value}</p>
			{sub && <p className="text-xs text-muted-foreground">{sub}</p>}
		</div>
	);
}
