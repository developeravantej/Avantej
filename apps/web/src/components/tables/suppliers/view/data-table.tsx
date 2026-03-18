import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getPaginationRowModel,
	getSortedRowModel,
	getFilteredRowModel,
} from "@tanstack/react-table";
import type { SortingState, ColumnFiltersState } from "@tanstack/react-table";
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
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { SupplierFormDialog, type SupplierFormData } from "@/components/forms/supplier-form";
import { SupplierDetailsDialog } from "@/components/dialogs/supplier-details-dialog";
import { createColumns, type SupplierRow } from "./columns";

interface DataTableProps {
	data: SupplierRow[];
	onCreateSupplier: (data: SupplierFormData) => Promise<void>;
	onUpdateSupplier: (id: string, data: SupplierFormData) => Promise<void>;
	onDeactivateSupplier: (id: string) => Promise<void>;
	isCreating?: boolean;
	isUpdating?: boolean;
	isDeactivating?: boolean;
}

export function DataTable({
	data,
	onCreateSupplier,
	onUpdateSupplier,
	onDeactivateSupplier,
	isCreating = false,
	isUpdating = false,
	isDeactivating = false,
}: DataTableProps) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
	const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
	const [selectedSupplier, setSelectedSupplier] = useState<SupplierRow | null>(null);
	const [supplierToDeactivate, setSupplierToDeactivate] = useState<SupplierRow | null>(null);

	const columns = createColumns({
		onEdit: (supplier) => {
			setSelectedSupplier(supplier);
			setIsEditDialogOpen(true);
		},
		onDeactivate: (supplier) => {
			setSupplierToDeactivate(supplier);
			setIsDeactivateDialogOpen(true);
		},
		onViewDetails: (supplier) => {
			setSelectedSupplier(supplier);
			setIsDetailsDialogOpen(true);
		},
	});

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
	});

	const handleCreate = async (formData: SupplierFormData) => {
		await onCreateSupplier(formData);
		setIsAddDialogOpen(false);
	};

	const handleUpdate = async (formData: SupplierFormData) => {
		if (!selectedSupplier) return;
		await onUpdateSupplier(selectedSupplier.id, formData);
		setIsEditDialogOpen(false);
		setSelectedSupplier(null);
	};

	const handleDeactivateConfirm = async () => {
		if (!supplierToDeactivate) return;
		try {
			await onDeactivateSupplier(supplierToDeactivate.id);
			toast.success(`Supplier "${supplierToDeactivate.name}" deactivated`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to deactivate supplier");
		} finally {
			setIsDeactivateDialogOpen(false);
			setSupplierToDeactivate(null);
		}
	};

	return (
		<div className="w-full">
			<div className="flex items-center justify-between gap-2 py-4">
				<Button
					onClick={() => setIsAddDialogOpen(true)}
					className="bg-black text-white hover:bg-black/90"
					type="button"
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Supplier
				</Button>
				<Input
					placeholder="Filter suppliers..."
					value={
						(table.getColumn("name")?.getFilterValue() as string) ?? ""
					}
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
													header.getContext()
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
												cell.getContext()
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

			{/* Add Dialog */}
			{isAddDialogOpen && (
				<SupplierFormDialog
					isOpen={isAddDialogOpen}
					onClose={() => setIsAddDialogOpen(false)}
					mode="create"
					isLoading={isCreating}
					onSubmit={async (payload) => {
						await handleCreate(payload);
					}}
				/>
			)}

			{/* Edit Dialog */}
			{isEditDialogOpen && selectedSupplier && (
				<SupplierFormDialog
					isOpen={isEditDialogOpen}
					onClose={() => {
						setIsEditDialogOpen(false);
						setSelectedSupplier(null);
					}}
					mode="edit"
					isLoading={isUpdating}
					initialData={{
						id: selectedSupplier.id,
						name: selectedSupplier.name,
						description: selectedSupplier.description ?? undefined,
						accountNumber: selectedSupplier.accountNumber ?? undefined,
						paymentTerms: selectedSupplier.paymentTerms ?? undefined,
						contactPerson: selectedSupplier.contactPerson ?? undefined,
						contactPhone: selectedSupplier.contactPhone ?? undefined,
						officePhone: selectedSupplier.officePhone ?? undefined,
						email: selectedSupplier.email ?? undefined,
						website: selectedSupplier.website ?? undefined,
						barcode: selectedSupplier.barcode ?? undefined,
						isActive: selectedSupplier.isActive,
					}}
					onSubmit={async (payload) => {
						await handleUpdate(payload);
					}}
				/>
			)}

			{/* Details Dialog */}
			<SupplierDetailsDialog
				isOpen={isDetailsDialogOpen}
				onClose={() => {
					setIsDetailsDialogOpen(false);
					setSelectedSupplier(null);
				}}
				supplier={
					selectedSupplier
						? {
								...selectedSupplier,
								createdAt: selectedSupplier.createdAt ?? null,
								updatedAt: selectedSupplier.updatedAt ?? null,
							}
						: null
				}
				onEdit={() => {
					setIsDetailsDialogOpen(false);
					if (selectedSupplier) {
						setIsEditDialogOpen(true);
					}
				}}
			/>

			{/* Deactivate Confirmation Dialog */}
			<Dialog
				open={isDeactivateDialogOpen}
				onOpenChange={setIsDeactivateDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Deactivate Supplier</DialogTitle>
						<DialogDescription>
							Are you sure you want to deactivate{" "}
							<strong>{supplierToDeactivate?.name}</strong>? The supplier
							will be marked as inactive and hidden from active lists.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsDeactivateDialogOpen(false);
								setSupplierToDeactivate(null);
							}}
							disabled={isDeactivating}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDeactivateConfirm}
							disabled={isDeactivating}
						>
							{isDeactivating ? "Deactivating..." : "Deactivate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
