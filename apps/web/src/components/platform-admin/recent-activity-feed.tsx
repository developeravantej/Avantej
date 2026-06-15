/**
 * Platform Admin — Recent Activity Feed (Plan F.1.5 — Agent M).
 *
 * Rolling list of the latest 10 admin-session-actions. Each row links
 * to the target tenant drill-in (if any).
 */

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type RecentAction = {
	actorUserId: string;
	actorEmail?: string;
	action: string;
	targetOrgId?: string;
	targetOrgName?: string;
	createdAt: string;
};

function relativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return iso;
	const diff = Date.now() - then;
	const s = Math.floor(diff / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	return `${d}d ago`;
}

export function RecentActivityFeed({ actions }: { actions: RecentAction[] }) {
	return (
		<Card data-testid="recent-activity-feed">
			<CardHeader>
				<CardTitle className="text-base">Recent admin activity</CardTitle>
			</CardHeader>
			<CardContent>
				{actions.length === 0 ? (
					<div className="text-sm text-muted-foreground py-4 text-center">
						No recent admin actions.
					</div>
				) : (
					<ul className="space-y-2">
						{actions.map((a, idx) => (
							<li
								key={`${a.actorUserId}-${a.createdAt}-${idx}`}
								className="flex items-start gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"
								data-testid="recent-activity-row"
							>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="font-medium truncate">
											{a.actorEmail ?? a.actorUserId ?? "Unknown"}
										</span>
										<Badge variant="outline" className="font-mono text-xs">
											{a.action}
										</Badge>
									</div>
									{a.targetOrgId ? (
										<div className="text-xs text-muted-foreground">
											on{" "}
											<Link
												to="/dashboard/platform-admin/tenants/$id"
												params={{ id: a.targetOrgId }}
												className="hover:underline text-foreground"
												data-testid="recent-activity-target-link"
											>
												{a.targetOrgName ?? a.targetOrgId}
											</Link>
										</div>
									) : null}
								</div>
								<div className="text-xs text-muted-foreground whitespace-nowrap">
									{relativeTime(a.createdAt)}
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
