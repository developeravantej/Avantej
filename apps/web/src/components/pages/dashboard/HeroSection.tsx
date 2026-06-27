import { Link } from "@tanstack/react-router";
import { AlertTriangle, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/money";
import type { DashboardKpisResult } from "@avantej-core/services";
import type { NewTodayResult } from "@avantej-core/services";

import { formatToday } from "./helpers";
import { KpiTile } from "./KpiTile";
import { PerCountryMoneyCards } from "./PerCountryMoneyCards";

interface LargestSaleToday {
	totalAmount: number;
	customerName: string | null;
}

interface HeroSectionProps {
	orgName: string;
	period: string;
	revenueDelta: number | null;
	kpis: DashboardKpisResult | undefined;
	kpisLoading: boolean;
	kpisError: boolean;
	onRetryKpis: () => void;
	todayKpis: DashboardKpisResult | undefined;
	todayLoading: boolean;
	todayError: boolean;
	onRetryToday: () => void;
	largestToday: LargestSaleToday | null | undefined;
	largestLoading: boolean;
	largestError: boolean;
	onRetryLargest: () => void;
	newTodayCount: number | undefined;
	/** true when viewing the whole accessible subtree (the "All" scope). */
	isAllScope: boolean;
	/** true when the accessible scope spans more than one country. Per-country
	 *  money cards are only meaningful then; single-country tenants (most
	 *  Malaysian SMEs, all MYR) keep the familiar combined total + delta. */
	isMultiCountry: boolean;
}

export function HeroSection({
	orgName,
	period,
	revenueDelta,
	kpis,
	kpisLoading,
	kpisError,
	onRetryKpis,
	todayKpis,
	todayLoading,
	todayError,
	onRetryToday,
	largestToday,
	largestLoading,
	largestError,
	onRetryLargest,
	newTodayCount,
	isAllScope,
	isMultiCountry,
}: HeroSectionProps) {
	return (
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
					{kpisLoading ? (
						<Skeleton className="h-14 w-72" />
					) : kpisError ? (
						<span className="flex items-center gap-2 text-destructive">
							<AlertTriangle className="size-5 shrink-0" />
							<span className="text-lg font-semibold">Failed to load</span>
							<button
								type="button"
								onClick={onRetryKpis}
								className="text-sm underline underline-offset-2 hover:opacity-70"
							>
								Retry
							</button>
						</span>
					) : isAllScope && isMultiCountry ? (
						<PerCountryMoneyCards kpis={kpis} />
					) : (
						<span className="font-mono text-6xl font-extrabold leading-none tracking-tight tabular-nums">
							{formatPrice(kpis?.totalSales ?? 0, "MYR")}
						</span>
					)}
					{!kpisError &&
						(!isAllScope || !isMultiCountry) &&
						revenueDelta !== null && (
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
					loading={todayLoading}
					isError={todayError}
					onRetry={onRetryToday}
					value={formatPrice(todayKpis?.totalSales ?? 0, "MYR")}
					subline={`${todayKpis?.salesOrderCount ?? 0} orders`}
					chip={todayKpis?.totalSales ? "▲ live" : undefined}
					chipTone="green"
				/>
				<KpiTile
					label="Appointments"
					loading={todayLoading}
					isError={todayError}
					onRetry={onRetryToday}
					value={`${todayKpis?.completedAppointments ?? 0} / ${todayKpis?.totalAppointments ?? 0}`}
					progressPct={
						todayKpis?.totalAppointments
							? (todayKpis.completedAppointments /
									todayKpis.totalAppointments) *
								100
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
					loading={kpisLoading}
					isError={kpisError}
					onRetry={onRetryKpis}
					value={String(kpis?.activeMembersCount ?? 0)}
					subline={
						newTodayCount ? `+${newTodayCount} new today` : "no new joiners"
					}
					chip={newTodayCount ? `+${newTodayCount}` : undefined}
					chipTone="green"
				/>
				<KpiTile
					label="Largest Sale Today"
					loading={largestLoading}
					isError={largestError}
					onRetry={onRetryLargest}
					value={
						largestToday ? formatPrice(largestToday.totalAmount, "MYR") : "—"
					}
					subline={
						largestToday
							? (largestToday.customerName ?? "Customer")
							: "no sales yet"
					}
				/>
			</div>
		</section>
	);
}
