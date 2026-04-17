import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getPaginationRowModel,
	getSortedRowModel,
	getFilteredRowModel,
} from "@tanstack/react-table";
import type { SortingState, ColumnFiltersState } from "@tanstack/react-table";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createColumns, type RoomRow } from "./columns";

interface DataTableProps {
	data: RoomRow[];
	onEdit: (room: RoomRow) => void;
	onDeactivate: (id: string) => Promise<void>;
	onReactivate: (id: string) => Promise<void>;
	isDeactivating?: boolean;
	isReactivating?: boolean;
}

export function DataTable({
	data,
	onEdit,
	onDeactivate,
	onReactivate,
	isDeactivating = false,
	isReactivating = false,
}: DataTableProps) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [deactivateTarget, setDeactivateTarget] = useState<RoomRow | null>(null);
	const [reactivateTarget, setReactivateTarget] = useState<RoomRow | null>(null);

	const columns = createColumns({
		onEdit,
		onDeactivate: (room) => setDeactivateTarget(room),
		onReactivate: (room) => setReactivateTarget(room),
	});

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		onColumnFiltersChange: setColumnFilters,
		getFilteredRowModel: getFilteredRowModel(),
		state: {
			sorting,
			columnFilters,
		},
	});

	async function handleDeactivateConfirm() {
		if (!deactivateTarget) return;
		try {
			await onDeactivate(deactivateTarget.id);
			toast.success(`Room "${deactivateTarget.name}" deactivated`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to deactivate room");
		} finally {
			setDeactivateTarget(null);
		}
	}

	async function handleReactivateConfirm() {
		if (!reactivateTarget) return;
		try {
			await onReactivate(reactivateTarget.id);
			toast.success(`Room "${reactivateTarget.name}" reactivated`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to reactivate room");
		} finally {
			setReactivateTarget(null);
		}
	}

	return (
		<div className="w-full">
			<div className="flex items-center justify-end gap-2 py-4">
				<Input
					placeholder="Filter rooms..."
					value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
					onChange={(event) =>
						table.getColumn("name")?.setFilterValue(event.target.value)
					}
					className="max-w-sm"
				/>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
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
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
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
									className="h-24 text-center"
								>
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-end space-x-2 py-4">
				<div className="flex-1 text-sm text-muted-foreground">
					{table.getFilteredRowModel().rows.length} of{" "}
					{table.getCoreRowModel().rows.length} row(s) total.
				</div>
				<div className="space-x-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
					>
						Next
					</Button>
				</div>
			</div>

			{/* Deactivate Confirmation Dialog */}
			<Dialog
				open={!!deactivateTarget}
				onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Deactivate Room</DialogTitle>
						<DialogDescription>
							Are you sure you want to deactivate{" "}
							<strong>{deactivateTarget?.name}</strong>? The room will be
							marked as inactive and hidden from active lists.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeactivateTarget(null)}
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

			{/* Reactivate Confirmation Dialog */}
			<Dialog
				open={!!reactivateTarget}
				onOpenChange={(open) => { if (!open) setReactivateTarget(null); }}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Reactivate Room</DialogTitle>
						<DialogDescription>
							Reactivate <strong>{reactivateTarget?.name}</strong>? It will
							become visible in active lists again.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setReactivateTarget(null)}
							disabled={isReactivating}
						>
							Cancel
						</Button>
						<Button
							onClick={handleReactivateConfirm}
							disabled={isReactivating}
						>
							{isReactivating ? "Reactivating..." : "Reactivate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
