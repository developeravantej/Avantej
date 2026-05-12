import type { ColumnDef } from "@tanstack/react-table";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "./money";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

export function moneyColumn<T>(cfg: {
	id: string;
	header: string;
	accessor: (row: T) => number;
	currency?: string;
}): ColumnDef<T> {
	return {
		id: cfg.id,
		header: cfg.header,
		accessorFn: cfg.accessor,
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatPrice(cfg.accessor(row.original), cfg.currency ?? "MYR")}
			</span>
		),
	};
}

export function dateColumn<T>(cfg: {
	id: string;
	header: string;
	accessor: (row: T) => Date | string | null | undefined;
	format?: "date" | "datetime";
}): ColumnDef<T> {
	return {
		id: cfg.id,
		header: cfg.header,
		accessorFn: cfg.accessor,
		cell: ({ row }) => {
			const raw = cfg.accessor(row.original);
			if (raw == null) return <span className="text-muted-foreground">—</span>;
			const date = raw instanceof Date ? raw : new Date(raw);
			if (Number.isNaN(date.getTime())) {
				return <span className="text-muted-foreground">—</span>;
			}
			const opts: Intl.DateTimeFormatOptions =
				cfg.format === "datetime"
					? {
							year: "numeric",
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						}
					: { year: "numeric", month: "short", day: "numeric" };
			return <span>{date.toLocaleString("en-MY", opts)}</span>;
		},
	};
}

export type RowAction<T> = {
	label: string;
	icon?: LucideIcon;
	onClick: (row: T) => void;
	variant?: "default" | "destructive";
	disabled?: (row: T) => boolean;
};

export function actionsColumn<T>(cfg: {
	id?: string;
	actions: (row: T) => RowAction<T>[];
}): ColumnDef<T> {
	return {
		id: cfg.id ?? "actions",
		header: "",
		enableSorting: false,
		enableHiding: false,
		cell: ({ row }) => {
			const actions = cfg.actions(row.original);
			return (
				<div className="flex items-center gap-1">
					{actions.map((a) => {
						const Icon = a.icon;
						const isDisabled = a.disabled?.(row.original) ?? false;
						return (
							<Button
								key={a.label}
								type="button"
								size="sm"
								variant={a.variant === "destructive" ? "destructive" : "ghost"}
								disabled={isDisabled}
								onClick={() => a.onClick(row.original)}
							>
								{Icon ? <Icon className="size-4" /> : null}
								<span className={Icon ? "sr-only" : undefined}>{a.label}</span>
							</Button>
						);
					})}
				</div>
			);
		},
	};
}

export function statusBadgeColumn<T>(cfg: {
	id: string;
	header: string;
	accessor: (row: T) => string;
	variants: Record<string, BadgeVariant>;
}): ColumnDef<T> {
	return {
		id: cfg.id,
		header: cfg.header,
		accessorFn: cfg.accessor,
		cell: ({ row }) => {
			const value = cfg.accessor(row.original);
			const variant = cfg.variants[value] ?? "secondary";
			return <Badge variant={variant}>{value}</Badge>;
		},
	};
}
