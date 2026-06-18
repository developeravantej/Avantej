import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export function KpiTile(props: {
	label: string;
	value: string;
	subline?: string;
	chip?: string;
	chipTone?: "green" | "amber" | "red";
	progressPct?: number;
	progressLabel?: string;
	loading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
}) {
	const chipBg =
		props.chipTone === "green"
			? "border-emerald-200 bg-emerald-100 text-emerald-700"
			: props.chipTone === "amber"
				? "border-amber-200 bg-amber-100 text-amber-700"
				: "border-rose-200 bg-rose-100 text-rose-700";

	return (
		<div className="bg-white p-5">
			<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
				{props.label}
			</div>
			{props.loading ? (
				<Skeleton className="mt-2 h-7 w-24" />
			) : props.isError ? (
				<div className="mt-2 flex items-center gap-1.5 text-destructive text-xs">
					<AlertTriangle className="size-3.5 shrink-0" />
					<span>—</span>
					{props.onRetry && (
						<button
							type="button"
							onClick={props.onRetry}
							className="underline underline-offset-2 hover:opacity-70"
						>
							Retry
						</button>
					)}
				</div>
			) : (
				<div className="mt-2 font-mono text-2xl font-bold tabular-nums">
					{props.value}
				</div>
			)}
			{!props.isError && props.progressPct !== undefined ? (
				<>
					<Progress
						value={props.progressPct}
						className="mt-1.5 h-1 bg-[#e5e5e5]"
						indicatorClassName="bg-blue-600"
					/>
					<div className="mt-1 text-[11px] text-muted-foreground">
						{props.progressLabel}
					</div>
				</>
			) : !props.isError ? (
				<div className="mt-1 flex items-center gap-2 text-[11px]">
					{props.chip && (
						<Badge
							variant="outline"
							className={`px-2 py-0.5 text-[10px] font-bold ${chipBg}`}
						>
							{props.chip}
						</Badge>
					)}
					{props.subline && (
						<span className="text-muted-foreground">{props.subline}</span>
					)}
				</div>
			) : null}
		</div>
	);
}
