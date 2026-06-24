// NOTE: Partial migration — adopts TableToolbar visual primitive for the search bar.
// Full migration to EntityDataTable skipped: read-only view (no add/edit/delete actions),
// uses cursor-style PaginationBar, complex external FilterToolbar rendered by parent,
// and SalesRow uses lowercase `id`, not `ID`.
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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { TableToolbar } from "@/components/ui/table-toolbar";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onServiceAdd?: (data: unknown) => Promise<void>;
	// Load more
	total?: number;
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	onLoadMore?: () => void;
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
	hasNextPage,
	isFetchingNextPage,
	onLoadMore,
	isLoading,
	emptyTitle,
	emptyDescription,
	emptyAction,
	error,
	onRetry,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");
	const navigate = useNavigate();

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

	return (
		<div className="flex h-full flex-col">
			<TableToolbar
				search={{
					value: globalFilter,
					onChange: setGlobalFilter,
					placeholder: "Search...",
				}}
			/>
			{error ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<StatusCallout
						variant="error"
						title="Couldn't load data"
						message={
							error instanceof Error ? error.message : "An error occurred"
						}
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
										className="cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/30 data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground"
										onClick={() =>
											navigate({
												to: "/dashboard/sales/$id",
												params: { id: (row.original as { id: string }).id },
											})
										}
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
			{total !== undefined && total > 0 && (
				<div className="shrink-0 border-t border-border/40 px-6 py-3">
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">
							{data.length} of {total} results
						</span>
						{hasNextPage && onLoadMore && (
							<button
								type="button"
								onClick={onLoadMore}
								disabled={isFetchingNextPage}
								className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3] disabled:opacity-40"
							>
								{isFetchingNextPage ? "Loading…" : "Load more"}
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
