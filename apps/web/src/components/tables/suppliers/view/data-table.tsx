import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getPaginationRowModel,
	getSortedRowModel,
	getFilteredRowModel,
} from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
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
import { toast } from "sonner";
import {
	SupplierFormDialog,
	type SupplierFormData,
} from "@/components/forms/supplier-form";
import { SupplierDetailsDialog } from "@/components/dialogs/supplier-details-dialog";
import { createColumns, type SupplierRow } from "./columns";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";

interface DataTableProps {
	data: SupplierRow[];
	onCreateSupplier: (data: SupplierFormData) => Promise<void>;
	onUpdateSupplier: (id: string, data: SupplierFormData) => Promise<void>;
	onDeactivateSupplier: (id: string) => Promise<void>;
	isCreating?: boolean;
	isUpdating?: boolean;
	isDeactivating?: boolean;
	error?: unknown;
	onRetry?: () => void;
}

export function DataTable({
	data,
	onCreateSupplier,
	onUpdateSupplier,
	onDeactivateSupplier,
	isCreating = false,
	isUpdating = false,
	isDeactivating = false,
	error,
	onRetry,
}: DataTableProps) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
	const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
	const [selectedSupplier, setSelectedSupplier] = useState<SupplierRow | null>(
		null,
	);
	const [supplierToDeactivate, setSupplierToDeactivate] =
		useState<SupplierRow | null>(null);

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
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: {
			sorting,
			globalFilter,
		},
	});

	const rows = table.getRowModel().rows;

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
			toast.error(
				err instanceof Error ? err.message : "Failed to deactivate supplier",
			);
		} finally {
			setIsDeactivateDialogOpen(false);
			setSupplierToDeactivate(null);
		}
	};

	return (
		<div className="flex h-full flex-col">
			{/* Search bar row */}
			<div className="flex shrink-0 items-center border-b border-border/40 px-6 py-3">
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search suppliers..."
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
						Add Supplier
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
											title="No suppliers found"
											context={globalFilter ? "search" : "empty"}
										/>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}

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
							<strong>{supplierToDeactivate?.name}</strong>? The supplier will
							be marked as inactive and hidden from active lists.
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
