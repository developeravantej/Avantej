import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { AppointmentsWidget } from "@/components/appointments-widget";
import { AnnouncementsWidget } from "@/components/announcements-widget";
import { PayrollWidget } from "@/components/payroll-widget";
import { ClaimsWidget } from "@/components/claims-widget";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { formatPrice } from "@/lib/currency";
import { GreetingBanner } from "@/components/dashboard/greeting-banner";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { SectionHeader } from "@/components/dashboard/section-header";
import { QuickInsight } from "@/components/dashboard/quick-insight";
import { ExpiringMembershipsWidget } from "@/components/dashboard/expiring-memberships-widget";

const dashboardSearchSchema = z.object({
	period: z
		.enum(["today", "this_week", "this_month", "this_year"])
		.default("this_month"),
});

export const Route = createFileRoute("/_authenticated/dashboard/_layout/")({
	component: DashboardComponent,
	validateSearch: dashboardSearchSchema,
});

type Period = "today" | "this_week" | "this_month" | "this_year";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "this_week", label: "This Week" },
	{ value: "this_month", label: "This Month" },
	{ value: "this_year", label: "This Year" },
];

function getPeriodLabel(period: Period): string {
	return PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? "This Month";
}

// ---- Skeleton helpers ----

function TableRowSkeleton() {
	return (
		<div className="flex items-center justify-between border-b border-brand-secondary-3 py-3 last:border-0">
			<Skeleton className="h-4 w-36" />
			<Skeleton className="h-4 w-20" />
			<Skeleton className="h-4 w-10" />
		</div>
	);
}

// ---- KPI Cards ----

interface KpiData {
	totalSales: number;
	salesOrderCount: number;
	totalAppointments: number;
	completedAppointments: number;
	activeMembersCount: number;
	revenueByBranch: Array<{
		branchId: string;
		branchName: string | null;
		totalRevenue: number;
		orderCount: number;
	}>;
}

function SalesCard({ data, period }: { data: KpiData | undefined; period: Period }) {
	const isLoaded = data !== undefined;

	return (
		<Card className="h-full">
			<CardContent className="pt-6">
				{!isLoaded ? (
					<div className="space-y-3">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-10 w-40" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-20" />
					</div>
				) : (
					<div className="space-y-1">
						<p className="text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
							Sales Overview
						</p>
						<div className="font-heading text-4xl font-bold text-brand-primary-1">
							{formatPrice(data.totalSales, "MYR")}
						</div>
						<p className="text-sm text-brand-secondary-1">
							{data.salesOrderCount} {data.salesOrderCount === 1 ? "order" : "orders"}
						</p>
						<p className="text-sm text-brand-secondary-1">{getPeriodLabel(period)}</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function AppointmentsKpiCard({ data }: { data: KpiData | undefined }) {
	const isLoaded = data !== undefined;

	const completionPct =
		data && data.totalAppointments > 0
			? (data.completedAppointments / data.totalAppointments) * 100
			: 0;

	const completionRate =
		data && data.totalAppointments > 0
			? `${completionPct.toFixed(0)}%`
			: "—";

	return (
		<Card className="h-full">
			<CardContent className="pt-6">
				{!isLoaded ? (
					<div className="space-y-3">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-10 w-16" />
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-2 w-full rounded-full" />
					</div>
				) : (
					<div className="space-y-2">
						<p className="text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
							Appointments
						</p>
						<div className="font-heading text-4xl font-bold text-brand-primary-1">
							{data.totalAppointments}
						</div>
						<p className="text-sm text-brand-secondary-1">
							{data.completedAppointments} completed &middot; {completionRate}
						</p>
						<div className="h-2 w-full rounded-full bg-brand-secondary-3">
							<div
								className="h-2 rounded-full bg-brand-primary-1 transition-all"
								style={{ width: `${Math.min(completionPct, 100)}%` }}
							/>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function ActiveMembersCard({ data }: { data: KpiData | undefined }) {
	const isLoaded = data !== undefined;

	return (
		<Card className="h-full">
			<CardContent className="pt-6">
				{!isLoaded ? (
					<div className="space-y-3">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-10 w-16" />
						<Skeleton className="h-4 w-28" />
					</div>
				) : (
					<div className="space-y-1">
						<p className="text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
							Active Members
						</p>
						<div className="font-heading text-4xl font-bold text-brand-primary-1">
							{data.activeMembersCount.toLocaleString()}
						</div>
						<p className="text-sm text-brand-secondary-1">Active Members</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ---- Revenue by Branch ----

function RevenueByBranchCard({ data, isLoading }: { data: KpiData | undefined; isLoading: boolean }) {
	return (
		<Card className="h-full">
			<CardContent className="pt-6">
				<p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
					Revenue by Branch
				</p>
				{isLoading ? (
					<div className="space-y-0">
						<TableRowSkeleton />
						<TableRowSkeleton />
						<TableRowSkeleton />
					</div>
				) : !data || data.revenueByBranch.length === 0 ? (
					<p className="py-4 text-center text-sm text-brand-secondary-1">
						No revenue data for this period
					</p>
				) : (
					<div className="w-full">
						<div className="grid grid-cols-3 border-b border-brand-secondary-3 pb-2 text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
							<span>Branch</span>
							<span className="text-right">Revenue</span>
							<span className="text-right">Orders</span>
						</div>
						<div className="divide-y divide-brand-secondary-3">
							{data.revenueByBranch.map((branch) => (
								<div
									key={branch.branchId}
									className="grid grid-cols-3 py-3 text-sm"
								>
									<span className="truncate pr-4 text-brand-primary-1">
										{branch.branchName ?? "Unknown"}
									</span>
									<span className="text-right tabular-nums text-brand-primary-1">
										{formatPrice(branch.totalRevenue, "MYR")}
									</span>
									<span className="text-right tabular-nums text-brand-secondary-1">
										{branch.orderCount}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ---- Staff Performance ----

interface StaffRow {
	staffId: string;
	memberId: string;
	appointmentsCompleted: number;
	totalCommission: number;
}

function StaffPerformanceCard({
	data,
	isLoading,
}: {
	data: StaffRow[] | undefined;
	isLoading: boolean;
}) {
	return (
		<Card className="h-full">
			<CardContent className="pt-6">
				<p className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
					Staff Performance
				</p>
				{isLoading ? (
					<div className="space-y-0">
						<TableRowSkeleton />
						<TableRowSkeleton />
						<TableRowSkeleton />
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex h-[120px] items-center justify-center">
						<p className="text-sm text-brand-secondary-1">
							No performance data for this period
						</p>
					</div>
				) : (
					<div className="w-full">
						<div className="grid grid-cols-3 border-b border-brand-secondary-3 pb-2 text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
							<span>Staff ID</span>
							<span className="text-right">Appointments</span>
							<span className="text-right">Commission</span>
						</div>
						<div className="divide-y divide-brand-secondary-3">
							{[...data]
								.sort((a, b) => b.appointmentsCompleted - a.appointmentsCompleted)
								.slice(0, 10)
								.map((staff) => (
									<div
										key={staff.memberId}
										className="grid grid-cols-3 py-3 text-sm"
									>
										<span className="font-mono text-xs text-brand-primary-1">
											{staff.staffId.slice(0, 8)}&hellip;
										</span>
										<span className="text-right tabular-nums text-brand-primary-1">
											{staff.appointmentsCompleted}
										</span>
										<span className="text-right tabular-nums text-brand-secondary-1">
											{formatPrice(staff.totalCommission, "MYR")}
										</span>
									</div>
								))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ---- Main Component ----

function DashboardComponent() {
	const { period } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	function setPeriod(next: Period) {
		navigate({ search: (prev) => ({ ...prev, period: next }) });
	}

	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";

	const kpisQuery = useQuery({
		queryKey: ["analytics", "kpis", organizationId, period],
		queryFn: () =>
			client.analytics.getDashboardKpis({
				organizationId,
				period,
			}),
		enabled: !!organizationId,
		staleTime: 60 * 1000, // 1 minute
	});

	const staffQuery = useQuery({
		queryKey: ["analytics", "staff", organizationId, period],
		queryFn: () =>
			client.analytics.getStaffPerformance({
				organizationId,
				period,
			}),
		enabled: !!organizationId,
		staleTime: 60 * 1000,
	});

	const kpiData = kpisQuery.data as KpiData | undefined;
	const staffData = staffQuery.data as StaffRow[] | undefined;

	return (
		<div className="space-y-6">
			<GreetingBanner />
			<QuickActions />

			{/* Period Filter Pills */}
			<div className="flex items-center gap-2 flex-wrap">
				{PERIOD_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						onClick={() => setPeriod(opt.value)}
						className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
							period === opt.value
								? "bg-brand-secondary-2 text-brand-primary-1"
								: "border border-brand-secondary-3 bg-card text-brand-primary-1 hover:bg-brand-secondary-3"
						}`}
					>
						{opt.label}
					</button>
				))}
			</div>

			<SectionHeader>Overview</SectionHeader>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Link
					to="/dashboard/sales/view"
					search={{ period, from: "", to: "", status: "", branchId: "", page: 1 }}
					className="transition-transform hover:-translate-y-0.5"
				>
					<SalesCard data={kpiData} period={period} />
				</Link>
				<Link
					to="/dashboard/appointment/view"
					className="transition-transform hover:-translate-y-0.5"
				>
					<AppointmentsKpiCard data={kpiData} />
				</Link>
				<Link
					to="/dashboard/memberships/view"
					className="transition-transform hover:-translate-y-0.5"
				>
					<ActiveMembersCard data={kpiData} />
				</Link>
			</div>

			{kpiData && (
				<QuickInsight
					message={
						kpiData.totalAppointments > 0
							? `You have ${kpiData.totalAppointments} appointment${kpiData.totalAppointments !== 1 ? "s" : ""} ${getPeriodLabel(period).toLowerCase()}, with ${kpiData.completedAppointments} completed — a ${kpiData.totalAppointments > 0 ? `${((kpiData.completedAppointments / kpiData.totalAppointments) * 100).toFixed(0)}%` : "0%"} completion rate.`
							: `Your organization has ${kpiData.activeMembersCount.toLocaleString()} active member${kpiData.activeMembersCount !== 1 ? "s" : ""}. No appointments scheduled for this period.`
					}
				/>
			)}

			<SectionHeader>Analytics</SectionHeader>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
				<div className="lg:col-span-8">
					<RevenueByBranchCard data={kpiData} isLoading={kpisQuery.isLoading} />
				</div>
				<div className="lg:col-span-4">
					<StaffPerformanceCard data={staffData} isLoading={staffQuery.isLoading} />
				</div>
			</div>

			<SectionHeader>Activity</SectionHeader>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
				<div className="lg:col-span-4">
					<AppointmentsWidget />
				</div>
				<div className="lg:col-span-4">
					<ExpiringMembershipsWidget />
				</div>
				<div className="lg:col-span-4">
					<AnnouncementsWidget />
				</div>
			</div>

			<SectionHeader>Team</SectionHeader>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
				<div className="lg:col-span-4">
					<PayrollWidget />
				</div>
				<div className="lg:col-span-8">
					<ClaimsWidget />
				</div>
			</div>
		</div>
	);
}
