import type { ColumnDef } from "@tanstack/table-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Name
					<ArrowUpDown className="ml-2 size-4" />
				</Button>
			),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => (
				<Badge variant="outline">{TYPE_LABELS[row.original.type]}</Badge>
			),
		},
		{
			accessorKey: "branchName",
			header: "Branch",
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">{row.original.branchName}</span>
			),
		},
		{
			accessorKey: "capacity",
			header: () => <div className="text-right">Capacity</div>,
			cell: ({ row }) => (
				<div className="text-right font-medium">{row.original.capacity}</div>
			),
		},
		{
			accessorKey: "isActive",
			header: "Status",
			cell: ({ row }) => (
				<Badge variant={row.original.isActive ? "default" : "secondary"}>
					{row.original.isActive ? "Active" : "Inactive"}
				</Badge>
			),
		},
		{
			id: "actions",
			enableHiding: false,
			cell: ({ row }) => {
				const room = row.original;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="size-8 p-0">
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => meta.onEdit(room)}>
								Edit room
							</DropdownMenuItem>
							{room.isActive ? (
								<DropdownMenuItem
									onClick={() => meta.onDeactivate(room)}
									className="text-red-600 focus:text-red-600"
								>
									Deactivate room
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									onClick={() => meta.onReactivate(room)}
									className="text-green-600 focus:text-green-600"
								>
									Reactivate room
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];
}
