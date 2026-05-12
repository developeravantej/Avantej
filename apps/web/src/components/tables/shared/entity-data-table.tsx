import { flexRender } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { TableToolbar } from "@/components/ui/table-toolbar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

import type { BaseRow, EntityDataTableProps } from "./types";

export function EntityDataTable<TData extends BaseRow>({
	table,
	columnsLength,
	searchPlaceholder,
	globalFilter,
	onGlobalFilterChange,
	addLabel,
	onAddClick,
	toolbarActions,
	toolbarFilters,
	error,
	onRetry,
	emptyTitle,
	children,
}: EntityDataTableProps<TData>) {
	const rows = table.getRowModel().rows;

	const showAddButton = addLabel && onAddClick;
	const actions =
		showAddButton || toolbarActions ? (
			<>
				{toolbarActions}
				{showAddButton && (
					<Button
						onClick={onAddClick}
						className="bg-gray-950 text-white hover:bg-black/90"
						type="button"
					>
						<Plus className="mr-2 size-4" />
						{addLabel}
					</Button>
				)}
			</>
		) : undefined;

	return (
		<div className="flex h-full flex-col">
			<TableToolbar
				search={{
					value: globalFilter,
					onChange: onGlobalFilterChange,
					placeholder: searchPlaceholder,
				}}
				filters={toolbarFilters}
				actions={actions}
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
							{rows.length ? (
								rows.map((row) => (
									<TableRow
										key={row.id}
										data-state={row.getIsSelected() && "selected"}
										className="border-b border-border/30 transition-colors hover:bg-muted/30"
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
									<TableCell colSpan={columnsLength} className="p-0">
										<EmptyState
											title={emptyTitle}
											context={globalFilter ? "search" : "empty"}
										/>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}

			{children}
		</div>
	);
}
