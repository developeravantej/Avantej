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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
import { TableToolbar } from "@/components/ui/table-toolbar";
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
		<div className="flex h-full flex-col">
			<TableToolbar
				search={{
					value: globalFilter,
					onChange: setGlobalFilter,
					placeholder: "Search rooms...",
				}}
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
													header.getContext(),
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
									className="border-b border-border/30 transition-colors hover:bg-muted/30 data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground"
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className="whitespace-nowrap px-6 py-4 text-sm"
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
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
