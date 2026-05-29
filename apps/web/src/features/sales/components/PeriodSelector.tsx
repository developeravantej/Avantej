import { cn } from "@/lib/utils";

const KPI_PERIODS = [
	{ value: "today", label: "Today" },
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
] as const;

export function PeriodSelector({
	value,
	onChange,
}: {
	value: "today" | "week" | "month";
	onChange: (v: "today" | "week" | "month") => void;
}) {
	return (
		<div className="flex items-center gap-1.5">
			{KPI_PERIODS.map((p) => (
				<button
					key={p.value}
					type="button"
					onClick={() => onChange(p.value)}
					className={cn(
						"rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
						value === p.value
							? "bg-[#0a0a0a] text-white font-semibold"
							: "border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3]",
					)}
				>
					{p.label}
				</button>
			))}
		</div>
	);
}
