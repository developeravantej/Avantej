/**
 * Platform Admin — Tenant Risk tab (Plan F.1.5, Agent R).
 *
 * Read-only view of:
 *   • the most-recent composite health score (gauge)
 *   • the current risk-flag set (chips)
 *   • a 30-day health-score sparkline
 *
 * All three values come from `platformAdminTenants.health.{get,history}`,
 * which Agent H exposed against the columns the daily snapshot cron writes.
 */

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthScoreGauge } from "./health-score-gauge";
import { RiskFlagList, type RiskFlag } from "./risk-flag-list";
import { HealthSparkline } from "./health-sparkline";

export function TenantRiskTab({ organizationId }: { organizationId: string }) {
	const healthQuery = useQuery({
		queryKey: [
			"platformAdminTenants",
			"health",
			"get",
			organizationId,
		] as const,
		queryFn: () =>
			client.platformAdminTenants.health.get({ organizationId }),
	});

	const historyQuery = useQuery({
		queryKey: [
			"platformAdminTenants",
			"health",
			"history",
			organizationId,
		] as const,
		queryFn: () =>
			client.platformAdminTenants.health.history({
				organizationId,
				days: 30,
			}),
	});

	const loading = healthQuery.isLoading || historyQuery.isLoading;
	const errored = healthQuery.error || historyQuery.error;

	if (loading) {
		return (
			<div className="space-y-4" data-testid="tenant-risk-tab-loading">
				<div className="h-32 rounded-md bg-muted animate-pulse" />
				<div className="h-12 rounded-md bg-muted animate-pulse" />
				<div className="h-40 rounded-md bg-muted animate-pulse" />
			</div>
		);
	}

	if (errored || !healthQuery.data) {
		return (
			<div
				className="space-y-3 border rounded-md p-4"
				data-testid="tenant-risk-tab-error"
			>
				<div className="text-sm text-destructive">
					Could not load health data
					{healthQuery.error
						? `: ${(healthQuery.error as Error).message}`
						: historyQuery.error
							? `: ${(historyQuery.error as Error).message}`
							: "."}
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						healthQuery.refetch();
						historyQuery.refetch();
					}}
					data-testid="tenant-risk-tab-retry"
				>
					<RefreshCw className="h-4 w-4 mr-1" />
					Retry
				</Button>
			</div>
		);
	}

	const health = healthQuery.data;
	const series = historyQuery.data?.series ?? [];
	const flags = (health.riskFlags ?? null) as RiskFlag[] | null;

	return (
		<div className="space-y-4" data-testid="tenant-risk-tab">
			<HealthScoreGauge
				score={health.healthScore}
				snapshotDate={health.snapshotDate}
			/>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Active risk flags</CardTitle>
				</CardHeader>
				<CardContent>
					<RiskFlagList flags={flags} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">30-day health trend</CardTitle>
				</CardHeader>
				<CardContent>
					<HealthSparkline points={series} />
				</CardContent>
			</Card>
		</div>
	);
}

export default TenantRiskTab;
