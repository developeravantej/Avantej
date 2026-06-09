import { cn } from "@/lib/utils";
import { type StatusFilter, AUDIENCE_FILTERS, STATUS_FILTERS } from "./types";

// ─── Left rail: audience + status filters ────────────────────────────────────

interface AnnouncementsFilterRailProps {
	audienceFilter: string;
	statusFilter: StatusFilter;
	audienceCounts: Record<string, number>;
	onAudienceChange: (key: string) => void;
	onStatusChange: (key: StatusFilter) => void;
}

export function AnnouncementsFilterRail({
	audienceFilter,
	statusFilter,
	audienceCounts,
	onAudienceChange,
	onStatusChange,
}: AnnouncementsFilterRailProps) {
	return (
		<div className="space-y-1 rounded-2xl border border-[#e5e5e5] bg-white p-3 self-start">
			<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] px-2 mb-2">
				Filter by audience
			</p>

			{AUDIENCE_FILTERS.map(({ key, label, dot }) => {
				const count = audienceCounts[key] ?? 0;
				const isActive = audienceFilter === key;
				return (
					<button
						key={key}
						type="button"
						onClick={() => onAudienceChange(key)}
						className={cn(
							"w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition",
							isActive
								? "bg-[#0a0a0a] text-white font-semibold"
								: "text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a]",
						)}
					>
						<span className="flex items-center gap-2">
							{dot && (
								<span
									className={cn("w-2 h-2 rounded-full flex-shrink-0", dot)}
								/>
							)}
							{label}
						</span>
						<span
							className={cn(
								"font-mono text-xs tabular-nums",
								isActive ? "opacity-70" : "",
							)}
						>
							{count}
						</span>
					</button>
				);
			})}

			<div className="border-t border-[#e5e5e5] my-2" />

			<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] px-2 mb-2">
				Filter by status
			</p>

			{STATUS_FILTERS.map(({ key, label }) => {
				const isActive = statusFilter === key;
				return (
					<button
						key={key}
						type="button"
						onClick={() => onStatusChange(key)}
						className={cn(
							"w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition",
							isActive
								? "bg-[#0a0a0a] text-white font-semibold"
								: "text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a]",
						)}
					>
						<span>{label}</span>
					</button>
				);
			})}
		</div>
	);
}
