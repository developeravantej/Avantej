import type { ColumnDef } from "@tanstack/table-core";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RoomRow = {
	id: string;
	name: string;
	type: "consultation" | "group_session" | "private" | "training" | "individual";
	branchId: string;
	branchName: string;
	capacity: number;
	isActive: boolean;
	createdAt: string | null;
	updatedAt: string | null;
};

const TYPE_LABELS: Record<RoomRow["type"], string> = {
	consultation: "Consultation",
	group_session: "Group Session",
	private: "Private",
	training: "Training",
	individual: "Individual",
};

interface ColumnMeta {
	onEdit: (room: RoomRow) => void;
	onDeactivate: (room: RoomRow) => void;
	onReactivate: (room: RoomRow) => void;
}

export function createColumns(meta: ColumnMeta): ColumnDef<RoomRow>[] {
	return [
		{
			accessorKey: "name",
			header: ({ column }) => (
				<Button
					variant="ghost"
					className="h-auto p-0 hover:bg-transparent"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Name
					<ArrowUpDown className="ml-2 size-4" />
				</Button>
			),
			cell: ({ row }) => (
				<span className="font-semibold text-[#0a0a0a]">{row.original.name}</span>
			),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => (
				<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-[#f3f3f3] text-[#737373]">
					{TYPE_LABELS[row.original.type]}
				</span>
			),
		},
		{
			accessorKey: "branchName",
			header: "Branch",
			cell: ({ row }) => (
				<span className="text-[#737373]">{row.original.branchName}</span>
			),
		},
		{
			accessorKey: "capacity",
			header: "Capacity",
			cell: ({ row }) => (
				<span className="font-mono tabular-nums">{row.original.capacity}</span>
			),
		},
		{
			accessorKey: "isActive",
			header: "Status",
			cell: ({ row }) =>
				row.original.isActive ? (
					<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-green-50 text-green-700">
						Active
					</span>
				) : (
					<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-[#f3f3f3] text-[#737373]">
						Inactive
					</span>
				),
		},
		{
			id: "actions",
			enableHiding: false,
			cell: ({ row }) => {
				const room = row.original;
				return (
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => meta.onEdit(room)}
							className="rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#262626] hover:bg-[#f3f3f3] transition"
						>
							Edit
						</button>
						{room.isActive ? (
							<button
								type="button"
								onClick={() => meta.onDeactivate(room)}
								className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition"
							>
								Deactivate
							</button>
						) : (
							<button
								type="button"
								onClick={() => meta.onReactivate(room)}
								className="rounded-lg border border-green-200 bg-white px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-50 transition"
							>
								Reactivate
							</button>
						)}
					</div>
				);
			},
		},
	];
}
