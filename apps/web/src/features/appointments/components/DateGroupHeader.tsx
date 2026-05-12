import { cn } from "@/lib/utils";

type Props = {
	dateObj: Date;
	label: string;
	sub: string;
	todayDate: boolean;
	count: number;
};

export function DateGroupHeader({
	dateObj,
	label,
	sub,
	todayDate,
	count,
}: Props) {
	return (
		<div className="flex items-center gap-3 mb-4">
			<div
				className={cn(
					"flex size-14 shrink-0 flex-col items-center justify-center rounded-full text-center",
					todayDate
						? "bg-blue-600 text-white"
						: "bg-zinc-100 text-zinc-700",
				)}
			>
				<span className="text-[10px] font-semibold leading-none tracking-wide">
					{dateObj
						.toLocaleDateString("en-US", { month: "short" })
						.toUpperCase()}
				</span>
				<span className="text-lg font-bold leading-none mt-1">
					{dateObj.getDate()}
				</span>
			</div>
			<div>
				<p
					className={cn(
						"text-sm font-semibold",
						todayDate ? "text-blue-600" : "text-zinc-800",
					)}
				>
					{label}
				</p>
				<p className="text-xs text-muted-foreground">{sub}</p>
			</div>
			<div className="flex-1 h-px bg-zinc-100 ml-1" />
			<span className="text-xs text-muted-foreground shrink-0">
				{count} appointment{count !== 1 ? "s" : ""}
			</span>
		</div>
	);
}
