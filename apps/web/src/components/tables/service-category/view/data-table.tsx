// NOTE: Not migrated to shared <EntityDataTable> because this table uses useQuery internally
// for edit data fetching, has row-click opening a ServiceCategoryDetailDialog, appends an
// inline "Commission Config" action column with its own sheet, uses an onSuccess callback
// pattern instead of onAdd/onEdit/onDelete, and handles deactivation via direct API calls.
// See zplan/04-23_15-31_frontend-table-consolidation/plan/plan.md §5 Phase 3.
import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getFilteredRowModel,
} from "@tanstack/react-table";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { ServiceFormDialog } from "@/components/forms/service-category-form";
import { ServiceCategoryDetailDialog } from "@/components/forms/service-category-detail-dialog";
import { CategoryCommissionForm } from "@/components/forms/category-commission-form";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	organizationId: string;
	isLoading?: boolean;
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: { label: string; onClick: () => void };
}

export default function DataTable<TData, TValue>({
	columns,
	data,
	organizationId,
	isLoading = false,
	emptyTitle,
	emptyDescription,
	emptyAction,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
	const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
		null,
	);
	const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
	const [commissionCategoryId, setCommissionCategoryId] = useState<
		string | null
	>(null);
	const [commissionCategoryName, setCommissionCategoryName] =
		useState<string>("");
	const [isCommissionSheetOpen, setIsCommissionSheetOpen] = useState(false);
	const qc = useQueryClient();

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
				client.serviceCategories.getById({
					organizationId,
					id: editCategoryId,
				}),
				client.serviceCategoryConfig
					.getByCategoryId({ organizationId, categoryId: editCategoryId })
					.catch(() => null),
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
					requireAdvanceBooking:
						editCategoryData.config?.requireAdvanceBooking ?? false,
					minAdvanceHours: editCategoryData.config?.minAdvanceHours ?? 0,
					enableCancellationWindow:
						editCategoryData.config?.enableCancellationWindow ?? false,
					cancellationCutoffHours:
						editCategoryData.config?.cancellationCutoffHours ?? 0,
					bufferTimeMinutes: editCategoryData.config?.bufferTimeMinutes ?? 0,
				},
			}
		: undefined;

	const handleEditCategory = useCallback((categoryId: string) => {
		setEditCategoryId(categoryId);
		setIsEditDialogOpen(true);
	}, []);

	const handleDeleteCategory = useCallback(
		async (categoryId: string) => {
			try {
				await client.serviceCategories.update({
					organizationId,
					id: categoryId,
					isActive: false,
				});
				toast.success("Category deactivated");
				qc.invalidateQueries({ queryKey: orpc.serviceCategories.list.key() });
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Failed to deactivate category";
				toast.error(message);
				throw err;
			}
		},
		[organizationId, qc],
	);

	return (
		<div className="flex h-full flex-col gap-4">
			{/* Toolbar */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 w-64">
					<Search className="h-4 w-4 text-[#737373] shrink-0" />
					<input
						placeholder="Search categories..."
						value={globalFilter ?? ""}
						onChange={(e) => setGlobalFilter(e.target.value)}
						className="flex-1 bg-transparent text-[13px] text-[#0a0a0a] placeholder:text-[#737373] outline-none"
					/>
				</div>
				<button
					type="button"
					onClick={() => setIsAddDialogOpen(true)}
					className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
				>
					<Plus className="h-4 w-4" />
					Add Category
				</button>
			</div>

			{/* Table */}
			<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				<table className="w-full">
					<thead>
						{table.getHeaderGroups().map((headerGroup) => (
							<tr
								key={headerGroup.id}
								className="border-b border-[#e5e5e5] bg-[#f3f3f3]"
							>
								{headerGroup.headers.map((header) => (
									<th
										key={header.id}
										className="py-3 px-3 text-[10px] uppercase tracking-widest font-bold text-[#737373] text-left whitespace-nowrap"
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</th>
								))}
								<th className="py-3 px-3 text-[10px] uppercase tracking-widest font-bold text-[#737373] text-left whitespace-nowrap">
									Actions
								</th>
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<tr
									key={row.id}
									onClick={() => {
										const categoryId = (row.original as { id?: string }).id;
										if (categoryId) {
											setSelectedCategoryId(categoryId);
											setIsDetailDialogOpen(true);
										}
									}}
									className="border-b border-[#e5e5e5] transition-colors hover:bg-[#f3f3f3]/60 cursor-pointer"
								>
									{row.getVisibleCells().map((cell) => (
										<td
											key={cell.id}
											className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap"
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</td>
									))}
									<td className="py-3 px-3 whitespace-nowrap">
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												const categoryId =
													(row.original as { id?: string }).id ?? "";
												const categoryName =
													(row.original as { name?: string }).name ?? "";
												setCommissionCategoryId(categoryId);
												setCommissionCategoryName(categoryName);
												setIsCommissionSheetOpen(true);
											}}
											className="rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#262626] hover:bg-[#f3f3f3] transition"
										>
											Commission Config
										</button>
									</td>
								</tr>
							))
						) : (
							<tr>
								<td colSpan={columns.length + 1} className="p-0">
									<EmptyState
										title={emptyTitle ?? "No results found"}
										description={emptyDescription}
										action={emptyAction}
										context={globalFilter ? "search" : "empty"}
									/>
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<ServiceFormDialog
				isOpen={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				organizationId={organizationId}
				mode="create"
			/>

			<ServiceFormDialog
				isOpen={isEditDialogOpen}
				onClose={() => {
					setIsEditDialogOpen(false);
					setEditCategoryId(null);
				}}
				organizationId={organizationId}
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
