import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getPaginationRowModel,
	getSortedRowModel,
	getFilteredRowModel,
} from "@tanstack/react-table";
import type {
	ColumnDef,
	SortingState,
	ColumnFiltersState,
} from "@tanstack/react-table";

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
import { Plus } from "lucide-react";
import {
	CategoryFormDialog,
	type CategoryFormData,
} from "@/components/forms/category-form";
import type { CategoryRow, CategoryTableMeta } from "./columns";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onAdd: (data: CategoryFormData) => void;
	onEdit: (id: string, data: CategoryFormData) => void;
	onDelete: (id: string) => void;
	isMutating?: boolean;
}

function DataTable<TData extends CategoryRow, TValue>({
	columns,
	data,
	onAdd,
	onEdit,
	onDelete,
	isMutating,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [editInitialData, setEditInitialData] = useState<
		(CategoryFormData & { id?: string }) | null
	>(null);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [categoryToDelete, setCategoryToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		onColumnFiltersChange: setColumnFilters,
		getFilteredRowModel: getFilteredRowModel(),
		state: {
			sorting,
			columnFilters,
		},
		meta: {
			onEdit: (row: CategoryRow) => {
				setEditInitialData({
					id: row.ID,
					name: row.Name,
					externalCode: row.externalCode,
				});
				setIsEditDialogOpen(true);
			},
			onDelete: (row: CategoryRow) => {
				setCategoryToDelete({ id: row.ID, name: row.Name });
				setIsDeleteDialogOpen(true);
			},
		} satisfies CategoryTableMeta,
	});

	return (
		<div className="w-full">
			<div className="flex items-center justify-between gap-2 py-4">
				<Button
					onClick={() => setIsAddDialogOpen(true)}
					className="bg-black text-white hover:bg-black/90"
					type="button"
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Category
				</Button>
				<Input
					placeholder="Filter categories..."
					value={(table.getColumn("Name")?.getFilterValue() as string) ?? ""}
					onChange={(event) =>
						table.getColumn("Name")?.setFilterValue(event.target.value)
					}
					className="max-w-sm"
				/>
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<TableHead key={header.id}>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
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
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center"
								>
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<div className="flex items-center justify-end space-x-2 py-4">
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

			{/* Add Category Dialog */}
			{isAddDialogOpen && (
				<CategoryFormDialog
					isOpen={isAddDialogOpen}
					onClose={() => setIsAddDialogOpen(false)}
					mode="create"
					onSubmit={async (payload: CategoryFormData) => {
						onAdd(payload);
						setIsAddDialogOpen(false);
					}}
				/>
			)}

			{/* Edit Category Dialog */}
			{isEditDialogOpen && editInitialData && (
				<CategoryFormDialog
					isOpen={isEditDialogOpen}
					onClose={() => setIsEditDialogOpen(false)}
					mode="edit"
					initialData={editInitialData}
					onSubmit={async (payload: CategoryFormData, id?: string) => {
						if (id) {
							onEdit(id, payload);
						}
						setIsEditDialogOpen(false);
					}}
				/>
			)}

			{/* Delete Confirmation Dialog */}
			{isDeleteDialogOpen && categoryToDelete && (
				<div className="fixed inset-0 bg-gray-500/50 flex items-center justify-center z-50">
					<div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
						<h3 className="text-lg font-semibold text-gray-900 mb-4">
							Delete Category
						</h3>
						<p className="text-gray-600 mb-6">
							Are you sure you want to delete the category "
							{categoryToDelete.name}"? This action cannot be undone.
						</p>
						<div className="flex justify-end space-x-3">
							<Button
								variant="outline"
								onClick={() => {
									setIsDeleteDialogOpen(false);
									setCategoryToDelete(null);
								}}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={isMutating}
								onClick={() => {
									onDelete(categoryToDelete.id);
									setIsDeleteDialogOpen(false);
									setCategoryToDelete(null);
								}}
							>
								Delete
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default DataTable;
