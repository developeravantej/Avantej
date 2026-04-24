// NOTE: Partial migration — adopts TableToolbar + StatusCallout visual primitives.
// Full migration to EntityDataTable skipped: requires enum-lookup props (brands,
// categories, suppliers, uoms) for form fields; ProductFormDialog is not compatible
// with the generic add/edit dialog slot; ProductRow uses lowercase `id`, not `ID`.
import type { ColumnDef } from "@tanstack/table-core";
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
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ProductFormDialog } from "@/components/forms/product-form";
import type { ProductRow } from "@/components/tables/products/view/columns";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { TableToolbar } from "@/components/ui/table-toolbar";

interface Brand { id: string; name: string }
interface Category { id: string; name: string }
interface Supplier { id: string; name: string }
interface Uom { id: string; name: string; symbol?: string }

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	organizationId: string;
	brands: Brand[];
	categories: Category[];
	suppliers: Supplier[];
	uoms: Uom[];
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: { label: string; onClick: () => void };
	error?: unknown;
	onRetry?: () => void;
}

export default function DataTable<TData extends ProductRow, TValue>({
	columns,
	data,
	organizationId,
	brands,
	categories,
	suppliers,
	uoms,
	emptyTitle,
	emptyDescription,
	emptyAction,
	error,
	onRetry,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<TData | null>(null);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: {
			globalFilter,
		},
	});

	return (
		<div className="flex h-full flex-col">
			<TableToolbar
				search={{
					value: globalFilter,
					onChange: setGlobalFilter,
					placeholder: "Search products...",
				}}
				actions={
					<Button
						onClick={() => setIsAddDialogOpen(true)}
						className="bg-black text-white hover:bg-black/90"
						type="button"
					>
						<Plus className="mr-2 h-4 w-4" />
						Add Product
					</Button>
				}
			/>

			{error ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<StatusCallout
						variant="error"
						title="Couldn't load data"
						message={error instanceof Error ? error.message : "An error occurred"}
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
												: flexRender(header.column.columnDef.header, header.getContext())}
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
										className="border-b border-border/30 transition-colors hover:bg-muted/30 cursor-pointer"
										onClick={() => setEditTarget(row.original)}
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id} className="whitespace-nowrap px-6 py-4 text-sm">
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={columns.length} className="p-0">
										<EmptyState
											title={emptyTitle ?? "No products found"}
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
			)}

			{/* Add dialog */}
			<ProductFormDialog
				isOpen={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				organizationId={organizationId}
				mode="create"
				brands={brands}
				categories={categories}
				suppliers={suppliers}
				uoms={uoms}
			/>

			{/* Edit dialog — opened by clicking a row */}
			<ProductFormDialog
				isOpen={editTarget !== null}
				onClose={() => setEditTarget(null)}
				organizationId={organizationId}
				mode="edit"
				initialData={editTarget ?? undefined}
				brands={brands}
				categories={categories}
				suppliers={suppliers}
				uoms={uoms}
			/>
		</div>
	);
}
