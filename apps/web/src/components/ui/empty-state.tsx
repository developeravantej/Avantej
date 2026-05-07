import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
	icon?: LucideIcon;
	title: string;
	description?: string;
	action?: {
		label: string;
		onClick: () => void;
		variant?: "default" | "outline";
	};
	context?: "empty" | "search";
	className?: string;
	"data-testid"?: string;
}

export function EmptyState({
	icon: Icon = Inbox,
	title,
	description,
	action,
	context = "empty",
	className,
	"data-testid": testId = "empty-state",
}: EmptyStateProps) {
	const showAction = action !== undefined && context !== "search";

	return (
		<div
			data-testid={testId}
			className={cn(
				"flex flex-col items-center justify-center gap-4 py-16 text-center",
				className,
			)}
		>
			<Icon className="size-12 text-muted-foreground" />
			<div className="flex flex-col gap-1">
				<p className="text-sm font-medium text-foreground">{title}</p>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{showAction && (
				<Button
					variant={action.variant ?? "default"}
					onClick={action.onClick}
				>
					{action.label}
				</Button>
			)}
		</div>
	);
}
