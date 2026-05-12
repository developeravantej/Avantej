// NOTE: Partial migration — adopts TableToolbar visual primitive for the search bar and add button.
// Full migration to EntityDataTable skipped: self-fetches with useQuery inside the component,
// deactivation semantics (not delete), row-click detail dialog pattern,
// and the data uses ColumnDef<any> with no typed ID field.
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
	getSortedRowModel,
} from "@tanstack/react-table";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceFormDialog } from "@/components/forms/service-form";
import { ServiceDetailDialog } from "@/components/forms/service-detail-dialog";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { TableToolbar } from "@/components/ui/table-toolbar";
import { centsToRm } from "@/lib/money";

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
	const qc = useQueryClient();
	const [globalFilter, setGlobalFilter] = useState("");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
	const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
	const [editServiceId, setEditServiceId] = useState<string | null>(null);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		enableSorting: true,
		state: { globalFilter },
	});

	// Fetch real data for edit mode
	const { data: editServiceData } = useQuery({
		queryKey: ["service", "edit", editServiceId, organizationId],
		queryFn: async () => {
			if (!editServiceId || !organizationId) return null;
			return client.services.getById({ organizationId, id: editServiceId });
		},
		enabled: !!editServiceId && !!organizationId && isEditDialogOpen,
	});

	const editInitialData = editServiceData
		? (() => {
				const expiryDays = editServiceData.expiryDays ?? null;
				let duration = 1;
				let duration_unit = "day";
				if (expiryDays) {
					if (expiryDays % 365 === 0) { duration = expiryDays / 365; duration_unit = "year"; }
					else if (expiryDays % 30 === 0) { duration = expiryDays / 30; duration_unit = "month"; }
					else if (expiryDays % 7 === 0) { duration = expiryDays / 7; duration_unit = "week"; }
					else { duration = expiryDays; duration_unit = "day"; }
				}
				return {
					id: editServiceData.id,
					name: editServiceData.name,
					duration,
					duration_unit,
					expirable: editServiceData.expirable ?? false,
					// price divided by 100 here (cents → dollars); form displays dollars, zod transform converts back on submit
					price: editServiceData.price != null ? Number(centsToRm(editServiceData.price)) : 0,
					sessions: editServiceData.sessionCount ?? 1,
					taxable: editServiceData.taxable ?? false,
					taxPercentage: editServiceData.taxPercentage ?? 0,
					categoryId: editServiceData.categoryId ?? "",
					schedulingType: (editServiceData.schedulingType === "class_slot" ? "time-preset" : "appointment-based") as "appointment-based" | "time-preset",
					sessionDurationMinutes: editServiceData.durationUnitType === "minutes"
						? editServiceData.duration
						: editServiceData.durationUnitType === "hours"
							? editServiceData.duration * 60
							: Math.round(editServiceData.duration / 60),
					maxAttendees: editServiceData.maxAttendees ?? 1,
					availablePaymentPlans: (editServiceData.availablePaymentPlans ?? []) as string[],
					installmentIntervalDays: editServiceData.installmentIntervalDays ?? 30,
					gracePeriodDays: editServiceData.gracePeriodDays ?? null,
					timePresetConfig: editServiceData.timePresetConfig ?? undefined,
				};
			})()
		: undefined;

	const handleEditService = useCallback(
		(serviceId: string) => {
			setEditServiceId(serviceId);
			setIsEditDialogOpen(true);
		},
		[]
	);

	const handleDeleteService = useCallback(
		async (serviceId: string) => {
			try {
				await client.services.update({
					organizationId,
					id: serviceId,
					isActive: false,
				});
				toast.success("Service deactivated");
				qc.invalidateQueries({ queryKey: orpc.services.list.key() });
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Failed to deactivate service";
				toast.error(message);
				throw err;
			}
		},
		[organizationId, qc]
	);

	return (
		<div className="flex h-full flex-col">
			<TableToolbar
				search={{
					value: globalFilter,
					onChange: setGlobalFilter,
					placeholder: "Search services...",
				}}
				actions={
					<Button
						size="sm"
						onClick={() => setIsAddDialogOpen(true)}
						className="bg-black text-white hover:bg-black/90"
						type="button"
					>
						<Plus className="mr-2 size-4" />
						Add Service
					</Button>
				}
			/>

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
										const serviceId = (row.original as { id?: string }).id;
										if (serviceId) {
											setSelectedServiceId(serviceId);
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
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={columns.length} className="p-0">
									<EmptyState
										title={emptyTitle ?? "No results found"}
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
					setEditServiceId(null);
				}}
				organizationId={organizationId}
				mode="edit"
				initialData={editInitialData}
			/>

			<ServiceDetailDialog
				isOpen={isDetailDialogOpen}
				onClose={() => {
					setIsDetailDialogOpen(false);
					setSelectedServiceId(null);
				}}
				serviceId={selectedServiceId}
				organizationId={organizationId}
				onEdit={handleEditService}
				onDelete={handleDeleteService}
			/>
		</div>
	);
}
