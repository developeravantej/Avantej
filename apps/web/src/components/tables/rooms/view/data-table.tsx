// NOTE: Partial migration — adopts TableToolbar visual primitive for the search bar.
// Full migration to EntityDataTable skipped: deactivate/reactivate flow (not add/edit/delete),
// RoomRow uses lowercase `id` (not `ID`), and caller supplies async handlers.
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	getSortedRowModel,
	getFilteredRowModel,
} from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Search } from "lucide-react";
import { createColumns, type RoomRow } from "./columns";

interface DataTableProps {
	data: RoomRow[];
	onEdit: (room: RoomRow) => void;
	onDeactivate: (id: string) => Promise<void>;
	onReactivate: (id: string) => Promise<void>;
	isDeactivating?: boolean;
	isReactivating?: boolean;
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: { label: string; onClick: () => void };
}

export function DataTable({
	data,
	onEdit,
	onDeactivate,
	onReactivate,
	isDeactivating = false,
	isReactivating = false,
	emptyTitle,
	emptyDescription,
	emptyAction,
}: DataTableProps) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
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
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: {
			sorting,
			globalFilter,
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
		<div className="flex h-full flex-col gap-4">
			{/* Search toolbar */}
			<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 w-64">
				<Search className="h-4 w-4 text-[#737373] shrink-0" />
				<input
					placeholder="Search rooms..."
					value={globalFilter}
					onChange={(e) => setGlobalFilter(e.target.value)}
					className="flex-1 bg-transparent text-[13px] text-[#0a0a0a] placeholder:text-[#737373] outline-none"
				/>
			</div>

			{/* Table */}
			<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				<table className="w-full">
					<thead>
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id} className="border-b border-[#e5e5e5] bg-[#f3f3f3]">
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
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<tr
									key={row.id}
									className="border-b border-[#e5e5e5] transition-colors hover:bg-[#f3f3f3]/60"
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
								</tr>
							))
						) : (
							<tr>
								<td colSpan={columns.length} className="p-0">
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
