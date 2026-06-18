import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { client } from "@/utils/orpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";

export function FunnelTab({ organizationId }: { organizationId: string }) {
	const { data, isLoading, error } = useQuery({
		queryKey: ["platformAdminTenants", "getTenantFunnel", organizationId],
		queryFn: () =>
			client.platformAdminTenants.getTenantFunnel({ organizationId }),
	});

	if (isLoading) {
		return <div className="text-muted-foreground text-sm">Loading funnel…</div>;
	}
	if (error || !data) {
		return (
			<StatusCallout
				variant="error"
				title="Couldn't load funnel"
				message={(error as Error)?.message ?? "Failed to load funnel."}
			/>
		);
	}

	const progress = Math.round((data.completed / data.total) * 100);

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Activation progress — {data.completed}/{data.total} ({progress}%)
					</CardTitle>
				</CardHeader>
				<CardContent>
					{data.stuckAt ? (
						<div className="text-sm">
							<Badge variant="secondary">Stuck at</Badge>{" "}
							<span className="font-medium">
								{data.milestones.find((m) => m.id === data.stuckAt)?.label}
							</span>
						</div>
					) : (
						<div className="text-sm">
							<Badge variant="default">All milestones reached</Badge>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Milestones</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2">
						{data.milestones.map((m) => {
							const isStuck = m.id === data.stuckAt;
							return (
								<li
									key={m.id}
									className={`flex items-center gap-3 p-2 rounded ${
										isStuck ? "bg-muted" : ""
									}`}
								>
									{m.reached ? (
										<CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
									) : (
										<Circle className="h-5 w-5 text-muted-foreground shrink-0" />
									)}
									<div className="flex-1">
										<div className="text-sm font-medium">{m.label}</div>
										<div className="text-xs text-muted-foreground font-mono">
											{m.id}
										</div>
									</div>
									<div className="text-xs text-muted-foreground">
										{m.reachedAt
											? new Date(m.reachedAt).toLocaleDateString()
											: isStuck
												? "next"
												: "—"}
									</div>
								</li>
							);
						})}
					</ul>
				</CardContent>
			</Card>
		</div>
	);
}
