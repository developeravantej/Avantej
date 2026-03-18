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
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<Button
					onClick={() => setIsAddDialogOpen(true)}
					className="gap-2"
				>
					<Plus className="h-4 w-4" />
					Add Product
				</Button>
				<div className="relative w-72">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search products..."
						value={globalFilter ?? ""}
						onChange={(event) => setGlobalFilter(event.target.value)}
						className="pl-8"
					/>
				</div>
			</div>

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
											: flexRender(header.column.columnDef.header, header.getContext())}
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
									className={`border-b transition-colors hover:bg-muted/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className="px-4 py-3 text-sm whitespace-nowrap">
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
									No products found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

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
