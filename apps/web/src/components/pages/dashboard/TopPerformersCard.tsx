import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/money";
import type { StaffPerformanceRow } from "@avantej-core/services";

import { getInitials } from "./helpers";

interface TopPerformersCardProps {
	period: string;
	staff: StaffPerformanceRow[];
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
}

export function TopPerformersCard({
	period,
	staff,
	isLoading,
	isError,
	onRetry,
}: TopPerformersCardProps) {
	return (
		<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-4">
			<div className="mb-4 flex items-start justify-between">
				<div>
					<div className="text-sm font-semibold">Top performers</div>
					<div className="mt-0.5 text-xs text-muted-foreground">
						This {period.replace("this_", "")} · by sessions
					</div>
				</div>
			</div>

			<ul className="space-y-3">
				{isLoading ? (
					Array.from({ length: 4 }).map((_, i) => (
						<li key={i} className="flex items-center gap-3">
							<Skeleton className="size-7 rounded-full" />
							<Skeleton className="h-3 flex-1" />
						</li>
					))
				) : isError ? (
					<li className="flex items-center gap-2 text-destructive text-xs">
						<AlertTriangle className="size-3.5 shrink-0" />
						<span>Failed to load.</span>
						<button
							type="button"
							onClick={onRetry}
							className="underline underline-offset-2 hover:opacity-70"
						>
							Retry
						</button>
					</li>
				) : (
					staff.slice(0, 4).map((s, idx) => {
						const displayName =
							s.staffName ??
							(s.staffId ? `Staff ${s.staffId.slice(0, 6)}` : "Unknown");
						return (
							<li
								key={s.staffId}
								className={`flex items-center gap-3 ${
									s.appointmentsCompleted === 0 ? "opacity-50" : ""
								}`}
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="relative shrink-0">
											<Avatar className="size-7">
												<AvatarFallback
													className={`text-[11px] font-bold ${
														idx === 0
															? "bg-[#0a0a0a] text-white"
															: "bg-[#f3f3f3] text-foreground"
													}`}
												>
													{getInitials(displayName)}
												</AvatarFallback>
											</Avatar>
											{idx === 0 && (
												<span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#d6cdb1] text-[9px] font-bold">
													#1
												</span>
											)}
										</div>
									</TooltipTrigger>
									<TooltipContent>{displayName}</TooltipContent>
								</Tooltip>
								<div className="min-w-0 flex-1">
									<div className="truncate text-xs font-semibold">
										{displayName}
									</div>
									<div className="text-[10px] text-muted-foreground">
										{s.appointmentsCompleted} sessions
									</div>
								</div>
								<div className="text-right">
									<div className="font-mono text-xs font-bold tabular-nums">
										{formatPrice(s.totalCommission ?? 0, "MYR")}
									</div>
								</div>
							</li>
						);
					})
				)}
				{!isLoading && !isError && staff.length === 0 && (
					<li className="text-xs italic text-muted-foreground">
						No staff activity for this period.
					</li>
				)}
			</ul>
		</div>
	);
}
