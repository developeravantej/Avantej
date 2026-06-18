// NOTE: Not migrated to shared <EntityDataTable> because:
//   1. UomRow uses lowercase `id` (BaseRow requires uppercase `ID`) and columns.tsx is off-limits.
//   2. Dialog state management moved to UomFormDialog (canonical pattern).
// See zplan/04-23_15-31_frontend-table-consolidation/plan/plan.md §5 Phase 3.

import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getPaginationRowModel,
	getSortedRowModel,
	getFilteredRowModel,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { UomFormDialog } from "@/components/forms/uom-form";
import type { UomRow, UomTableMeta } from "./columns";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	organizationId: string;
	onDelete: (id: string) => void;
	isDeleting?: boolean;
	error?: unknown;
	onRetry?: () => void;
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: { label: string; onClick: () => void };
}

export function DataTable<TData extends UomRow, TValue>({
	columns,
	data,
	organizationId,
	onDelete,
	isDeleting,
	error,
	onRetry,
	emptyTitle,
	emptyDescription,
	emptyAction,
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState("");

	// Create dialog state
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

	// Edit dialog state
	const [editTarget, setEditTarget] = useState<{
		id: string;
		name: string;
		description: string | null;
	} | null>(null);

	// Delete confirmation state
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

	const meta: UomTableMeta = {
		onEdit: (row: UomRow) => {
			setEditTarget({
				id: row.id,
				name: row.name,
				description: row.description,
			});
		},
		onDelete: (id: string) => {
			setDeleteTarget(id);
		},
	};

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		meta,
		state: {
			sorting,
			globalFilter,
		},
	});

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center border-b border-border/40 px-6 py-3">
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search UoMs..."
						value={globalFilter ?? ""}
						onChange={(event) => setGlobalFilter(event.target.value)}
						className="pl-9"
					/>
				</div>
				<div className="ml-auto flex gap-2">
					<Button
						onClick={() => setIsAddDialogOpen(true)}
						size="sm"
						type="button"
					>
						<Plus className="mr-2 size-4" />
						Add UoM
					</Button>
				</div>
			</div>

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
									<TableCell colSpan={columns.length} className="p-0">
										<EmptyState
											title={emptyTitle ?? "No units of measure"}
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

			<div className="flex shrink-0 items-center justify-end gap-x-2 border-t border-border/40 px-6 py-3">
				<div className="flex-1 text-sm text-muted-foreground">
					{table.getFilteredRowModel().rows.length} of{" "}
					{table.getCoreRowModel().rows.length} row(s) total.
				</div>
				<div className="space-x-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
					>
						Next
					</Button>
				</div>
			</div>

			{/* Create Dialog */}
			<UomFormDialog
				isOpen={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				organizationId={organizationId}
				mode="create"
			/>

			{/* Edit Dialog */}
			<UomFormDialog
				isOpen={editTarget !== null}
				onClose={() => setEditTarget(null)}
				organizationId={organizationId}
				mode="edit"
				initialData={editTarget ?? undefined}
			/>

			{/* Delete Confirmation Dialog */}
			<Dialog
				open={!!deleteTarget}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<DialogContent
					hideCloseButton
					className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							UNITS OF MEASURE
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Confirm Delete
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							Are you sure you want to delete this unit of measure? This action
							cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={() => setDeleteTarget(null)}
							disabled={isDeleting}
						>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={() => {
								if (deleteTarget) {
									onDelete(deleteTarget);
									setDeleteTarget(null);
								}
							}}
							disabled={isDeleting}
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
