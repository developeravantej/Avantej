/**
 * Platform Admin — Revenue (Plan F.2 — Agent V).
 *
 * Aggregator-backed, real-time (no cache). MRR/ARR KPIs, 30d churn
 * waterfall, recent-churn list, cohort retention grid.
 */

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "@/utils/orpc";
import { RevenueKpiRow } from "@/components/platform-admin/revenue-kpi-row";
import { ChurnWaterfall } from "@/components/platform-admin/churn-waterfall";
import { CohortRetentionGrid } from "@/components/platform-admin/cohort-retention-grid";
import { MoneyHubTabs } from "@/components/platform-admin/money-hub-tabs";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/revenue",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin) {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			throw redirect({ to: "/dashboard" });
		}
	},
	component: PlatformAdminRevenuePage,
});

function fmtCents(cents: number): string {
	const sign = cents < 0 ? "-" : "";
	return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

function fmtRelative(iso: string): string {
	const d = new Date(iso);
	const diffMs = Date.now() - d.getTime();
	const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	return `${months}mo ago`;
}

function PlatformAdminRevenuePage() {
	const kpisQ = useQuery({
		queryKey: ["platformAdminRevenue", "getKpis"],
		queryFn: () => client.platformAdminRevenue.getKpis({}),
		staleTime: 0,
	});

	const churnQ = useQuery({
		queryKey: ["platformAdminRevenue", "getRecentChurn", 30],
		queryFn: () =>
			client.platformAdminRevenue.getRecentChurn({ days: 30 }),
		staleTime: 0,
	});

	const cohortQ = useQuery({
		queryKey: ["platformAdminRevenue", "getCohortRetention", 12],
		queryFn: () =>
			client.platformAdminRevenue.getCohortRetention({ monthsBack: 12 }),
		staleTime: 0,
	});

	const anyError = kpisQ.error || churnQ.error || cohortQ.error;

	return (
		<div className="p-6 space-y-6" data-testid="revenue-page">
			<MoneyHubTabs />
			<header>
				<h1 className="text-2xl font-semibold">Revenue</h1>
				<p className="text-sm text-muted-foreground">
					Live snapshot — updated each render.
				</p>
			</header>

			{anyError ? (
				<Card>
					<CardContent className="p-4 flex items-center justify-between">
						<div className="text-sm text-red-700 dark:text-red-400">
							Could not load revenue overview.
						</div>
						<Button
							onClick={() => {
								kpisQ.refetch();
								churnQ.refetch();
								cohortQ.refetch();
							}}
							size="sm"
							variant="outline"
						>
							Retry
						</Button>
					</CardContent>
				</Card>
			) : null}

			{/* KPI row */}
			{kpisQ.isLoading ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
			) : kpisQ.data ? (
				<RevenueKpiRow
					mrr={kpisQ.data.mrr}
					arr={kpisQ.data.arr}
					activeSubsCount={kpisQ.data.activeSubsCount}
					trialingSubsCount={kpisQ.data.trialingSubsCount}
					cancelledLast30d={kpisQ.data.cancelledLast30d}
					churnRatePct={kpisQ.data.churnRatePct}
				/>
			) : null}

			{/* Waterfall + recent churn */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<Card data-testid="churn-waterfall-card">
					<CardHeader>
						<CardTitle>Last 30 days MRR delta</CardTitle>
					</CardHeader>
					<CardContent>
						{kpisQ.isLoading ? (
							<Skeleton className="h-32 w-full" />
						) : kpisQ.data ? (
							<ChurnWaterfall
								mrrCents={kpisQ.data.mrr.cents}
								netNewMrrLast30dCents={kpisQ.data.netNewMrrLast30dCents}
								newMrrLast30dCents={kpisQ.data.newMrrLast30dCents}
								churnedMrrLast30dCents={kpisQ.data.churnedMrrLast30dCents}
							/>
						) : null}
					</CardContent>
				</Card>

				<Card data-testid="recent-churn-card">
					<CardHeader>
						<CardTitle>Recent churn (30 days)</CardTitle>
					</CardHeader>
					<CardContent>
						{churnQ.isLoading ? (
							<Skeleton className="h-32 w-full" />
						) : churnQ.data && churnQ.data.events.length > 0 ? (
							<ul
								className="divide-y divide-border"
								data-testid="recent-churn-list"
							>
								{churnQ.data.events.map((e) => (
									<li
										key={`${e.orgId}-${e.canceledAt}`}
										className="py-2 flex items-center justify-between text-sm"
									>
										<Link
											to="/dashboard/platform-admin/tenants/$id"
											params={{ id: e.orgId }}
											className="hover:underline truncate max-w-[60%]"
										>
											{e.orgName}
										</Link>
										<div className="flex items-center gap-3 text-muted-foreground">
											<span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase tracking-wide">
												{e.tier}
											</span>
											<span className="text-red-700 dark:text-red-400 tabular-nums">
												-{fmtCents(e.mrrCentsLost)}
											</span>
											<span className="text-xs">{fmtRelative(e.canceledAt)}</span>
										</div>
									</li>
								))}
							</ul>
						) : (
							<div className="text-sm text-muted-foreground py-4">
								No churn in the last 30 days.
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Cohort retention */}
			<Card data-testid="cohort-card">
				<CardHeader>
					<CardTitle>Cohort retention</CardTitle>
				</CardHeader>
				<CardContent>
					{cohortQ.isLoading ? (
						<Skeleton className="h-48 w-full" />
					) : cohortQ.data ? (
						<CohortRetentionGrid cohorts={cohortQ.data.cohorts} />
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
