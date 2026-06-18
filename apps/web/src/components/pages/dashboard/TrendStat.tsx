import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export function TrendStat(props: {
	label: string;
	value: string;
	tone?: "green" | "red";
	tooltip?: string;
}) {
	const toneClass =
		props.tone === "green"
			? "text-emerald-600"
			: props.tone === "red"
				? "text-rose-600"
				: "";
	const inner = (
		<div className={props.tooltip ? "cursor-default" : undefined}>
			<div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				{props.label}
			</div>
			<div
				className={`mt-1 font-mono text-xl font-bold tabular-nums ${toneClass}`}
			>
				{props.value}
			</div>
		</div>
	);
	if (!props.tooltip) return inner;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{inner}</TooltipTrigger>
			<TooltipContent>{props.tooltip}</TooltipContent>
		</Tooltip>
	);
}
