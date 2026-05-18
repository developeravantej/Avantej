/**
 * Platform Admin — At-Risk Widget (Plan F.1.5 — Agent M).
 *
 * Top 5 tenants by lowest current health score. Color band mirrors
 * HealthScoreGauge thresholds (green ≥80, amber 50-79, red <50).
 */

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bandForScore } from "@/components/platform-admin/health-score-gauge";

export type AtRiskOrg = {
	orgId: string;
	orgName: string;
	healthScore: number | null;
	criticalFlagCount: number;
};

const BAND_CHIP: Record<"green" | "amber" | "red" | "none", string> = {
	green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	none: "bg-muted text-muted-foreground",
};

export function AtRiskWidget({ orgs }: { orgs: AtRiskOrg[] }) {
	return (
		<Card data-testid="at-risk-widget">
			<CardHeader>
				<CardTitle className="text-base">At-risk tenants</CardTitle>
			</CardHeader>
			<CardContent>
				{orgs.length === 0 ? (
					<div className="text-sm text-muted-foreground py-4 text-center">
						No at-risk tenants right now.
					</div>
				) : (
					<ul className="space-y-2">
						{orgs.map((o) => {
							const band = bandForScore(o.healthScore);
							return (
								<li
									key={o.orgId}
									className="flex items-center gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"
									data-testid="at-risk-row"
								>
									<Link
										to="/dashboard/platform-admin/tenants/$id"
										params={{ id: o.orgId }}
										className="flex-1 min-w-0 hover:underline truncate"
										data-testid="at-risk-link"
									>
										{o.orgName}
									</Link>
									<span
										className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-mono tabular-nums ${BAND_CHIP[band]}`}
										data-band={band}
										data-testid="at-risk-score-chip"
									>
										{o.healthScore ?? "—"}
									</span>
									{o.criticalFlagCount > 0 ? (
										<Badge
											variant="destructive"
											className="text-xs"
											data-testid="at-risk-critical-badge"
										>
											{o.criticalFlagCount} crit
										</Badge>
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
