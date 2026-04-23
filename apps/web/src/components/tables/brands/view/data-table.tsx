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
	BrandFormDialog,
	type BrandFormData,
} from "@/components/forms/brand-form";
import type { BrandRow, BrandTableMeta } from "./columns";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onAdd: (data: BrandFormData) => void;
	onEdit: (id: string, data: BrandFormData) => void;
	onDelete: (id: string) => void;
	isMutating?: boolean;
	error?: unknown;
	onRetry?: () => void;
}

function DataTable<TData extends BrandRow, TValue>({
	columns,
	data,
	onAdd,
	onEdit,
	onDelete,
	isMutating,
	error,
	onRetry,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [editInitialData, setEditInitialData] = useState<
		(BrandFormData & { id?: string }) | null
	>(null);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [brandToDelete, setBrandToDelete] = useState<{
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
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: {
			sorting,
			globalFilter,
		},
		meta: {
			onEdit: (row: BrandRow) => {
				setEditInitialData({ id: row.ID, name: row.Name });
				setIsEditDialogOpen(true);
			},
			onDelete: (row: BrandRow) => {
				setBrandToDelete({ id: row.ID, name: row.Name });
				setIsDeleteDialogOpen(true);
			},
		} satisfies BrandTableMeta,
	});

	const rows = table.getRowModel().rows;

	return (
		<div className="flex h-full flex-col">
			{/* Search bar row */}
			<div className="flex shrink-0 items-center border-b border-border/40 px-6 py-3">
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search brands..."
						value={globalFilter ?? ""}
						onChange={(e) => setGlobalFilter(e.target.value)}
						className="pl-9"
					/>
				</div>
				<div className="ml-auto flex gap-2">
					<Button
						onClick={() => setIsAddDialogOpen(true)}
						className="bg-black text-white hover:bg-black/90"
						type="button"
					>
						<Plus className="mr-2 h-4 w-4" />
						Add Brand
					</Button>
				</div>
			</div>

			{/* Error state or table */}
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
									<TableCell colSpan={columns.length} className="p-0">
										<EmptyState
											title="No brands found"
											context={globalFilter ? "search" : "empty"}
										/>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Add Brand Dialog */}
			{isAddDialogOpen && (
				<BrandFormDialog
					isOpen={isAddDialogOpen}
					onClose={() => setIsAddDialogOpen(false)}
					mode="create"
					onSubmit={async (payload: BrandFormData) => {
						onAdd(payload);
						setIsAddDialogOpen(false);
					}}
				/>
			)}

			{/* Edit Brand Dialog */}
			{isEditDialogOpen && editInitialData && (
				<BrandFormDialog
					isOpen={isEditDialogOpen}
					onClose={() => setIsEditDialogOpen(false)}
					mode="edit"
					initialData={editInitialData}
					onSubmit={async (payload: BrandFormData, id?: string) => {
						if (id) {
							onEdit(id, payload);
						}
						setIsEditDialogOpen(false);
					}}
				/>
			)}

			{/* Delete Confirmation Dialog */}
			{isDeleteDialogOpen && brandToDelete && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-primary-1/50">
					<div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
						<h3 className="mb-4 text-lg font-semibold text-brand-primary-1">
							Delete Brand
						</h3>
						<p className="mb-6 text-brand-secondary-1">
							Are you sure you want to delete the brand "{brandToDelete.name}"?
							This action cannot be undone.
						</p>
						<div className="flex justify-end space-x-3">
							<Button
								variant="outline"
								onClick={() => {
									setIsDeleteDialogOpen(false);
									setBrandToDelete(null);
								}}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={isMutating}
								onClick={() => {
									onDelete(brandToDelete.id);
									setIsDeleteDialogOpen(false);
									setBrandToDelete(null);
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
