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
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	onServiceAdd?: (data: unknown) => Promise<void>;
	// Empty state
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: {
		label: string;
		onClick: () => void;
	};
	// Error state
	error?: unknown;
	onRetry?: () => void;
}

export default function DataTable<TData, TValue>({
	columns,
	data,
	emptyTitle,
	emptyDescription,
	emptyAction,
	error,
	onRetry,
}: DataTableProps<TData, TValue>) {
	const [globalFilter, setGlobalFilter] = useState("");

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
			<div className="flex shrink-0 items-center border-b border-border/40 px-6 py-3">
				<div className="relative w-64">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search..."
						value={globalFilter ?? ""}
						onChange={(event) => setGlobalFilter(event.target.value)}
						className="pl-9"
					/>
				</div>
			</div>
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
			)}
		</div>
	);
}
