import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuditRowEnriched } from "@avantej-core/services";

import { severityDotColor, severityLabel, timeAgo } from "./helpers";

interface RecentActivityCardProps {
	auditRows: AuditRowEnriched[];
	isLoading: boolean;
	isError: boolean;
	onRetry: () => void;
}

export function RecentActivityCard({
	auditRows,
	isLoading,
	isError,
	onRetry,
}: RecentActivityCardProps) {
	return (
		<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-4">
			<div className="mb-4 flex items-start justify-between">
				<div>
					<div className="text-sm font-semibold">Recent activity</div>
					<div className="mt-0.5 text-xs text-muted-foreground">
						Live audit stream
					</div>
				</div>
				<span className="relative flex size-1.5">
					<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
					<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
				</span>
			</div>

			<ul className="space-y-3.5">
				{isLoading ? (
					Array.from({ length: 5 }).map((_, i) => (
						<li key={i} className="flex gap-3">
							<Skeleton className="size-1.5 rounded-full" />
							<Skeleton className="h-3 flex-1" />
						</li>
					))
				) : isError ? (
					<li className="flex items-center gap-2 text-destructive text-xs">
						<AlertTriangle className="size-3.5 shrink-0" />
						<span>Failed to load activity.</span>
						<button
							type="button"
							onClick={onRetry}
							className="underline underline-offset-2 hover:opacity-70"
						>
							Retry
						</button>
					</li>
				) : (
					auditRows.slice(0, 5).map((row) => (
						<li key={row.id} className="flex gap-3 text-xs">
							<Tooltip>
								<TooltipTrigger asChild>
									<div
										className={`mt-1.5 size-1.5 shrink-0 cursor-default rounded-full ${severityDotColor(row.severity)}`}
									/>
								</TooltipTrigger>
								<TooltipContent>{severityLabel(row.severity)}</TooltipContent>
							</Tooltip>
							<div className="min-w-0">
								<div className="truncate">
									<b>{row.actorName ?? "System"}</b>{" "}
									<span className="text-muted-foreground">· {row.action}</span>
								</div>
								<div className="mt-0.5 text-[10px] text-muted-foreground">
									{timeAgo(row.createdAt)}
								</div>
							</div>
						</li>
					))
				)}
				{!isLoading && !isError && auditRows.length === 0 && (
					<li className="text-xs italic text-muted-foreground">
						No recent activity.
					</li>
				)}
			</ul>

			<Link
				to="/dashboard/audit/view"
				className="mt-5 block text-left text-xs font-semibold text-foreground hover:underline"
			>
				Open full audit log →
			</Link>
		</div>
	);
}
