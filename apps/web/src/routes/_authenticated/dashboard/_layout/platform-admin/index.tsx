/**
 * Platform Admin — Mission Control (Plan F.1.5 — Agent M).
 *
 * First page a platform-admin sees at /dashboard/platform-admin/.
 * Aggregator-backed, real-time (no cache). Counts, MRR placeholder,
 * recent activity, at-risk tenants, and recent signups.
 */

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "@/utils/orpc";
import { BigNumberCard } from "@/components/platform-admin/big-number-card";
import { RecentActivityFeed } from "@/components/platform-admin/recent-activity-feed";
import { AtRiskWidget } from "@/components/platform-admin/at-risk-widget";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/",
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
	component: PlatformAdminMissionControlPage,
});

function fmtMrr(cents: number, available: boolean): string {
	if (!available) return "—";
	return `$${(cents / 100).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

function PlatformAdminMissionControlPage() {
	const { data, isLoading, error, refetch, isFetching } = useQuery({
		queryKey: ["platformAdminDashboard", "getOverview"],
		queryFn: () => client.platformAdminDashboard.getOverview({}),
		// Real-time per Plan F.1.5 design — no caching.
		staleTime: 0,
		gcTime: 0,
		refetchOnWindowFocus: true,
	});

	return (
		<div className="p-6 space-y-6" data-testid="mission-control-page">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs text-muted-foreground">
						Platform admin
					</div>
					<h1 className="text-2xl font-semibold">Mission Control</h1>
					<p className="text-sm text-muted-foreground mt-1">
						What needs attention right now. Counts, recent activity, and
						at-risk tenants — refreshed on every load.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => refetch()}
					disabled={isFetching}
					data-testid="mission-control-refresh"
				>
					{isFetching ? "Refreshing…" : "Refresh"}
				</Button>
			</div>

			{error ? (
				<Card>
					<CardContent className="p-6 space-y-3 text-center">
						<div className="text-destructive">
							Could not load mission-control overview.
						</div>
						<div className="text-xs text-muted-foreground">
							{(error as Error)?.message ?? "Unknown error"}
						</div>
						<Button onClick={() => refetch()} size="sm">
							Retry
						</Button>
					</CardContent>
				</Card>
			) : null}

			{/* Row 1: big-number KPIs ------------------------------------------ */}
			<div
				className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
				data-testid="mission-control-kpis"
			>
				{isLoading || !data ? (
					<>
						<SkeletonCard />
						<SkeletonCard />
						<SkeletonCard />
						<SkeletonCard />
					</>
				) : (
					<>
						<BigNumberCard
							title="Total tenants"
							value={data.counts.total}
							subLabel={
								<span>
									{data.counts.active} active · {data.counts.trialing}{" "}
									trialing
								</span>
							}
							testId="kpi-total-tenants"
						/>
						<BigNumberCard
							title="Active subscriptions"
							value={data.subs.activeCount}
							subLabel={
								<span>{data.subs.trialingCount} on trial</span>
							}
							testId="kpi-active-subs"
						/>
						<BigNumberCard
							title="MRR (estimate)"
							value={fmtMrr(data.mrr.cents, data.mrr.estimateAvailable)}
							subLabel={
								data.mrr.estimateAvailable ? null : (
									<span>Tier pricing not yet wired</span>
								)
							}
							testId="kpi-mrr"
						/>
						<BigNumberCard
							title="Cancelled"
							value={data.counts.cancelled}
							subLabel={
								<span>
									{data.counts.pastDue} past-due · {data.counts.unpaid}{" "}
									unpaid
								</span>
							}
							band={data.counts.cancelled > 0 ? "red" : "neutral"}
							testId="kpi-cancelled"
						/>
					</>
				)}
			</div>

			{/* Row 2: at-risk + recent activity -------------------------------- */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
				{isLoading || !data ? (
					<>
						<SkeletonBlock />
						<SkeletonBlock />
					</>
				) : (
					<>
						<AtRiskWidget orgs={data.atRisk} />
						<RecentActivityFeed actions={data.recentActions} />
					</>
				)}
			</div>

			{/* Row 3: recent signups ------------------------------------------- */}
			<div>
				{isLoading || !data ? (
					<SkeletonBlock />
				) : (
					<Card data-testid="recent-signups">
						<CardHeader>
							<CardTitle className="text-base">Recent signups</CardTitle>
						</CardHeader>
						<CardContent>
							{data.recentSignups.length === 0 ? (
								<div className="text-sm text-muted-foreground py-4 text-center">
									No tenants signed up recently.
								</div>
							) : (
								<ul className="space-y-1.5 text-sm">
									{data.recentSignups.map((s) => (
										<li
											key={s.orgId}
											className="flex items-center justify-between gap-3 border-b last:border-0 pb-1.5 last:pb-0"
											data-testid="recent-signup-row"
										>
											<Link
												to="/dashboard/platform-admin/tenants/$id"
												params={{ id: s.orgId }}
												className="hover:underline truncate flex-1 min-w-0"
											>
												{s.orgName}
											</Link>
											<span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
												{new Date(s.createdAt).toLocaleDateString()}
											</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}

function SkeletonCard() {
	return (
		<Card>
			<CardContent className="p-4 space-y-2">
				<Skeleton className="h-3 w-24" />
				<Skeleton className="h-8 w-16" />
				<Skeleton className="h-3 w-32" />
			</CardContent>
		</Card>
	);
}

function SkeletonBlock() {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-4 w-40" />
			</CardHeader>
			<CardContent className="space-y-2">
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-3/4" />
				<Skeleton className="h-3 w-2/3" />
			</CardContent>
		</Card>
	);
}
