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
import { Input } from "@/components/ui/input";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceFormDialog } from "@/components/forms/service-form";
import { ServiceDetailDialog } from "@/components/forms/service-detail-dialog";
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
					price: editServiceData.price != null ? editServiceData.price / 100 : 0,
					sessions: editServiceData.sessionCount ?? 1,
					taxable: editServiceData.taxable ?? false,
					tax_percentage: editServiceData.taxPercentage ?? 0,
					category_id: editServiceData.categoryId ?? "",
					schedulingType: (editServiceData.schedulingType === "class_slot" ? "time-preset" : "appointment-based") as "appointment-based" | "time-preset",
					sessionDurationMinutes: editServiceData.durationUnitType === "minutes"
						? editServiceData.duration
						: editServiceData.durationUnitType === "hours"
							? editServiceData.duration * 60
							: Math.round(editServiceData.duration / 60),
					maxAttendees: editServiceData.maxAttendees ?? 1,
					availablePaymentPlans: (editServiceData.availablePaymentPlans ?? []) as string[],
					installmentIntervalDays: editServiceData.installmentIntervalDays ?? 30,
					gracePeriodDays: (editServiceData as any).gracePeriodDays ?? null,
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
				onSuccess();
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Failed to deactivate service";
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
					Add Service
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
											const serviceId = (row.original as { id?: string }).id;
											if (serviceId) {
												setSelectedServiceId(serviceId);
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
										No services yet. Add one to get started.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>
			)}

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
					setEditServiceId(null);
				}}
				onSubmit={async () => { onSuccess(); }}
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
