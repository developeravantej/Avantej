import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationBarProps {
	page: number; // 0-indexed
	hasMore: boolean;
	onPrev: () => void;
	onNext: () => void;
	isLoading?: boolean;
	className?: string;
}

export function PaginationBar({
	page,
	hasMore,
	onPrev,
	onNext,
	isLoading,
	className,
}: PaginationBarProps) {
	return (
		<div className={cn("flex items-center justify-between gap-2 py-2", className)}>
			<Button
				variant="outline"
				size="sm"
				onClick={onPrev}
				disabled={page === 0 || isLoading}
			>
				← Previous
			</Button>
			<span className="text-sm text-muted-foreground">Page {page + 1}</span>
			<Button
				variant="outline"
				size="sm"
				onClick={onNext}
				disabled={!hasMore || isLoading}
			>
				Next →
			</Button>
		</div>
	);
}
