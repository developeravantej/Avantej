import { cn } from "@/lib/utils";
import type { TargetAudience } from "./types";

// ─── Audience badge chip ─────────────────────────────────────────────────────

export function AudienceChip({ audience }: { audience: TargetAudience }) {
	const base =
		"inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold";
	switch (audience) {
		case "all":
			return <span className={cn(base, "bg-blue-50 text-blue-700")}>All</span>;
		case "staff":
			return (
				<span className={cn(base, "bg-emerald-50 text-emerald-700")}>
					Staff
				</span>
			);
		case "clients":
			return (
				<span className={cn(base, "bg-purple-50 text-purple-700")}>
					Members
				</span>
			);
	}
}
