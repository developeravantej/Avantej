import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUserContext } from "@/hooks/useUserContext";
import { useScope } from "@/components/scope/ScopeProvider";
import { orpc } from "@/utils/orpc";

import type { Period } from "./types";
import { PendingApprovalsInline } from "./PendingApprovalsInline";
import { DashboardHeader } from "./DashboardHeader";
import { HeroSection } from "./HeroSection";
import { RevenueTrendCard } from "./RevenueTrendCard";
import { RevenueByBranchCard } from "./RevenueByBranchCard";
import { TopPerformersCard } from "./TopPerformersCard";
import { RecentActivityCard } from "./RecentActivityCard";
import { TodayAppointmentsCard } from "./TodayAppointmentsCard";

export function DashboardPage({
	period,
	onSelectPeriod,
}: {
	period: Period;
	onSelectPeriod: (p: Period) => void;
}) {
	const trendDays =
		period === "today"
			? 1
			: period === "this_week"
				? 7
				: period === "this_year"
					? 365
					: 30;
	const { data: userContext, hasRole } = useUserContext();
	const { scopeNodeId, isAllScope } = useScope();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const currentOrg = userContext?.organizations?.find(
		(o) => o.id === organizationId,
	);
	const orgName = currentOrg?.name ?? "Loading…";
	const isAdminOrManager = hasRole(["admin", "manager"]);

	// ── Queries ──
	const kpisQuery = useQuery({
		...orpc.analytics.getDashboardKpis.queryOptions({
			input: { organizationId: organizationId!, period, branchId: scopeNodeId },
		}),
		enabled: !!organizationId,
	});
	const todayKpisQuery = useQuery({
		...orpc.analytics.getDashboardKpis.queryOptions({
			input: {
				organizationId: organizationId!,
				period: "today",
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId,
	});
	const staffQuery = useQuery({
		...orpc.analytics.getStaffPerformance.queryOptions({
			input: { organizationId: organizationId!, period, branchId: scopeNodeId },
		}),
		enabled: !!organizationId,
	});
	const largestTodayQuery = useQuery({
		...orpc.salesOrders.largestToday.queryOptions({
			input: { organizationId: organizationId!, branchId: scopeNodeId },
		}),
		enabled: !!organizationId,
	});
	const newTodayQuery = useQuery({
		...orpc.members.newToday.queryOptions({
			input: { organizationId: organizationId!, branchId: scopeNodeId },
		}),
		enabled: !!organizationId,
	});
	const auditQuery = useQuery({
		...orpc.auditLogs.list.queryOptions({
			input: {
				organizationId: organizationId!,
				limit: 6,
				offset: 0,
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId,
		staleTime: 30_000,
	});

	// Today's appointments for the timeline strip
	const todayStart = useMemo(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d.toISOString();
	}, []);
	const todayEnd = useMemo(() => {
		const d = new Date();
		d.setHours(23, 59, 59, 999);
		return d.toISOString();
	}, []);
	const apptsTodayQuery = useQuery({
		...orpc.appointments.list.queryOptions({
			input: {
				organizationId: organizationId!,
				startFrom: todayStart,
				startTo: todayEnd,
				limit: 50,
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId,
	});

	const revenueSeriesQuery = useQuery({
		...orpc.analytics.getRevenueSeries.queryOptions({
			input: {
				organizationId: organizationId!,
				days: trendDays,
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const kpis = kpisQuery.data;
	const todayKpis = todayKpisQuery.data;
	const staff = staffQuery.data ?? [];
	const auditRows = auditQuery.data?.rows ?? [];
	const appts = apptsTodayQuery.data ?? [];

	// Real prev-period delta from analytics.previousPeriodSales
	const revenueDelta = useMemo(() => {
		const curr = kpis?.totalSales ?? 0;
		const prev = kpis?.previousPeriodSales ?? 0;
		if (prev <= 0) return curr > 0 ? null : null; // no baseline to compare against
		return ((curr - prev) / prev) * 100;
	}, [kpis?.totalSales, kpis?.previousPeriodSales]);

	// Number of days covered by the selected period (used for Avg/day)
	const periodDays = useMemo(() => {
		if (!kpis?.from || !kpis?.to) return 1;
		const ms =
			new Date(kpis.to as unknown as string).getTime() -
			new Date(kpis.from as unknown as string).getTime();
		return Math.max(1, Math.round(ms / 86_400_000));
	}, [kpis?.from, kpis?.to]);

	// Daily revenue series for the chart (cents kept for formatPrice in tooltip)
	const revenueChartData = useMemo(() => {
		return (revenueSeriesQuery.data ?? []).map((d, i) => ({
			day: i,
			revenue: d.revenueCents,
		}));
	}, [revenueSeriesQuery.data]);

	// Appointments timeline buckets
	const hourBuckets = useMemo(() => {
		const map = new Map<number, number>();
		for (const a of appts) {
			const h = new Date(a.startTime as unknown as string).getHours();
			map.set(h, (map.get(h) ?? 0) + 1);
		}
		return map;
	}, [appts]);

	if (!organizationId) {
		return (
			<div className="-m-6 flex h-screen items-center justify-center text-muted-foreground">
				Select an organization to continue.
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				{/* ░░ TOP APP BAR ░░ */}
				<DashboardHeader
					period={period}
					onSelectPeriod={onSelectPeriod}
					onRefresh={() => kpisQuery.refetch()}
				/>

				{/* ░░ MAIN CONTENT ░░ */}
				<main className="space-y-6 px-7 py-6">
					{/* ── HERO ── */}
					<HeroSection
						orgName={orgName}
						period={period}
						revenueDelta={revenueDelta}
						kpis={kpis}
						kpisLoading={kpisQuery.isLoading}
						kpisError={kpisQuery.isError}
						onRetryKpis={() => kpisQuery.refetch()}
						todayKpis={todayKpis}
						todayLoading={todayKpisQuery.isLoading}
						todayError={todayKpisQuery.isError}
						onRetryToday={() => todayKpisQuery.refetch()}
						largestToday={largestTodayQuery.data}
						largestLoading={largestTodayQuery.isLoading}
						largestError={largestTodayQuery.isError}
						onRetryLargest={() => largestTodayQuery.refetch()}
						newTodayCount={newTodayQuery.data?.count}
						isAllScope={isAllScope}
					/>

					{/* ── ANALYTICS HEADER (admin/manager only) ── */}
					{isAdminOrManager && (
						<div className="flex items-center justify-between">
							<h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								Analytics
							</h2>
							<Link
								to="/dashboard/sales/view"
								search={{
									from: "",
									to: "",
									status: "",
									branchId: "",
									kpiPeriod: "month",
									refundStatus: "all",
									tab: "sales",
								}}
								className="text-xs font-medium text-muted-foreground hover:text-foreground"
							>
								View all →
							</Link>
						</div>
					)}

					{/* ── 12-col grid ── */}
					<section className="grid grid-cols-12 gap-5">
						{/* Revenue trend (admin/manager only) */}
						{isAdminOrManager && (
							<RevenueTrendCard
								period={period}
								trendDays={trendDays}
								kpis={kpis}
								periodDays={periodDays}
								revenueDelta={revenueDelta}
								revenueChartData={revenueChartData}
								kpisError={kpisQuery.isError}
								onRetryKpis={() => kpisQuery.refetch()}
								revenueSeriesLoading={revenueSeriesQuery.isLoading}
								revenueSeriesError={revenueSeriesQuery.isError}
								onRetryRevenueSeries={() => revenueSeriesQuery.refetch()}
							/>
						)}

						{/* Revenue by branch (admin/manager only) */}
						{isAdminOrManager && (
							<RevenueByBranchCard
								kpis={kpis}
								kpisError={kpisQuery.isError}
								onRetry={() => kpisQuery.refetch()}
							/>
						)}

						{/* Needs attention (visible to all) */}
						<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-4">
							<div className="mb-4 flex items-start justify-between">
								<div>
									<div className="flex items-center gap-2 text-sm font-semibold">
										Needs attention
									</div>
									<div className="mt-0.5 text-xs text-muted-foreground">
										Pending approvals
									</div>
								</div>
							</div>
							<PendingApprovalsInline organizationId={organizationId} />
						</div>

						{/* Top performers (admin/manager only) */}
						{isAdminOrManager && (
							<TopPerformersCard
								period={period}
								staff={staff}
								isLoading={staffQuery.isLoading}
								isError={staffQuery.isError}
								onRetry={() => staffQuery.refetch()}
							/>
						)}

						{/* Recent activity (admin/manager only) */}
						{isAdminOrManager && (
							<RecentActivityCard
								auditRows={auditRows}
								isLoading={auditQuery.isLoading}
								isError={auditQuery.isError}
								onRetry={() => auditQuery.refetch()}
							/>
						)}

						{/* Today's appointments timeline (visible to all) */}
						<TodayAppointmentsCard
							appts={appts}
							hourBuckets={hourBuckets}
							isError={apptsTodayQuery.isError}
							onRetry={() => apptsTodayQuery.refetch()}
						/>
					</section>

					<div className="py-4 text-center text-[11px] text-[#a3a3a3]">
						Avantej Core · {orgName}
					</div>
				</main>
			</div>
		</TooltipProvider>
	);
}
