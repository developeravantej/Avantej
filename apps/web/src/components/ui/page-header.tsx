import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
	icon?: LucideIcon;
	title: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

export function PageHeader({
	icon: Icon,
	title,
	description,
	actions,
	className,
}: PageHeaderProps) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-3",
				className,
			)}
		>
			{Icon && (
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
					<Icon className="h-5 w-5 text-primary" />
				</div>
			)}
			<div className="min-w-0">
				<h1 className="text-2xl font-bold font-heading">{title}</h1>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
		</div>
	);
}
