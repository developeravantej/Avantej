import type { ReactElement } from "react";
import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function MatrixLegend() {
	const items: Array<{ bg: string; label: string; icon: ReactElement }> = [
		{ bg: "bg-indigo-100", label: "Branch", icon: <Check className="w-3 h-3 text-indigo-700" /> },
		{ bg: "bg-teal-100", label: "Area", icon: <Check className="w-3 h-3 text-teal-700" /> },
		{ bg: "bg-purple-100", label: "Region", icon: <Check className="w-3 h-3 text-purple-700" /> },
		{ bg: "bg-blue-100", label: "Country", icon: <Check className="w-3 h-3 text-blue-700" /> },
		{ bg: "bg-green-100", label: "Organization", icon: <Check className="w-3 h-3 text-green-700" /> },
		{ bg: "bg-orange-100", label: "Team", icon: <Check className="w-3 h-3 text-orange-700" /> },
		{ bg: "bg-yellow-100", label: "Own", icon: <Minus className="w-3 h-3 text-yellow-700" /> },
		{ bg: "bg-brand-secondary-3", label: "No Access", icon: <X className="w-3 h-3 text-brand-secondary-1" /> },
	];
	return (
		<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-muted-foreground">
			{items.map((it) => (
				<div key={it.label} className="flex items-center gap-1">
					<div
						className={cn(
							"w-5 h-5 rounded-full flex items-center justify-center",
							it.bg,
						)}
					>
						{it.icon}
					</div>
					<span>{it.label}</span>
				</div>
			))}
		</div>
	);
}
