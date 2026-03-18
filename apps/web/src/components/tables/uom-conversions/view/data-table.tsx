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
	DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { UomConversionRow, UomConversionTableMeta } from "./columns";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	/** Map of uom id → name for displaying base UOM names */
	uomMap: Record<string, string>;
	/** Base UOMs (no parent) for the create/edit form selector */
	baseUoms: { id: string; name: string }[];
	isAddDialogOpen: boolean;
	onAddDialogOpenChange: (open: boolean) => void;
	editTarget: {
		id: string;
		name: string;
		description: string;
		baseUomId: string;
		conversionFactor: string;
	} | null;
	onEditTargetChange: (
		target: {
			id: string;
			name: string;
			description: string;
			baseUomId: string;
			conversionFactor: string;
		} | null,
	) => void;
	onCreate: (vars: {
		name: string;
		description?: string;
		baseUomId: string;
		conversionFactor: string;
	}) => void;
	onUpdate: (vars: {
		id: string;
		name?: string;
		description?: string;
		baseUomId?: string;
		conversionFactor?: string;
	}) => void;
	onDelete: (id: string) => void;
	isCreating?: boolean;
	isUpdating?: boolean;
	isDeleting?: boolean;
}

function DataTable<TData extends UomConversionRow, TValue>({
	columns,
	data,
	uomMap,
	baseUoms,
	isAddDialogOpen,
	onAddDialogOpenChange,
	editTarget,
	onEditTargetChange,
	onCreate,
	onUpdate,
	onDelete,
	isCreating,
	isUpdating,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

	// Create form state
	const [createName, setCreateName] = useState("");
	const [createDescription, setCreateDescription] = useState("");
	const [createBaseUomId, setCreateBaseUomId] = useState("");
	const [createFactor, setCreateFactor] = useState("1");

	// Edit form state
	const [editName, setEditName] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const [editBaseUomId, setEditBaseUomId] = useState("");
	const [editFactor, setEditFactor] = useState("1");

	useEffect(() => {
		if (editTarget) {
			setEditName(editTarget.name);
			setEditDescription(editTarget.description);
			setEditBaseUomId(editTarget.baseUomId);
			setEditFactor(editTarget.conversionFactor);
		}
	}, [editTarget]);

	const meta: UomConversionTableMeta = {
		uomMap,
		onEdit: (row: UomConversionRow) => {
			onEditTargetChange({
				id: row.id,
				name: row.name,
				description: row.description ?? "",
				baseUomId: row.baseUomId ?? "",
				conversionFactor: row.conversionFactor,
			});
		},
		onDelete: (id: string) => {
			onDelete(id);
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
		if (!createBaseUomId) {
			toast.error("Base UoM is required for a conversion");
			return;
		}
		if (!createFactor || Number(createFactor) <= 0) {
			toast.error("Conversion factor must be greater than 0");
			return;
		}
		onCreate({
			name: createName.trim(),
			description: createDescription.trim() || undefined,
			baseUomId: createBaseUomId,
			conversionFactor: createFactor,
		});
		setCreateName("");
		setCreateDescription("");
		setCreateBaseUomId("");
		setCreateFactor("1");
	}

	function handleUpdate() {
		if (!editTarget) return;
		if (!editName.trim()) {
			toast.error("Name is required");
			return;
		}
		if (!editBaseUomId) {
			toast.error("Base UoM is required for a conversion");
			return;
		}
		if (!editFactor || Number(editFactor) <= 0) {
			toast.error("Conversion factor must be greater than 0");
			return;
		}
		onUpdate({
			id: editTarget.id,
			name: editName.trim(),
			description: editDescription.trim() || undefined,
			baseUomId: editBaseUomId,
			conversionFactor: editFactor,
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
					Add Conversion
				</Button>
				<Input
					placeholder="Filter conversions..."
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
									No conversions found.
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
						<DialogTitle>Add UoM Conversion</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="c-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="c-name"
								placeholder="e.g., Gram"
								value={createName}
								onChange={(e) => setCreateName(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="c-base">
								Base UoM <span className="text-destructive">*</span>
							</Label>
							<select
								id="c-base"
								value={createBaseUomId}
								onChange={(e) => setCreateBaseUomId(e.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
							>
								<option value="">Select base UoM...</option>
								{baseUoms.map((u) => (
									<option key={u.id} value={u.id}>
										{u.name}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="c-factor">
								Conversion Factor <span className="text-destructive">*</span>
							</Label>
							<Input
								id="c-factor"
								type="number"
								step="any"
								min="0"
								placeholder="e.g., 1000"
								value={createFactor}
								onChange={(e) => setCreateFactor(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="c-desc">Description</Label>
							<Textarea
								id="c-desc"
								placeholder="Optional description"
								value={createDescription}
								onChange={(e) => setCreateDescription(e.target.value)}
								rows={2}
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
							{isCreating ? "Adding..." : "Add Conversion"}
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
						<DialogTitle>Edit UoM Conversion</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="e-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="e-name"
								placeholder="e.g., Gram"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="e-base">
								Base UoM <span className="text-destructive">*</span>
							</Label>
							<select
								id="e-base"
								value={editBaseUomId}
								onChange={(e) => setEditBaseUomId(e.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
							>
								<option value="">Select base UoM...</option>
								{baseUoms.map((u) => (
									<option key={u.id} value={u.id}>
										{u.name}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="e-factor">
								Conversion Factor <span className="text-destructive">*</span>
							</Label>
							<Input
								id="e-factor"
								type="number"
								step="any"
								min="0"
								placeholder="e.g., 1000"
								value={editFactor}
								onChange={(e) => setEditFactor(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="e-desc">Description</Label>
							<Textarea
								id="e-desc"
								placeholder="Optional description"
								value={editDescription}
								onChange={(e) => setEditDescription(e.target.value)}
								rows={2}
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
		</div>
	);
}

export default DataTable;
