import type { Table } from "@tanstack/react-table";
import type { ReactNode } from "react";

/** Shared row constraint — every entity row type must have an uppercase `ID` string field. */
export type BaseRow = { ID: string };

export interface EntityDataTableProps<TData extends BaseRow> {
	/** react-table instance returned by `useEntityTable` */
	table: Table<TData>;
	/** `columns.length` — used for `colSpan` on the empty/loading row */
	columnsLength: number;
	/** Placeholder text for the search input, e.g. "Search brands..." */
	searchPlaceholder: string;
	/** Current global filter value */
	globalFilter: string;
	/** Called whenever the search input changes */
	onGlobalFilterChange: (v: string) => void;
	/** Label for the add button, e.g. "Add Brand". Omit for read-only tables. */
	addLabel?: string;
	/** Called when the add button is clicked. Omit for read-only tables. */
	onAddClick?: () => void;
	/** Optional extra toolbar actions rendered alongside (or instead of) the Add button. */
	toolbarActions?: ReactNode;
	/** Optional filter UI rendered between the search input and the actions. */
	toolbarFilters?: ReactNode;
	/** If set, renders an error callout instead of the table */
	error?: unknown;
	/** Retry handler shown inside the error callout */
	onRetry?: () => void;
	/** Text shown in the empty state, e.g. "No brands found" */
	emptyTitle: string;
	/** Per-entity dialog slot — add/edit/delete dialogs rendered here */
	children?: ReactNode;
}
