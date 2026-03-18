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
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceCreateEditDialog } from "@/components/forms/service-create-edit-dialog";
import { ServiceDetailDialog } from "@/components/forms/service-detail-dialog";
import { client } from "@/utils/orpc";
import { toast } from "sonner";

interface Category {
	id: string;
	name: string;
}

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	organizationId: string;
	categories: Category[];
	isLoading?: boolean;
	onSuccess: () => void;
}

export default function DataTable<TData, TValue>({
	columns,
	data,
	organizationId,
	categories,
	isLoading = false,
	onSuccess,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
	const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
	const [editServiceData, setEditServiceData] = useState<{
		id: string;
		name: string;
		categoryId: string | null;
		duration: number;
		durationUnitType: "seconds" | "minutes" | "hours";
		maxAttendees: number;
		price: number | null;
		schedulingType: "appointment" | "class_slot";
		isActive: boolean;
	} | null>(null);

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

	const handleEditService = useCallback(
		async (serviceId: string) => {
			try {
				const service = await client.services.getById({
					organizationId,
					id: serviceId,
				});
				setEditServiceData({
					id: service.id,
					name: service.name,
					categoryId: service.categoryId,
					duration: service.duration ?? 60,
					durationUnitType: (service.durationUnitType as "seconds" | "minutes" | "hours") ?? "minutes",
					maxAttendees: service.maxAttendees ?? 1,
					price: service.price ?? null,
					schedulingType: (service.schedulingType as "appointment" | "class_slot") ?? "appointment",
					isActive: service.isActive ?? true,
				});
				setIsEditDialogOpen(true);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Failed to load service";
				toast.error(message);
			}
		},
		[organizationId]
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

			<ServiceCreateEditDialog
				isOpen={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				onSuccess={onSuccess}
				organizationId={organizationId}
				mode="create"
				categories={categories}
			/>

			<ServiceCreateEditDialog
				isOpen={isEditDialogOpen}
				onClose={() => {
					setIsEditDialogOpen(false);
					setEditServiceData(null);
				}}
				onSuccess={onSuccess}
				organizationId={organizationId}
				mode="edit"
				initialData={editServiceData}
				categories={categories}
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
