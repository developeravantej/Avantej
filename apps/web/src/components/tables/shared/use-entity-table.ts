import {
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState, Table } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import type { BaseRow } from "./types";

export interface UseEntityTableOptions<TData extends BaseRow, TMeta> {
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	/**
	 * Factory that receives `openEdit` and `openDelete` handlers and returns the
	 * entity-specific `table.options.meta` object. Called via `useMemo` so the
	 * meta reference is stable across renders as long as `data`/`columns` are stable.
	 */
	buildMeta: (handlers: {
		openEdit: (row: TData) => void;
		openDelete: (row: TData) => void;
	}) => TMeta;
}

export interface UseEntityTableReturn<TData extends BaseRow> {
	/** Fully configured react-table instance */
	table: Table<TData>;

	/** Current global filter string */
	globalFilter: string;
	/** Update the global filter (drives the search input) */
	setGlobalFilter: (v: string) => void;

	/** Whether the "Add" dialog is open */
	isAddOpen: boolean;
	openAdd: () => void;
	closeAdd: () => void;

	/** Whether the "Edit" dialog is open */
	isEditOpen: boolean;
	/** The row being edited, or `null` when the dialog is closed */
	editRow: TData | null;
	openEdit: (row: TData) => void;
	closeEdit: () => void;

	/** Whether the "Delete" dialog is open */
	isDeleteOpen: boolean;
	/** The row staged for deletion, or `null` when the dialog is closed */
	deleteRow: TData | null;
	openDelete: (row: TData) => void;
	closeDelete: () => void;
}

export function useEntityTable<TData extends BaseRow, TMeta>({
	data,
	columns,
	buildMeta,
}: UseEntityTableOptions<TData, TMeta>): UseEntityTableReturn<TData> {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState("");

	const [isAddOpen, setIsAddOpen] = useState(false);

	const [isEditOpen, setIsEditOpen] = useState(false);
	const [editRow, setEditRow] = useState<TData | null>(null);

	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [deleteRow, setDeleteRow] = useState<TData | null>(null);

	const openAdd = () => setIsAddOpen(true);
	const closeAdd = () => setIsAddOpen(false);

	const openEdit = (row: TData) => {
		setEditRow(row);
		setIsEditOpen(true);
	};
	const closeEdit = () => {
		setIsEditOpen(false);
		setEditRow(null);
	};

	const openDelete = (row: TData) => {
		setDeleteRow(row);
		setIsDeleteOpen(true);
	};
	const closeDelete = () => {
		setIsDeleteOpen(false);
		setDeleteRow(null);
	};

	const meta = useMemo(
		() => buildMeta({ openEdit, openDelete }),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	const table = useReactTable<TData>({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: "includesString",
		state: {
			sorting,
			globalFilter,
		},
		meta: meta as Record<string, unknown>,
	});

	return {
		table,
		globalFilter,
		setGlobalFilter,
		isAddOpen,
		openAdd,
		closeAdd,
		isEditOpen,
		editRow,
		openEdit,
		closeEdit,
		isDeleteOpen,
		deleteRow,
		openDelete,
		closeDelete,
	};
}
