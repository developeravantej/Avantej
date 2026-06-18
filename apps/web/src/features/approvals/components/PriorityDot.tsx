import { cn } from "@/lib/utils";
import type { PriorityLevel } from "../approvals.types";

export function PriorityDot({ priority }: { priority: PriorityLevel }) {
	return (
		<span
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				priority === "high" && "bg-rose-500",
				priority === "med" && "bg-amber-500",
				priority === "low" && "bg-blue-400",
			)}
			title={`${priority} priority`}
		/>
	);
}
