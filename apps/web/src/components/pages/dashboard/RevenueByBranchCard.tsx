import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/money";
import type { DashboardKpisResult } from "@avantej-core/services";

interface RevenueByBranchCardProps {
	kpis: DashboardKpisResult | undefined;
	kpisError: boolean;
	onRetry: () => void;
}

export function RevenueByBranchCard({
	kpis,
	kpisError,
	onRetry,
}: RevenueByBranchCardProps) {
	return (
		<div className="col-span-12 flex flex-col rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-4">
			<div className="mb-5 flex items-start justify-between">
				<div>
					<div className="text-sm font-semibold">Revenue by branch</div>
					<div className="mt-0.5 text-xs text-muted-foreground">
						{kpis?.revenueByBranch?.length ?? 0} branches
					</div>
				</div>
			</div>

			{kpisError ? (
				<div className="flex flex-1 items-center justify-center gap-2 text-destructive text-sm">
					<AlertTriangle className="size-4 shrink-0" />
					<span>Failed to load.</span>
					<button
						type="button"
						onClick={onRetry}
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
											style={{
												background: colors[idx % colors.length],
											}}
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
											indicatorStyle={{
												backgroundColor: colors[idx % colors.length],
											}}
										/>
									</TooltipTrigger>
									<TooltipContent>
										{pct < 1 ? "<1" : pct.toFixed(1)}% of total · {b.orderCount}{" "}
										orders
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
	);
}
