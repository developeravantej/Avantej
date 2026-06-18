import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
	const map: Record<string, { label: string; dot: string; cls: string }> = {
		pending: {
			label: "Pending",
			dot: "bg-amber-500",
			cls: "bg-amber-50 text-amber-700",
		},
		processing: {
			label: "Processing",
			dot: "bg-blue-500",
			cls: "bg-blue-50 text-blue-700",
		},
		paid: {
			label: "Paid",
			dot: "bg-emerald-500",
			cls: "bg-emerald-50 text-emerald-700",
		},
		failed: {
			label: "Failed",
			dot: "bg-rose-500",
			cls: "bg-rose-50 text-rose-700",
		},
		canceled: {
			label: "Cancelled",
			dot: "bg-slate-400",
			cls: "bg-slate-100 text-slate-500",
		},
	};
	const config = map[status] ?? {
		label: status,
		dot: "bg-slate-400",
		cls: "bg-slate-100 text-slate-500",
	};
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
				config.cls,
			)}
		>
			<span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
			{config.label}
		</span>
	);
}
