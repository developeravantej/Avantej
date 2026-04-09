import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getPaginationRowModel,
	getSortedRowModel,
	getFilteredRowModel,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState, ColumnFiltersState } from "@tanstack/react-table";

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
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UomRow, UomTableMeta } from "./columns";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	isAddDialogOpen: boolean;
	onAddDialogOpenChange: (open: boolean) => void;
	editTarget: { id: string; name: string; description: string } | null;
	onEditTargetChange: (
		target: { id: string; name: string; description: string } | null,
	) => void;
	onCreate: (vars: { name: string; description?: string }) => void;
	onUpdate: (vars: { id: string; name: string; description?: string }) => void;
	onDelete: (id: string) => void;
	isCreating?: boolean;
	isUpdating?: boolean;
	isDeleting?: boolean;
}

export function DataTable<TData extends UomRow, TValue>({
	columns,
	data,
	isAddDialogOpen,
	onAddDialogOpenChange,
	editTarget,
	onEditTargetChange,
	onCreate,
	onUpdate,
	onDelete,
	isCreating,
	isUpdating,
	isDeleting,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

	// Delete confirmation state
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

	// Create form state
	const [createName, setCreateName] = useState("");
	const [createDescription, setCreateDescription] = useState("");

	// Edit form state (synced from editTarget prop)
	const [editName, setEditName] = useState("");
	const [editDescription, setEditDescription] = useState("");

	useEffect(() => {
		if (editTarget) {
			setEditName(editTarget.name);
			setEditDescription(editTarget.description);
		}
	}, [editTarget]);

	const meta: UomTableMeta = {
		onEdit: (row: UomRow) => {
			onEditTargetChange({
				id: row.id,
				name: row.name,
				description: row.description ?? "",
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
		onColumnFiltersChange: setColumnFilters,
		getFilteredRowModel: getFilteredRowModel(),
		meta,
		state: {
			sorting,
			columnFilters,
		},
	});

	function handleCreate() {
		if (!createName.trim()) {
			toast.error("Name is required");
			return;
		}
		onCreate({
			name: createName.trim(),
			description: createDescription.trim() || undefined,
		});
		setCreateName("");
		setCreateDescription("");
	}

	function handleUpdate() {
		if (!editTarget) return;
		if (!editName.trim()) {
			toast.error("Name is required");
			return;
		}
		onUpdate({
			id: editTarget.id,
			name: editName.trim(),
			description: editDescription.trim() || undefined,
		});
	}

	return (
		<div className="w-full">
			<div className="flex items-center justify-between gap-2 py-4">
				<Button
					onClick={() => onAddDialogOpenChange(true)}
					className="bg-black text-white hover:bg-black/90"
					type="button"
				>
					<Plus className="mr-2 h-4 w-4" />
					Add UoM
				</Button>
				<Input
					placeholder="Filter UoMs..."
					value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
					onChange={(event) =>
						table.getColumn("name")?.setFilterValue(event.target.value)
					}
					className="max-w-sm"
				/>
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
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

			{/* Create Dialog */}
			<Dialog open={isAddDialogOpen} onOpenChange={onAddDialogOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Add New UoM</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="create-name"
								placeholder="e.g., Piece, Kilogram"
								value={createName}
								onChange={(e) => setCreateName(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="create-description">Description</Label>
							<Textarea
								id="create-description"
								placeholder="Optional description for this UoM"
								value={createDescription}
								onChange={(e) => setCreateDescription(e.target.value)}
								rows={3}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => onAddDialogOpenChange(false)}
							disabled={isCreating}
						>
							Cancel
						</Button>
						<Button onClick={handleCreate} disabled={isCreating}>
							{isCreating ? "Adding..." : "Add UoM"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Dialog */}
			<Dialog
				open={editTarget !== null}
				onOpenChange={(open) => {
					if (!open) onEditTargetChange(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Edit UoM</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="edit-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="edit-name"
								placeholder="e.g., Piece, Kilogram"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="edit-description">Description</Label>
							<Textarea
								id="edit-description"
								placeholder="Optional description for this UoM"
								value={editDescription}
								onChange={(e) => setEditDescription(e.target.value)}
								rows={3}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => onEditTargetChange(null)}
							disabled={isUpdating}
						>
							Cancel
						</Button>
						<Button onClick={handleUpdate} disabled={isUpdating}>
							{isUpdating ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Confirm Delete</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this unit of measure? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
							Cancel
						</Button>
						<Button
							variant="destructive"
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
