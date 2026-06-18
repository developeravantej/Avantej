import {
	AlertCircle,
	AlertTriangle,
	Clock,
	DollarSign,
	Loader2,
	Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { client } from "@/utils/orpc";
import { fmtAmount } from "./helpers";
import { KpiCard } from "./KpiCard";

export function OverviewTab({
	data,
	isLoading,
}: {
	data:
		| Awaited<ReturnType<typeof client.platformAdminPayments.overview>>
		| undefined;
	isLoading: boolean;
}) {
	if (isLoading || !data) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="size-6 animate-spin" />
			</div>
		);
	}
	return (
		<>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<KpiCard
					icon={DollarSign}
					label="App fees this month"
					value={fmtAmount(data.applicationFeesThisMonth, "myr")}
					mono
				/>
				<KpiCard
					icon={DollarSign}
					label="SaaS revenue this month"
					value={fmtAmount(data.saasRevenueThisMonth, "usd")}
					mono
				/>
				<KpiCard
					icon={Clock}
					label="Open disputes"
					value={data.openDisputes.toString()}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<KpiCard
					icon={AlertCircle}
					label="Critical drift"
					value={data.drift.critical.toString()}
					tone={data.drift.critical > 0 ? "red" : undefined}
				/>
				<KpiCard
					icon={AlertTriangle}
					label="Warn drift"
					value={data.drift.warn.toString()}
				/>
				<KpiCard
					icon={Shield}
					label="Stuck onboardings"
					value={data.stuckOnboardings.toString()}
				/>
			</div>
			{data.lastReconciliation && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Last reconciliation</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-2 gap-2 text-sm">
							<dt className="text-muted-foreground">Status</dt>
							<dd>
								<Badge variant="outline">
									{data.lastReconciliation.status}
								</Badge>
							</dd>
							<dt className="text-muted-foreground">Started</dt>
							<dd>
								{new Date(data.lastReconciliation.startedAt).toLocaleString()}
							</dd>
							<dt className="text-muted-foreground">Completed</dt>
							<dd>
								{data.lastReconciliation.completedAt
									? new Date(
											data.lastReconciliation.completedAt,
										).toLocaleString()
									: "—"}
							</dd>
							<dt className="text-muted-foreground">Drift found</dt>
							<dd>{data.lastReconciliation.driftCount}</dd>
							{data.lastReconciliation.error && (
								<>
									<dt className="text-muted-foreground">Error</dt>
									<dd className="text-red-700">
										{data.lastReconciliation.error}
									</dd>
								</>
							)}
						</dl>
					</CardContent>
				</Card>
			)}
		</>
	);
}
