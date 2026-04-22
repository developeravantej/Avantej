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
import { useQuery } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceFormDialog } from "@/components/forms/service-category-form";
import { ServiceCategoryDetailDialog } from "@/components/forms/service-category-detail-dialog";
import { CategoryCommissionForm } from "@/components/forms/category-commission-form";
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
	const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
	const [commissionCategoryId, setCommissionCategoryId] = useState<string | null>(null);
	const [commissionCategoryName, setCommissionCategoryName] = useState<string>("");
	const [isCommissionSheetOpen, setIsCommissionSheetOpen] = useState(false);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: { globalFilter },
	});

	// Fetch real data for edit mode
	const { data: editCategoryData } = useQuery({
		queryKey: ["serviceCategory", "edit", editCategoryId, organizationId],
		queryFn: async () => {
			if (!editCategoryId || !organizationId) return null;
			const [category, config] = await Promise.all([
				client.serviceCategories.getById({ organizationId, id: editCategoryId }),
				client.serviceCategoryConfig.getByCategoryId({ organizationId, categoryId: editCategoryId }).catch(() => null),
			]);
			return { category, config };
		},
		enabled: !!editCategoryId && !!organizationId && isEditDialogOpen,
	});

	const editInitialData = editCategoryData
		? {
				id: editCategoryData.category.id,
				name: editCategoryData.category.name,
				duration: editCategoryData.config?.defaultDuration ?? 60,
				maxAttendees: editCategoryData.config?.defaultMaxAttendees ?? undefined,
				rules: {
					requireAdvanceBooking: editCategoryData.config?.requireAdvanceBooking ?? false,
					minAdvanceHours: editCategoryData.config?.minAdvanceHours ?? 0,
					enableCancellationWindow: editCategoryData.config?.enableCancellationWindow ?? false,
					cancellationCutoffHours: editCategoryData.config?.cancellationCutoffHours ?? 0,
					bufferTimeMinutes: editCategoryData.config?.bufferTimeMinutes ?? 0,
				},
			}
		: undefined;

	const handleEditCategory = useCallback(
		(categoryId: string) => {
			setEditCategoryId(categoryId);
			setIsEditDialogOpen(true);
		},
		[]
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
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between border-b border-border/40 px-6 py-3">
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search categories..."
						value={globalFilter ?? ""}
						onChange={(e) => setGlobalFilter(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Button
					size="sm"
					onClick={() => setIsAddDialogOpen(true)}
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Category
				</Button>
			</div>

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
													header.getContext()
												)}
									</TableHead>
								))}
								<TableHead className="whitespace-nowrap px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Actions
								</TableHead>
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
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
									className="border-b border-border/30 cursor-pointer transition-colors hover:bg-muted/30 data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground"
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className="whitespace-nowrap px-6 py-4 text-sm"
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
									<TableCell className="whitespace-nowrap px-6 py-4 text-sm">
										<Button
											size="sm"
											variant="outline"
											onClick={(e) => {
												e.stopPropagation();
												const categoryId = (row.original as { id?: string }).id ?? "";
												const categoryName = (row.original as { name?: string }).name ?? "";
												setCommissionCategoryId(categoryId);
												setCommissionCategoryName(categoryName);
												setIsCommissionSheetOpen(true);
											}}
										>
											Commission Config
										</Button>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="py-16 text-center text-sm text-muted-foreground"
								>
									No categories yet. Add one to get started.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<ServiceFormDialog
				isOpen={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				onSubmit={async () => { onSuccess(); }}
				mode="create"
			/>

			<ServiceFormDialog
				isOpen={isEditDialogOpen}
				onClose={() => {
					setIsEditDialogOpen(false);
					setEditCategoryId(null);
				}}
				onSubmit={async () => { onSuccess(); }}
				mode="edit"
				initialData={editInitialData}
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

			{commissionCategoryId && (
				<CategoryCommissionForm
					open={isCommissionSheetOpen}
					onOpenChange={setIsCommissionSheetOpen}
					categoryId={commissionCategoryId}
					categoryName={commissionCategoryName}
					organizationId={organizationId}
				/>
			)}
		</div>
	);
}
