import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import DataTable from "@/components/tables/sales/view/data-table";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckInRow = {
	id: string;
	clientType: "member" | "walk_in";
	clientId: string;
	clientName: string;
	branchId: string;
	branchName: string | null;
	source: "booking" | "drop_in";
	outcome: "attended" | "no_show" | "late_cancel";
	checkedInBy: string;
	checkedInByName: string | null;
	checkedInAt: Date | string;
	notes: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(date: Date | string | null): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString("en-MY", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	});
}

function SourceBadge({ source }: { source: CheckInRow["source"] }) {
	if (source === "drop_in") {
		return (
			<span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 text-xs">
				Drop-in
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700 text-xs">
			Booking
		</span>
	);
}

function OutcomeBadge({ outcome }: { outcome: CheckInRow["outcome"] }) {
	const config = {
		attended: "bg-green-100 text-green-700",
		no_show: "bg-red-100 text-red-700",
		late_cancel: "bg-orange-100 text-orange-700",
	} as const;
	const label = {
		attended: "Attended",
		no_show: "No-Show",
		late_cancel: "Late Cancel",
	} as const;
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${config[outcome]}`}
		>
			{label[outcome]}
		</span>
	);
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

function DeleteDialog({
	row,
	open,
	onOpenChange,
	organizationId,
	queryKey,
}: {
	row: CheckInRow | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	organizationId: string;
	queryKey: unknown[];
}) {
	const queryClient = useQueryClient();

	const deleteMutation = useMutation({
		mutationFn: async () => {
			if (!row) return;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (client as any).checkIns.deleteCheckIn({
				organizationId,
				id: row.id,
			});
		},
		onSuccess: () => {
			toast.success("Check-in record removed.");
			onOpenChange(false);
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (err: unknown) => {
			const msg = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Delete failed: ${msg}`);
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Remove Check-in Record</DialogTitle>
				</DialogHeader>
				<p className="text-muted-foreground text-sm">
					This will permanently delete the check-in record for{" "}
					<span className="font-medium text-foreground">
						{row?.clientName ?? "this client"}
					</span>
					. Appointment attendance flags will be reverted. This action cannot be
					undone.
				</p>
				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={deleteMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => deleteMutation.mutate()}
						disabled={deleteMutation.isPending}
					>
						{deleteMutation.isPending ? "Removing..." : "Remove"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CheckInsLog({
	rows,
	organizationId,
	queryKey,
	canDelete,
}: {
	rows: CheckInRow[];
	organizationId: string;
	queryKey: unknown[];
	canDelete: boolean;
}) {
	const [deleteTarget, setDeleteTarget] = useState<CheckInRow | null>(null);

	const columns: ColumnDef<CheckInRow>[] = [
		{
			accessorKey: "checkedInAt",
			header: "Time",
			cell: ({ row }) => (
				<span className="whitespace-nowrap text-muted-foreground text-sm">
					{formatDateTime(row.original.checkedInAt)}
				</span>
			),
		},
		{
			accessorKey: "clientName",
			header: "Name",
			cell: ({ row }) => (
				<div className="flex flex-col">
					<span className="font-medium text-sm">{row.original.clientName || "Unknown client"}</span>
					<span className="text-muted-foreground text-xs capitalize">
						{row.original.clientType === "walk_in" ? "Walk-in" : "Member"}
					</span>
				</div>
			),
		},
		{
			accessorKey: "source",
			header: "Type",
			cell: ({ row }) => <SourceBadge source={row.original.source} />,
		},
		{
			accessorKey: "outcome",
			header: "Outcome",
			cell: ({ row }) => <OutcomeBadge outcome={row.original.outcome} />,
		},
		{
			accessorKey: "checkedInByName",
			header: "Staff",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{row.original.checkedInByName ?? "—"}
				</span>
			),
		},
		...(canDelete
			? [
					{
						id: "actions",
						header: "",
						enableSorting: false,
						enableHiding: false,
						cell: ({ row }: { row: { original: CheckInRow } }) => (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
								onClick={() => setDeleteTarget(row.original)}
								aria-label="Delete check-in"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						),
					} satisfies ColumnDef<CheckInRow>,
				]
			: []),
	];

	return (
		<>
			<DataTable<CheckInRow, unknown> columns={columns} data={rows} />
			<DeleteDialog
				row={deleteTarget}
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				organizationId={organizationId}
				queryKey={queryKey}
			/>
		</>
	);
}
