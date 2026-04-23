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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { ProductFormDialog } from "@/components/forms/product-form";
import type { CreateProductInput, UpdateProductInput } from "@/hooks/useProductForm";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";

interface Brand { id: string; name: string }
interface Category { id: string; name: string }
interface Supplier { id: string; name: string }
interface Uom { id: string; name: string; symbol?: string }

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onProductCreate?: (data: CreateProductInput) => void;
	onProductUpdate?: (data: { id: string } & UpdateProductInput) => void;
	isCreating?: boolean;
	isUpdating?: boolean;
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

export default function DataTable<TData, TValue>({
	columns,
	data,
	onProductCreate,
	onProductUpdate,
	isCreating = false,
	isUpdating = false,
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

	function handleCreateSubmit(formData: CreateProductInput | ({ id: string } & UpdateProductInput)) {
		if ("id" in formData) {
			onProductUpdate?.(formData);
		} else {
			onProductCreate?.(formData as CreateProductInput);
		}
		setIsAddDialogOpen(false);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Search bar + toolbar */}
			<div className="flex shrink-0 items-center border-b border-border/40 px-6 py-3">
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search products..."
						value={globalFilter ?? ""}
						onChange={(e) => setGlobalFilter(e.target.value)}
						className="pl-9"
					/>
				</div>
				<div className="ml-auto flex gap-2">
					<Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
						<Plus className="h-4 w-4" />
						Add Product
					</Button>
				</div>
			</div>

			{/* Error state */}
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
										className="border-b border-border/30 transition-colors hover:bg-muted/30"
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

			<ProductFormDialog
				isOpen={isAddDialogOpen}
				onClose={() => setIsAddDialogOpen(false)}
				onSubmit={handleCreateSubmit}
				isLoading={isCreating || isUpdating}
				mode="create"
				brands={brands}
				categories={categories}
				suppliers={suppliers}
				uoms={uoms}
			/>
		</div>
	);
}
