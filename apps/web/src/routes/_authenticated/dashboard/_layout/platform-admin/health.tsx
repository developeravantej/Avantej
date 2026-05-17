/**
 * Platform Admin — Health Scoreboard (Plan F.4 — Agent He).
 *
 * Cross-tenant health dashboard at /dashboard/platform-admin/health:
 *   - 5-band score histogram
 *   - Top at-risk tenants (reuses Mission Control's AtRiskWidget)
 *   - Risk-flag rollup (count of orgs per flag code)
 *   - 30-day daily average score sparkline
 *
 * Read-only — no mutations, no audit row.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "@/utils/orpc";
import { AtRiskWidget } from "@/components/platform-admin/at-risk-widget";
import { HealthHistogram } from "@/components/platform-admin/health-histogram";
import { RiskFlagRollup } from "@/components/platform-admin/risk-flag-rollup";
import { HealthSparkline } from "@/components/platform-admin/health-sparkline";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/health",
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
	component: PlatformAdminHealthPage,
});

function PlatformAdminHealthPage() {
	const scoreboardQ = useQuery({
		queryKey: ["platformAdminHealth", "getScoreboard", 20],
		queryFn: () =>
			client.platformAdminHealth.getScoreboard({ topAtRiskLimit: 20 }),
		staleTime: 0,
		refetchOnWindowFocus: true,
	});

	return (
		<div className="p-6 space-y-6" data-testid="health-scoreboard-page">
			<header className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs text-muted-foreground">Platform admin</div>
					<h1 className="text-2xl font-semibold">Health Scoreboard</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Live snapshot — updated each render.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => scoreboardQ.refetch()}
					disabled={scoreboardQ.isFetching}
					data-testid="health-refresh-btn"
				>
					{scoreboardQ.isFetching ? "Refreshing…" : "Refresh"}
				</Button>
			</header>

			{scoreboardQ.error ? (
				<Card>
					<CardContent className="p-4 text-sm text-red-700 dark:text-red-400">
						Could not load health scoreboard:{" "}
						{(scoreboardQ.error as Error).message}
					</CardContent>
				</Card>
			) : null}

			{/* Row 1: histogram ----------------------------------------------- */}
			{scoreboardQ.isLoading ? (
				<Skeleton className="h-56 w-full" />
			) : scoreboardQ.data ? (
				<HealthHistogram
					bands={scoreboardQ.data.histogram.bands}
					totalScoredOrgs={scoreboardQ.data.histogram.totalScoredOrgs}
					unscoredOrgs={scoreboardQ.data.histogram.unscoredOrgs}
				/>
			) : null}

			{/* Row 2: top at-risk + flag rollup -------------------------------- */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
				{scoreboardQ.isLoading || !scoreboardQ.data ? (
					<>
						<Skeleton className="h-64 w-full" />
						<Skeleton className="h-64 w-full" />
					</>
				) : (
					<>
						<AtRiskWidget
							orgs={scoreboardQ.data.topAtRisk.map((r) => ({
								orgId: r.orgId,
								orgName: r.orgName,
								healthScore: r.healthScore,
								criticalFlagCount: r.criticalFlagCount,
							}))}
						/>
						<RiskFlagRollup flags={scoreboardQ.data.flagRollup} />
					</>
				)}
			</div>

			{/* Row 3: 30-day trend sparkline ----------------------------------- */}
			{scoreboardQ.isLoading ? (
				<Skeleton className="h-48 w-full" />
			) : scoreboardQ.data ? (
				<Card data-testid="health-trend-card">
					<CardHeader className="pb-2">
						<CardTitle className="text-base">
							30-day average score
						</CardTitle>
						<div className="text-xs text-muted-foreground">
							Daily mean across all scored tenants.
						</div>
					</CardHeader>
					<CardContent>
						<HealthSparkline
							points={scoreboardQ.data.trend.avgScoreLast30dByDay.map((d) => ({
								snapshotDate: d.date,
								healthScore: d.avgScore,
							}))}
						/>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
