import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	AlertTriangle,
	Calendar,
	ChevronRight,
	Plus,
	RefreshCw,
} from "lucide-react";
import { AreaChart, Area, XAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";

// ─── Route ────────────────────────────────────────────────────────────────────

const dashboardSearchSchema = z.object({
	period: z
		.enum(["today", "this_week", "this_month", "this_year"])
		.default("this_month"),
});

export const Route = createFileRoute("/_authenticated/dashboard/_layout/")({
	// Pure SaaS owners (platform admin with no org membership) get the
	// platform-admin Mission Control instead of the tenant dashboard, which
	// would otherwise fire org-scoped queries and 403 ("not a member").
	beforeLoad: async () => {
		try {
			const me = await client.admin.me({});
			if (me.isPlatformAdmin) {
				const ctx = await client.auth.userContext({});
				if (!ctx?.organizations || ctx.organizations.length === 0) {
					throw redirect({ to: "/dashboard/platform-admin" });
				}
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			// Non-admin or transient error: fall through to the tenant dashboard.
		}
	},
	component: DashboardComponent,
	validateSearch: dashboardSearchSchema,
});

type Period = "today" | "this_week" | "this_month" | "this_year";

const PERIODS: { value: Period; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "this_week", label: "Week" },
	{ value: "this_month", label: "Month" },
	{ value: "this_year", label: "Year" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
	if (!name) return "??";
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeAgo(date: string | Date | null | undefined): string {
	if (!date) return "—";
	const diff = Date.now() - new Date(date).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

function formatToday(): string {
	return new Date().toLocaleDateString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function severityLabel(severity: string | undefined): string {
	if (severity === "danger") return "Error";
	if (severity === "warning") return "Warning";
	return "Info";
}

function severityDotColor(severity: string | undefined): string {
	if (severity === "danger") return "bg-destructive";
	if (severity === "warning") return "bg-amber-500";
	return "bg-blue-500";
}

const revenueChartConfig = {
	revenue: { label: "Revenue (MYR)", color: "#0a0a0a" },
} satisfies ChartConfig;


// ─── Component ────────────────────────────────────────────────────────────────

function DashboardComponent() {
	const { period } = Route.useSearch();
	const navigate = Route.useNavigate();
	const trendDays = period === "today" ? 1 : period === "this_week" ? 7 : period === "this_year" ? 365 : 30;
	const { data: userContext, hasRole } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const currentOrg = userContext?.organizations?.find(
		(o) => o.id === organizationId,
	);
	const orgName = currentOrg?.name ?? "Loading…";
	const isAdminOrManager = hasRole(["admin", "manager"]);

	// ── Queries ──
	const kpisQuery = useQuery({
		queryKey: ["dashboardKpis", organizationId, period],
		queryFn: () =>
			client.analytics.getDashboardKpis({ organizationId: organizationId!, period }),
		enabled: !!organizationId,
	});
	const todayKpisQuery = useQuery({
		queryKey: ["dashboardKpis", organizationId, "today"],
		queryFn: () =>
			client.analytics.getDashboardKpis({ organizationId: organizationId!, period: "today" }),
		enabled: !!organizationId,
	});
	const staffQuery = useQuery({
		queryKey: ["staffPerformance", organizationId, period],
		queryFn: () =>
			client.analytics.getStaffPerformance({ organizationId: organizationId!, period }),
		enabled: !!organizationId,
	});
	const largestTodayQuery = useQuery({
		queryKey: ["salesOrders", "largestToday", organizationId],
		queryFn: () => client.salesOrders.largestToday({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});
	const newTodayQuery = useQuery({
		queryKey: ["members", "newToday", organizationId],
		queryFn: () => client.members.newToday({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});
	const auditQuery = useQuery({
		queryKey: ["auditLogs", "list", organizationId, "home"],
		queryFn: () =>
			client.auditLogs.list({ organizationId: organizationId!, limit: 6, offset: 0 }),
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
		queryKey: ["appointments", "today", organizationId],
		queryFn: () =>
			client.appointments.list({
				organizationId: organizationId!,
				startFrom: todayStart,
				startTo: todayEnd,
				limit: 50,
			}),
		enabled: !!organizationId,
	});

	const revenueSeriesQuery = useQuery({
		queryKey: ["revenueSeries", organizationId, trendDays],
		queryFn: () =>
			client.analytics.getRevenueSeries({
				organizationId: organizationId!,
				days: trendDays,
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
			<header className="sticky top-0 z-20 flex h-14 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Dashboard</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Overview</span>
				</div>

				{/* Period selector pills */}
				<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
					{PERIODS.map((p) => (
						<button
							key={p.value}
							type="button"
							onClick={() => navigate({ search: { period: p.value } })}
							className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
								period === p.value
									? "bg-[#0a0a0a] text-white"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{p.label}
						</button>
					))}
				</div>

				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={() => kpisQuery.refetch()}
						className="rounded-lg p-2 text-muted-foreground transition hover:bg-[#f3f3f3] hover:text-foreground"
						title="Refresh"
					>
						<RefreshCw className="size-4" />
					</button>
					<div className="mx-1 h-6 w-px bg-[#e5e5e5]" />
					<Link
						to="/dashboard/sales/create"
						className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
					>
						<Plus className="size-3.5" />
						New Sale
					</Link>
				</div>
			</header>

			{/* ░░ MAIN CONTENT ░░ */}
			<main className="space-y-6 px-7 py-6">

				{/* ── HERO ── */}
				<section className="relative grid grid-cols-1 gap-8 overflow-hidden rounded-3xl border border-[#e5e5e5] bg-gradient-to-br from-white to-[#fafafa] p-7 lg:grid-cols-[1fr_400px]">
					<div className="absolute -top-32 right-0 size-[380px] rounded-full bg-[radial-gradient(circle,_rgba(214,205,177,0.35)_0%,_transparent_70%)] pointer-events-none" />

					<div className="relative z-10">
						<div className="mb-3 flex items-center gap-3">
							<span className="relative flex size-1.5">
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
								<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
							</span>
							<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{orgName} · Live
							</span>
							<span className="text-[#a3a3a3]">·</span>
							<span className="text-xs text-muted-foreground">{formatToday()}</span>
						</div>

						<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{period === "today"
								? "Today's revenue"
								: period === "this_week"
									? "Week-to-date revenue"
									: period === "this_year"
										? "Year-to-date revenue"
										: "Month-to-date revenue"}
						</div>

						<div className="mt-1 flex items-baseline gap-3">
							{kpisQuery.isLoading ? (
								<Skeleton className="h-14 w-72" />
							) : kpisQuery.isError ? (
								<span className="flex items-center gap-2 text-destructive">
									<AlertTriangle className="size-5 shrink-0" />
									<span className="text-lg font-semibold">Failed to load</span>
									<button
										type="button"
										onClick={() => kpisQuery.refetch()}
										className="text-sm underline underline-offset-2 hover:opacity-70"
									>
										Retry
									</button>
								</span>
							) : (
								<span className="font-mono text-6xl font-extrabold leading-none tracking-tight tabular-nums">
									{formatPrice(kpis?.totalSales ?? 0, "MYR")}
								</span>
							)}
							{!kpisQuery.isError && revenueDelta !== null && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Badge
											variant="outline"
											className={`mb-2 cursor-default gap-1 text-[11px] font-bold ${
												revenueDelta >= 0
													? "border-emerald-200 bg-emerald-100 text-emerald-700"
													: "border-rose-200 bg-rose-100 text-rose-700"
											}`}
										>
											{revenueDelta >= 0 ? "▲" : "▼"}{" "}
											{Math.abs(revenueDelta).toFixed(1)}%
										</Badge>
									</TooltipTrigger>
									<TooltipContent>vs previous period</TooltipContent>
								</Tooltip>
							)}
						</div>

						<div className="mt-2 text-sm text-muted-foreground">
							<span className="font-mono font-semibold tabular-nums text-foreground">
								{kpis?.salesOrderCount ?? 0} orders
							</span>
							<span className="mx-2 text-[#a3a3a3]">·</span>
							<span className="font-mono font-semibold tabular-nums text-foreground">
								{kpis?.activeMembersCount ?? 0} active members
							</span>
						</div>

						<div className="mt-7 flex items-center gap-2">
							<Link
								to="/dashboard/sales/create"
								className="flex items-center gap-1.5 rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#262626]"
							>
								<Plus className="size-3.5" />
								New Sale
							</Link>
						</div>
					</div>

					{/* 2x2 KPI grid */}
					<div className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-2xl border border-[#e5e5e5] bg-[#e5e5e5]">
						<KpiTile
							label="Today's Revenue"
							loading={todayKpisQuery.isLoading}
							isError={todayKpisQuery.isError}
							onRetry={() => todayKpisQuery.refetch()}
							value={formatPrice(todayKpis?.totalSales ?? 0, "MYR")}
							subline={`${todayKpis?.salesOrderCount ?? 0} orders`}
							chip={todayKpis?.totalSales ? "▲ live" : undefined}
							chipTone="green"
						/>
						<KpiTile
							label="Appointments"
							loading={todayKpisQuery.isLoading}
							isError={todayKpisQuery.isError}
							onRetry={() => todayKpisQuery.refetch()}
							value={`${todayKpis?.completedAppointments ?? 0} / ${todayKpis?.totalAppointments ?? 0}`}
							progressPct={
								todayKpis?.totalAppointments
									? (todayKpis.completedAppointments / todayKpis.totalAppointments) * 100
									: 0
							}
							progressLabel={
								todayKpis?.totalAppointments
									? `${Math.round((todayKpis.completedAppointments / todayKpis.totalAppointments) * 100)}% completed`
									: "No appointments today"
							}
						/>
						<KpiTile
							label="Active Members"
							loading={kpisQuery.isLoading}
							isError={kpisQuery.isError}
							onRetry={() => kpisQuery.refetch()}
							value={String(kpis?.activeMembersCount ?? 0)}
							subline={
								newTodayQuery.data?.count
									? `+${newTodayQuery.data.count} new today`
									: "no new joiners"
							}
							chip={newTodayQuery.data?.count ? `+${newTodayQuery.data.count}` : undefined}
							chipTone="green"
						/>
						<KpiTile
							label="Largest Sale Today"
							loading={largestTodayQuery.isLoading}
							isError={largestTodayQuery.isError}
							onRetry={() => largestTodayQuery.refetch()}
							value={
								largestTodayQuery.data
									? formatPrice(largestTodayQuery.data.totalAmount, "MYR")
									: "—"
							}
							subline={
								largestTodayQuery.data
									? largestTodayQuery.data.customerName ?? "Customer"
									: "no sales yet"
							}
						/>
					</div>
				</section>

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
					<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-8">
						<div className="mb-5 flex items-start justify-between">
							<div>
								<div className="text-sm font-semibold">Revenue trend</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									{period === "today"
										? "Today · all branches"
										: period === "this_week"
											? "Last 7 days · all branches"
											: period === "this_year"
												? "Last 365 days · all branches"
												: "Last 30 days · all branches"}
								</div>
							</div>
						</div>

						{kpisQuery.isError ? (
							<div className="flex items-center gap-2 py-4 text-destructive text-sm">
								<AlertTriangle className="size-4 shrink-0" />
								<span>Failed to load revenue data.</span>
								<button
									type="button"
									onClick={() => { void kpisQuery.refetch(); void revenueSeriesQuery.refetch(); }}
									className="underline underline-offset-2 hover:opacity-70"
								>
									Retry
								</button>
							</div>
						) : (
							<>
								<div className="mb-5 grid grid-cols-3 gap-6">
									<TrendStat
										label="This period"
										value={formatPrice(kpis?.totalSales ?? 0, "MYR")}
										tooltip="Total revenue collected in the selected period"
									/>
									<TrendStat
										label="Avg / day"
										value={formatPrice(
											Math.round((kpis?.totalSales ?? 0) / periodDays),
											"MYR",
										)}
										tooltip={`Daily average over ${periodDays} day${periodDays === 1 ? "" : "s"}`}
									/>
									<TrendStat
										label="vs prev"
										value={
											revenueDelta !== null
												? `${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(1)}%`
												: "—"
										}
										tone={
											revenueDelta === null
												? undefined
												: revenueDelta >= 0
													? "green"
													: "red"
										}
										tooltip="Change vs. the same-length period immediately before"
									/>
								</div>

								{revenueSeriesQuery.isLoading ? (
									<Skeleton className="h-40 w-full" />
								) : revenueSeriesQuery.isError ? (
									<div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] text-destructive text-sm">
										<AlertTriangle className="size-4 shrink-0" />
										<span>Chart failed to load.</span>
										<button
											type="button"
											onClick={() => revenueSeriesQuery.refetch()}
											className="underline underline-offset-2 hover:opacity-70"
										>
											Retry
										</button>
									</div>
								) : (
									<ChartContainer config={revenueChartConfig} className="!aspect-auto h-40 w-full">
										<AreaChart
											data={revenueChartData}
											margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
										>
											<defs>
												<linearGradient id="trendgrad" x1="0" y1="0" x2="0" y2="1">
													<stop offset="0%" stopColor="#0a0a0a" stopOpacity={0.18} />
													<stop offset="100%" stopColor="#0a0a0a" stopOpacity={0} />
												</linearGradient>
											</defs>
											<XAxis dataKey="day" hide />
											<ChartTooltip
												content={
													<ChartTooltipContent
														formatter={(value) => formatPrice(Number(value), "MYR")}
														hideLabel
													/>
												}
											/>
											<Area
												type="monotone"
												dataKey="revenue"
												stroke="#0a0a0a"
												strokeWidth={2}
												fill="url(#trendgrad)"
												dot={false}
											/>
										</AreaChart>
									</ChartContainer>
								)}
								<div className="mt-2 flex justify-between text-[10px] font-medium text-[#a3a3a3]">
									<span>{period === "today" ? "Start of day" : `${trendDays}d ago`}</span>
									{period !== "today" && (
										<>
											<span>{Math.round((trendDays * 3) / 4)}d ago</span>
											<span>{Math.round(trendDays / 2)}d ago</span>
											<span>{Math.round(trendDays / 4)}d ago</span>
										</>
									)}
									<span>Today</span>
								</div>
							</>
						)}
					</div>
					)}

					{/* Revenue by branch (admin/manager only) */}
					{isAdminOrManager && (
					<div className="col-span-12 flex flex-col rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-4">
						<div className="mb-5 flex items-start justify-between">
							<div>
								<div className="text-sm font-semibold">Revenue by branch</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									{kpis?.revenueByBranch?.length ?? 0} branches
								</div>
							</div>
						</div>

						{kpisQuery.isError ? (
							<div className="flex flex-1 items-center justify-center gap-2 text-destructive text-sm">
								<AlertTriangle className="size-4 shrink-0" />
								<span>Failed to load.</span>
								<button
									type="button"
									onClick={() => kpisQuery.refetch()}
									className="underline underline-offset-2 hover:opacity-70"
								>
									Retry
								</button>
							</div>
						) : (
							<div className="space-y-4">
								{(kpis?.revenueByBranch ?? []).map((b, idx) => {
									const total = kpis?.totalSales ?? 1;
									const pct = total > 0 ? (b.totalRevenue / total) * 100 : 0;
									const colors = ["#0a0a0a", "#d6cdb1", "#a3a3a3", "#737373"];
									return (
										<div key={b.branchId}>
											<div className="mb-1.5 flex items-baseline justify-between">
												<div className="flex items-center gap-2">
													<div
														className="size-2 rounded-sm"
														style={{ background: colors[idx % colors.length] }}
													/>
													<span className="text-xs font-medium">
														{b.branchName ?? "Unnamed"}
													</span>
												</div>
												<span className="font-mono text-sm font-bold tabular-nums">
													{formatPrice(b.totalRevenue, "MYR")}
												</span>
											</div>
											<Tooltip>
												<TooltipTrigger asChild>
													<Progress
														value={pct}
														className="h-1 bg-[#e5e5e5]"
														indicatorStyle={{ backgroundColor: colors[idx % colors.length] }}
													/>
												</TooltipTrigger>
												<TooltipContent>
													{pct < 1 ? "<1" : pct.toFixed(1)}% of total · {b.orderCount} orders
												</TooltipContent>
											</Tooltip>
											<div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
												<span>{b.orderCount} orders</span>
												<span className="font-mono tabular-nums">
													{pct < 1 ? "<1" : pct.toFixed(0)}%
												</span>
											</div>
										</div>
									);
								})}
								{(kpis?.revenueByBranch?.length ?? 0) === 0 && (
									<div className="text-xs text-muted-foreground italic">
										No branch revenue yet for this period.
									</div>
								)}
							</div>
						)}

						<Link
							to="/dashboard/branch/view"
							className="mt-auto pt-5 text-left text-xs font-semibold text-foreground hover:underline"
						>
							View all branches →
						</Link>
					</div>
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
					<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-4">
						<div className="mb-4 flex items-start justify-between">
							<div>
								<div className="text-sm font-semibold">Top performers</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									This {period.replace("this_", "")} · by sessions
								</div>
							</div>
						</div>

						<ul className="space-y-3">
							{staffQuery.isLoading
								? Array.from({ length: 4 }).map((_, i) => (
										<li key={i} className="flex items-center gap-3">
											<Skeleton className="size-7 rounded-full" />
											<Skeleton className="h-3 flex-1" />
										</li>
									))
								: staffQuery.isError
									? (
										<li className="flex items-center gap-2 text-destructive text-xs">
											<AlertTriangle className="size-3.5 shrink-0" />
											<span>Failed to load.</span>
											<button
												type="button"
												onClick={() => staffQuery.refetch()}
												className="underline underline-offset-2 hover:opacity-70"
											>
												Retry
											</button>
										</li>
									)
									: staff.slice(0, 4).map((s, idx) => {
											const displayName =
												s.staffName ??
												(s.staffId ? `Staff ${s.staffId.slice(0, 6)}` : "Unknown");
											return (
												<li
													key={s.staffId}
													className={`flex items-center gap-3 ${
														s.appointmentsCompleted === 0 ? "opacity-50" : ""
													}`}
												>
													<Tooltip>
														<TooltipTrigger asChild>
															<div className="relative shrink-0">
																<Avatar className="size-7">
																	<AvatarFallback
																		className={`text-[11px] font-bold ${
																			idx === 0
																				? "bg-[#0a0a0a] text-white"
																				: "bg-[#f3f3f3] text-foreground"
																		}`}
																	>
																		{getInitials(displayName)}
																	</AvatarFallback>
																</Avatar>
																{idx === 0 && (
																	<span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#d6cdb1] text-[9px] font-bold">
																		#1
																	</span>
																)}
															</div>
														</TooltipTrigger>
														<TooltipContent>{displayName}</TooltipContent>
													</Tooltip>
													<div className="min-w-0 flex-1">
														<div className="truncate text-xs font-semibold">
															{displayName}
														</div>
														<div className="text-[10px] text-muted-foreground">
															{s.appointmentsCompleted} sessions
														</div>
													</div>
													<div className="text-right">
														<div className="font-mono text-xs font-bold tabular-nums">
															{formatPrice(s.totalCommission ?? 0, "MYR")}
														</div>
													</div>
												</li>
											);
										})}
							{!staffQuery.isLoading && !staffQuery.isError && staff.length === 0 && (
								<li className="text-xs italic text-muted-foreground">
									No staff activity for this period.
								</li>
							)}
						</ul>
					</div>
					)}

					{/* Recent activity (admin/manager only) */}
					{isAdminOrManager && (
					<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-4">
						<div className="mb-4 flex items-start justify-between">
							<div>
								<div className="text-sm font-semibold">Recent activity</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									Live audit stream
								</div>
							</div>
							<span className="relative flex size-1.5">
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
								<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
							</span>
						</div>

						<ul className="space-y-3.5">
							{auditQuery.isLoading
								? Array.from({ length: 5 }).map((_, i) => (
										<li key={i} className="flex gap-3">
											<Skeleton className="size-1.5 rounded-full" />
											<Skeleton className="h-3 flex-1" />
										</li>
									))
								: auditQuery.isError
									? (
										<li className="flex items-center gap-2 text-destructive text-xs">
											<AlertTriangle className="size-3.5 shrink-0" />
											<span>Failed to load activity.</span>
											<button
												type="button"
												onClick={() => auditQuery.refetch()}
												className="underline underline-offset-2 hover:opacity-70"
											>
												Retry
											</button>
										</li>
									)
									: auditRows.slice(0, 5).map((row: any) => (
											<li key={row.id} className="flex gap-3 text-xs">
												<Tooltip>
													<TooltipTrigger asChild>
														<div
															className={`mt-1.5 size-1.5 shrink-0 cursor-default rounded-full ${severityDotColor(row.severity)}`}
														/>
													</TooltipTrigger>
													<TooltipContent>{severityLabel(row.severity)}</TooltipContent>
												</Tooltip>
												<div className="min-w-0">
													<div className="truncate">
														<b>{row.actorName ?? "System"}</b>{" "}
														<span className="text-muted-foreground">
															· {row.action}
														</span>
													</div>
													<div className="mt-0.5 text-[10px] text-muted-foreground">
														{timeAgo(row.createdAt)}
													</div>
												</div>
											</li>
										))}
							{!auditQuery.isLoading && !auditQuery.isError && auditRows.length === 0 && (
								<li className="text-xs italic text-muted-foreground">
									No recent activity.
								</li>
							)}
						</ul>

						<Link
							to="/dashboard/audit/view"
							className="mt-5 block text-left text-xs font-semibold text-foreground hover:underline"
						>
							Open full audit log →
						</Link>
					</div>
					)}

					{/* Today's appointments timeline (visible to all) */}
					<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md">
						<div className="mb-5 flex items-center justify-between">
							<div>
								<div className="text-sm font-semibold">Today's appointments</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									{apptsTodayQuery.isError
										? "Could not load"
										: `${appts.length} booking${appts.length === 1 ? "" : "s"}`}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Link
									to="/dashboard/appointment/view"
									className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-[#f3f3f3] hover:text-foreground"
								>
									<Calendar className="mr-1 inline size-3.5" /> Open calendar
								</Link>
							</div>
						</div>

						{apptsTodayQuery.isError ? (
							<div className="flex h-32 items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] text-destructive text-sm">
								<AlertTriangle className="size-4 shrink-0" />
								<span>Failed to load appointments.</span>
								<button
									type="button"
									onClick={() => apptsTodayQuery.refetch()}
									className="underline underline-offset-2 hover:opacity-70"
								>
									Retry
								</button>
							</div>
						) : (
							<>
								<div className="grid grid-cols-15 gap-0.5 text-[10px] font-medium text-muted-foreground">
									{Array.from({ length: 15 }, (_, i) => i + 8).map((h) => (
										<span key={h} className="text-center">{h}</span>
									))}
								</div>

								<div
									className="mt-2 grid h-24 gap-0.5 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-2"
									style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
								>
									{Array.from({ length: 15 }, (_, i) => i + 8).map((h) => {
										const n = hourBuckets.get(h) ?? 0;
										if (n === 0) return <div key={h} />;
										return (
											<Tooltip key={h}>
												<TooltipTrigger asChild>
													<div className="flex flex-col items-center justify-center gap-1 rounded-md bg-[#0a0a0a] px-1 py-1 text-[10px] font-bold text-white cursor-default">
														<span>{h}:00</span>
														<span className="font-mono opacity-70">×{n}</span>
													</div>
												</TooltipTrigger>
												<TooltipContent>{n} booking{n === 1 ? "" : "s"} at {h}:00</TooltipContent>
											</Tooltip>
										);
									})}
								</div>
							</>
						)}
					</div>
				</section>

				<div className="py-4 text-center text-[11px] text-[#a3a3a3]">
					Avantej Core · {orgName}
				</div>
			</main>
		</div>
		</TooltipProvider>
	);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiTile(props: {
	label: string;
	value: string;
	subline?: string;
	chip?: string;
	chipTone?: "green" | "amber" | "red";
	progressPct?: number;
	progressLabel?: string;
	loading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
}) {
	const chipBg =
		props.chipTone === "green"
			? "border-emerald-200 bg-emerald-100 text-emerald-700"
			: props.chipTone === "amber"
				? "border-amber-200 bg-amber-100 text-amber-700"
				: "border-rose-200 bg-rose-100 text-rose-700";

	return (
		<div className="bg-white p-5">
			<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
				{props.label}
			</div>
			{props.loading ? (
				<Skeleton className="mt-2 h-7 w-24" />
			) : props.isError ? (
				<div className="mt-2 flex items-center gap-1.5 text-destructive text-xs">
					<AlertTriangle className="size-3.5 shrink-0" />
					<span>—</span>
					{props.onRetry && (
						<button
							type="button"
							onClick={props.onRetry}
							className="underline underline-offset-2 hover:opacity-70"
						>
							Retry
						</button>
					)}
				</div>
			) : (
				<div className="mt-2 font-mono text-2xl font-bold tabular-nums">
					{props.value}
				</div>
			)}
			{!props.isError && props.progressPct !== undefined ? (
				<>
					<Progress
						value={props.progressPct}
						className="mt-1.5 h-1 bg-[#e5e5e5]"
						indicatorClassName="bg-blue-600"
					/>
					<div className="mt-1 text-[11px] text-muted-foreground">
						{props.progressLabel}
					</div>
				</>
			) : !props.isError ? (
				<div className="mt-1 flex items-center gap-2 text-[11px]">
					{props.chip && (
						<Badge variant="outline" className={`px-2 py-0.5 text-[10px] font-bold ${chipBg}`}>
							{props.chip}
						</Badge>
					)}
					{props.subline && (
						<span className="text-muted-foreground">{props.subline}</span>
					)}
				</div>
			) : null}
		</div>
	);
}

function TrendStat(props: {
	label: string;
	value: string;
	tone?: "green" | "red";
	tooltip?: string;
}) {
	const toneClass =
		props.tone === "green"
			? "text-emerald-600"
			: props.tone === "red"
				? "text-rose-600"
				: "";
	const inner = (
		<div className={props.tooltip ? "cursor-default" : undefined}>
			<div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				{props.label}
			</div>
			<div className={`mt-1 font-mono text-xl font-bold tabular-nums ${toneClass}`}>
				{props.value}
			</div>
		</div>
	);
	if (!props.tooltip) return inner;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{inner}</TooltipTrigger>
			<TooltipContent>{props.tooltip}</TooltipContent>
		</Tooltip>
	);
}

function PendingApprovalsInline({ organizationId }: { organizationId: string }) {
	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ["packageInstances", "listPending", organizationId],
		queryFn: () =>
			client.packageInstances.listPending({ organizationId, limit: 5 }),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const rows = (data ?? []) as Array<{
		id: string;
		customerName: string | null;
		serviceName: string | null;
		totalPrice: number | null;
		createdAt: string | Date;
	}>;

	if (isLoading) {
		return (
			<ul className="space-y-2.5">
				{Array.from({ length: 3 }).map((_, i) => (
					<li key={i} className="flex items-center gap-3">
						<Skeleton className="size-7 rounded-full" />
						<Skeleton className="h-3 flex-1" />
					</li>
				))}
			</ul>
		);
	}

	if (isError) {
		return (
			<div className="flex items-center gap-2 text-destructive text-xs">
				<AlertTriangle className="size-3.5 shrink-0" />
				<span>Failed to load approvals.</span>
				<button
					type="button"
					onClick={() => refetch()}
					className="underline underline-offset-2 hover:opacity-70"
				>
					Retry
				</button>
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="text-xs italic text-muted-foreground">
				No pending approvals. ✨
			</div>
		);
	}

	return (
		<>
			<ul className="space-y-2.5">
				{rows.slice(0, 3).map((r) => (
					<li
						key={r.id}
						className="-mx-2 flex items-center gap-3 rounded-lg p-2 transition hover:bg-[#f3f3f3]"
					>
						<Avatar className="size-7 shrink-0">
							<AvatarFallback className="bg-[#f3f3f3] text-[10px] font-bold">
								{getInitials(r.customerName)}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="truncate text-xs font-medium">
								{r.customerName ?? "Customer"}
							</div>
							<div className="truncate text-[10px] text-muted-foreground">
								{r.serviceName ?? "Package"}
							</div>
						</div>
						<div className="text-right">
							<div className="font-mono text-xs font-bold tabular-nums">
								{r.totalPrice == null ? "—" : formatPrice(r.totalPrice, "MYR")}
							</div>
							<div className="text-[10px] text-muted-foreground">
								{timeAgo(r.createdAt)}
							</div>
						</div>
					</li>
				))}
			</ul>
			<Button asChild variant="outline" size="sm" className="mt-4 w-full">
				<Link to="/dashboard/operations/approvals" search={{ scope: "all" }}>
					View all approvals
					<ChevronRight className="size-3" />
				</Link>
			</Button>
		</>
	);
}
