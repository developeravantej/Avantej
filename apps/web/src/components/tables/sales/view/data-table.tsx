import type { ColumnDef } from "@tanstack/react-table";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getFilteredRowModel,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";

const PAGE_SIZE = 50;

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onServiceAdd?: (data: unknown) => Promise<void>;
	// Pagination
	total?: number;
	page?: number; // 1-indexed
	onPageChange?: (page: number) => void;
	isLoading?: boolean;
	// Empty state
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: {
		label: string;
		onClick: () => void;
	};
	// Error state
	error?: unknown;
	onRetry?: () => void;
}

/**
 * Reference DataTable for the sales/view route.
 *
 * Empty + error pattern for all 12 other domain tables:
 *
 * ```tsx
 * <DataTable
 *   columns={columns}
 *   data={query.data ?? []}
 *   error={query.error}
 *   onRetry={() => query.refetch()}
 *   emptyTitle="No sales yet"
 *   emptyAction={{ label: "New Sale", onClick: () => navigate({ to: "/dashboard/sales/create" }) }}
 * />
 * ```
 *
 * Pass `error` and `onRetry` from your TanStack Query result.
 * Pass `emptyTitle` and `emptyAction` specific to the page's primary action.
 */
export default function DataTable<TData, TValue>({
	columns,
	data,
	total,
	page,
	onPageChange,
	isLoading,
	emptyTitle,
	emptyDescription,
	emptyAction,
	error,
	onRetry,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: {
			globalFilter,
		},
	});

	const showPagination = onPageChange !== undefined && total !== undefined && page !== undefined;

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center border-b border-border/40 px-6 py-3">
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search..."
						value={globalFilter ?? ""}
						onChange={(event) => setGlobalFilter(event.target.value)}
						className="pl-9"
					/>
				</div>
			</div>
			{error ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<StatusCallout
						variant="error"
						title="Couldn't load data"
						message={error instanceof Error ? error.message : "An error occurred"}
						onRetry={onRetry}
					/>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto">
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-white">
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow
									key={headerGroup.id}
									className="border-b border-border/40 bg-muted/40 hover:bg-muted/40"
								>
									{headerGroup.headers.map((header) => (
										<TableHead
											key={header.id}
											className="whitespace-nowrap px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{table.getRowModel().rows?.length ? (
								table.getRowModel().rows.map((row) => (
									<TableRow
										key={row.id}
										data-state={row.getIsSelected() && "selected"}
										className="border-b border-border/30 transition-colors hover:bg-muted/30 data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground"
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell
												key={cell.id}
												className="whitespace-nowrap px-6 py-4 text-sm"
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={columns.length} className="p-0">
										<EmptyState
											title={emptyTitle ?? "No results found"}
											description={emptyDescription}
											action={emptyAction}
											context={globalFilter ? "search" : "empty"}
										/>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}
			{showPagination && (
				<div className="shrink-0 border-t border-border/40 px-6 py-3">
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">
							{total === 0
								? "No results"
								: `Showing ${Math.min((page - 1) * PAGE_SIZE + 1, total)}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
						</span>
						<PaginationBar
							page={page - 1}
							hasMore={page * PAGE_SIZE < total}
							onPrev={() => onPageChange(page - 1)}
							onNext={() => onPageChange(page + 1)}
							isLoading={isLoading}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
