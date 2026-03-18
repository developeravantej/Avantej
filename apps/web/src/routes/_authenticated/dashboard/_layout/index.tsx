import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppointmentsWidget } from "@/components/appointments-widget";
import { AnnouncementsWidget } from "@/components/announcements-widget";
import { PayrollWidget } from "@/components/payroll-widget";
import { ClaimsWidget } from "@/components/claims-widget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { BarChart3, ShoppingCart, CalendarCheck, Users, GitBranch } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/_layout/")({
	component: DashboardComponent,
});

type Period = "today" | "this_week" | "this_month" | "this_year";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "this_week", label: "This Week" },
	{ value: "this_month", label: "This Month" },
	{ value: "this_year", label: "This Year" },
];

function formatRM(cents: number): string {
	return `RM ${(cents / 100).toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function getPeriodLabel(period: Period): string {
	return PERIOD_OPTIONS.find((p) => p.value === period)?.label ?? "This Month";
}

// ---- Skeleton helpers ----

function TableRowSkeleton() {
	return (
		<div className="flex items-center justify-between py-2 border-b last:border-0">
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
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">Sales Overview</CardTitle>
				<ShoppingCart className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{!isLoaded ? (
					<div className="space-y-3 pt-1">
						<Skeleton className="h-8 w-40" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-20" />
					</div>
				) : (
					<div className="space-y-1">
						<div className="text-2xl font-bold tracking-tight">
							{formatRM(data.totalSales)}
						</div>
						<p className="text-sm text-muted-foreground">
							{data.salesOrderCount} {data.salesOrderCount === 1 ? "order" : "orders"}
						</p>
						<p className="text-xs text-muted-foreground">{getPeriodLabel(period)}</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function AppointmentsKpiCard({ data }: { data: KpiData | undefined }) {
	const isLoaded = data !== undefined;

	const completionRate =
		data && data.totalAppointments > 0
			? `${((data.completedAppointments / data.totalAppointments) * 100).toFixed(0)}%`
			: "—";

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">Appointments</CardTitle>
				<CalendarCheck className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{!isLoaded ? (
					<div className="space-y-3 pt-1">
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-4 w-20" />
					</div>
				) : (
					<div className="space-y-1">
						<div className="text-2xl font-bold tracking-tight">
							{data.totalAppointments}
						</div>
						<p className="text-sm text-muted-foreground">
							{data.completedAppointments} completed
						</p>
						<p className="text-xs text-muted-foreground">
							Completion rate: <span className="font-medium">{completionRate}</span>
						</p>
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
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">Active Members</CardTitle>
				<Users className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{!isLoaded ? (
					<div className="space-y-3 pt-1">
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-4 w-28" />
					</div>
				) : (
					<div className="space-y-1">
						<div className="text-2xl font-bold tracking-tight">
							{data.activeMembersCount.toLocaleString()}
						</div>
						<p className="text-sm text-muted-foreground">Active Members</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ---- Revenue by Branch ----

function RevenuByBranchCard({ data, isLoading }: { data: KpiData | undefined; isLoading: boolean }) {
	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">Revenue by Branch</CardTitle>
				<GitBranch className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-2 pt-1">
						<TableRowSkeleton />
						<TableRowSkeleton />
						<TableRowSkeleton />
					</div>
				) : !data || data.revenueByBranch.length === 0 ? (
					<p className="text-sm text-muted-foreground py-4 text-center">
						No revenue data for this period
					</p>
				) : (
					<div className="w-full">
						{/* Header */}
						<div className="grid grid-cols-3 text-xs text-muted-foreground font-medium pb-2 border-b">
							<span>Branch</span>
							<span className="text-right">Revenue</span>
							<span className="text-right">Orders</span>
						</div>
						{/* Rows */}
						<div className="divide-y">
							{data.revenueByBranch.map((branch) => (
								<div
									key={branch.branchId}
									className="grid grid-cols-3 py-2 text-sm"
								>
									<span className="truncate pr-4">
										{branch.branchName ?? "Unknown"}
									</span>
									<span className="text-right tabular-nums">
										{formatRM(branch.totalRevenue)}
									</span>
									<span className="text-right tabular-nums text-muted-foreground">
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
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">Staff Performance</CardTitle>
				<BarChart3 className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-2 pt-1">
						<TableRowSkeleton />
						<TableRowSkeleton />
						<TableRowSkeleton />
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex items-center justify-center h-[120px]">
						<p className="text-sm text-muted-foreground">
							No performance data for this period
						</p>
					</div>
				) : (
					<div className="w-full">
						{/* Header */}
						<div className="grid grid-cols-3 text-xs text-muted-foreground font-medium pb-2 border-b">
							<span>Staff ID</span>
							<span className="text-right">Appointments</span>
							<span className="text-right">Commission</span>
						</div>
						{/* Rows — sorted by appointmentsCompleted desc */}
						<div className="divide-y">
							{[...data]
								.sort((a, b) => b.appointmentsCompleted - a.appointmentsCompleted)
								.slice(0, 10)
								.map((staff) => (
									<div
										key={staff.memberId}
										className="grid grid-cols-3 py-2 text-sm"
									>
										<span className="font-mono text-xs">
											{staff.staffId.slice(0, 8)}…
										</span>
										<span className="text-right tabular-nums">
											{staff.appointmentsCompleted}
										</span>
										<span className="text-right tabular-nums text-muted-foreground">
											{formatRM(staff.totalCommission)}
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
	const [period, setPeriod] = useState<Period>("this_month");

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
				// getStaffPerformance only accepts week/month/year — map "today" to "this_week"
				period: period === "today" ? "this_week" : (period as "this_week" | "this_month" | "this_year"),
			}),
		enabled: !!organizationId,
		staleTime: 60 * 1000,
	});

	const kpiData = kpisQuery.data as KpiData | undefined;
	const staffData = staffQuery.data as StaffRow[] | undefined;

	return (
		<div className="space-y-6">
			{/* Period Selector */}
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold tracking-tight">Dashboard</h2>
				<Tabs
					value={period}
					onValueChange={(v) => setPeriod(v as Period)}
				>
					<TabsList>
						{PERIOD_OPTIONS.map((opt) => (
							<TabsTrigger key={opt.value} value={opt.value}>
								{opt.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			{/* Grid */}
			<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
				{/* Top row — existing widgets */}
				<div className="md:col-span-4">
					<AppointmentsWidget />
				</div>
				<div className="md:col-span-8">
					<AnnouncementsWidget />
				</div>

				{/* Middle row — KPI cards */}
				<div className="md:col-span-4">
					<SalesCard data={kpiData} period={period} />
				</div>
				<div className="md:col-span-4">
					<AppointmentsKpiCard data={kpiData} />
				</div>
				<div className="md:col-span-4">
					<ActiveMembersCard data={kpiData} />
				</div>

				{/* Analytics row: Revenue by Branch (8) + Staff Performance (4) */}
				<div className="md:col-span-8">
					<RevenuByBranchCard
						data={kpiData}
						isLoading={kpisQuery.isLoading}
					/>
				</div>
				<div className="md:col-span-4">
					<StaffPerformanceCard
						data={staffData}
						isLoading={staffQuery.isLoading}
					/>
				</div>

				{/* Bottom row — existing widgets */}
				<div className="md:col-span-4">
					<PayrollWidget />
				</div>
				<div className="md:col-span-8">
					<ClaimsWidget />
				</div>
			</div>
		</div>
	);
}
