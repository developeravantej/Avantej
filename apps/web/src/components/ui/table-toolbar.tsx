import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TableToolbarProps {
	search?: {
		value: string;
		onChange: (value: string) => void;
		placeholder?: string;
		className?: string;
	};
	filters?: ReactNode;
	actions?: ReactNode;
	className?: string;
}

export function TableToolbar({
	search,
	filters,
	actions,
	className,
}: TableToolbarProps) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-3 border-b border-border/40 px-6 py-3",
				className,
			)}
		>
			{search && (
				<div className="relative">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search.value}
						onChange={(e) => search.onChange(e.target.value)}
						placeholder={search.placeholder ?? "Search..."}
						className={cn("h-9 w-64 pl-8", search.className)}
					/>
				</div>
			)}
			{filters && <div className="flex items-center gap-2">{filters}</div>}
			{actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
		</div>
	);
}
