import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TablePaginationProps {
	page: number;
	pageSize: number;
	totalRows: number;
	onPageChange: (page: number) => void;
	onPageSizeChange?: (size: number) => void;
	pageSizeOptions?: number[];
	isLoading?: boolean;
	className?: string;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

export function TablePagination({
	page,
	pageSize,
	totalRows,
	onPageChange,
	onPageSizeChange,
	pageSizeOptions = DEFAULT_PAGE_SIZES,
	isLoading,
	className,
}: TablePaginationProps) {
	const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
	const start = totalRows === 0 ? 0 : page * pageSize + 1;
	const end = Math.min((page + 1) * pageSize, totalRows);

	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-6 py-3",
				className,
			)}
		>
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<span>
					{start}–{end} of {totalRows}
				</span>
				{onPageSizeChange && (
					<>
						<span className="mx-2">·</span>
						<span>Rows per page</span>
						<Select
							value={String(pageSize)}
							onValueChange={(v) => onPageSizeChange(Number(v))}
						>
							<SelectTrigger className="h-8 w-[72px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{pageSizeOptions.map((size) => (
									<SelectItem key={size} value={String(size)}>
										{size}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</>
				)}
			</div>
			<div className="flex items-center gap-2">
				<span className="text-sm text-muted-foreground">
					Page {page + 1} of {totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(page - 1)}
					disabled={page === 0 || isLoading}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(page + 1)}
					disabled={page + 1 >= totalPages || isLoading}
				>
					Next
				</Button>
			</div>
		</div>
	);
}
