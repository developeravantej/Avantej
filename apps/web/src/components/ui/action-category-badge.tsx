import { cn } from "@/lib/utils";

const ACTION_CATEGORY_COLORS: Record<string, string> = {
	sale: "bg-blue-100 text-blue-800 border-blue-200",
	commission: "bg-green-100 text-green-800 border-green-200",
	member: "bg-purple-100 text-purple-800 border-purple-200",
	checkin: "bg-cyan-100 text-cyan-800 border-cyan-200",
	package: "bg-indigo-100 text-indigo-800 border-indigo-200",
	promotion: "bg-pink-100 text-pink-800 border-pink-200",
	tax: "bg-yellow-100 text-yellow-800 border-yellow-200",
	system: "bg-muted text-muted-foreground border-border",
};

const REFUND_COLOR = "bg-orange-100 text-orange-800 border-orange-200";

function getActionColor(action: string): string {
	if (action.includes("refund")) return REFUND_COLOR;
	const category = action.split(".")[0] ?? "system";
	return ACTION_CATEGORY_COLORS[category] ?? ACTION_CATEGORY_COLORS.system;
}

interface ActionCategoryBadgeProps {
	action: string;
	label?: string;
	className?: string;
}

export function ActionCategoryBadge({
	action,
	label,
	className,
}: ActionCategoryBadgeProps) {
	const colorClass = getActionColor(action);
	return (
		<span
			className={cn(
				"inline-flex items-center rounded border px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide",
				colorClass,
				className,
			)}
		>
			{label ?? action}
		</span>
	);
}
