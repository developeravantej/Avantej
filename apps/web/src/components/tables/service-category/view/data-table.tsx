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
import { useState, useCallback } from "react";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceCategoryCreateEditDialog } from "@/components/forms/service-category-create-edit-dialog";
import { ServiceCategoryDetailDialog } from "@/components/forms/service-category-detail-dialog";
import { client } from "@/utils/orpc";
import { toast } from "sonner";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	organizationId: string;
	isLoading?: boolean;
	onSuccess: () => void;
}

export default function DataTable<TData, TValue>({
	columns,
	data,
	organizationId,
	isLoading = false,
	onSuccess,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
	const [editCategoryData, setEditCategoryData] = useState<{
		id: string;
		name: string;
		description: string | null;
		displayOrder: number;
		isActive: boolean;
	} | null>(null);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: { globalFilter },
	});

	const handleEditCategory = useCallback(
		async (categoryId: string) => {
			try {
				const category = await client.serviceCategories.getById({
					organizationId,
					id: categoryId,
				});
				setEditCategoryData({
					id: category.id,
					name: category.name,
					description: category.description,
					displayOrder: category.displayOrder ?? 0,
					isActive: category.isActive ?? true,
				});
				setIsEditDialogOpen(true);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Failed to load category";
				toast.error(message);
			}
		},
		[organizationId]
	);

	const handleDeleteCategory = useCallback(
		async (categoryId: string) => {
			try {
				await client.serviceCategories.update({
					organizationId,
					id: categoryId,
					isActive: false,
				});
				toast.success("Category deactivated");
				onSuccess();
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Failed to deactivate category";
				toast.error(message);
				throw err;
			}
		},
		[organizationId, onSuccess]
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<Button
					onClick={() => setIsAddDialogOpen(true)}
					className="bg-black text-white hover:bg-black/90"
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Service Category
				</Button>
				<div className="relative w-72">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search..."
						value={globalFilter ?? ""}
						onChange={(e) => setGlobalFilter(e.target.value)}
						className="pl-8"
					/>
				</div>
			</div>

			{isLoading ? (
				<div className="rounded-md border flex items-center justify-center py-12 text-muted-foreground">
					Loading...
				</div>
			) : (
				<div className="rounded-md border shadow-sm">
					<Table>
						<TableHeader>
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow
									key={headerGroup.id}
									className="border-b bg-muted/50 hover:bg-muted/60"
								>
									{headerGroup.headers.map((header) => (
										<TableHead
											key={header.id}
											className="px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap"
										>
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
								table.getRowModel().rows.map((row, index) => (
									<TableRow
										key={row.id}
										data-state={row.getIsSelected() && "selected"}
										onClick={() => {
											const categoryId = (row.original as { id?: string }).id;
											if (categoryId) {
												setSelectedCategoryId(categoryId);
												setIsDetailDialogOpen(true);
											}
										}}
										className={`border-b transition-colors hover:bg-muted/50 cursor-pointer data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell
												key={cell.id}
												className="px-4 py-3 text-sm whitespace-nowrap"
											>
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
										className="h-24 text-center text-muted-foreground"
									>
										No categories yet. Add one to get started.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}

			<ServiceCategoryCreateEditDialog
				isOpen={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				onSuccess={onSuccess}
				organizationId={organizationId}
				mode="create"
			/>

			<ServiceCategoryCreateEditDialog
				isOpen={isEditDialogOpen}
				onClose={() => {
					setIsEditDialogOpen(false);
					setEditCategoryData(null);
				}}
				onSuccess={onSuccess}
				organizationId={organizationId}
				mode="edit"
				initialData={editCategoryData}
			/>

			<ServiceCategoryDetailDialog
				isOpen={isDetailDialogOpen}
				onClose={() => {
					setIsDetailDialogOpen(false);
					setSelectedCategoryId(null);
				}}
				categoryId={selectedCategoryId}
				organizationId={organizationId}
				onEdit={handleEditCategory}
				onDelete={handleDeleteCategory}
			/>
		</div>
	);
}
