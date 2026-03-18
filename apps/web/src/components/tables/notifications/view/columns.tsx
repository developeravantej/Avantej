import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";

export interface NotificationRow {
	id: string;
	title: string;
	message: string;
	type: string;
	isRead: boolean;
	createdAt: string;
}

function timeAgo(dateStr: string): string {
	const d = new Date(dateStr);
	const diff = Date.now() - d.getTime();
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	return `${Math.floor(diff / 86400000)}d ago`;
}

export const columns: ColumnDef<NotificationRow>[] = [
	{
		accessorKey: "title",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Title" />
		),
		cell: ({ row }) => (
			<span className={row.original.isRead ? "" : "font-bold"}>
				{row.original.title}
			</span>
		),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "message",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Message" />
		),
		cell: ({ row }) => {
			const msg = row.original.message ?? "";
			return msg.length > 80 ? `${msg.slice(0, 80)}...` : msg;
		},
		enableSorting: false,
		enableHiding: false,
	},
	{
		accessorKey: "type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Type" />
		),
		cell: ({ getValue }) => {
			const type = getValue<string>();
			return <Badge variant="outline">{type}</Badge>;
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "createdAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Date" />
		),
		cell: ({ getValue }) => {
			const val = getValue<string>();
			return val ? timeAgo(val) : "N/A";
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		id: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Status" />
		),
		cell: ({ row }) =>
			!row.original.isRead ? (
				<Badge variant="secondary">Unread</Badge>
			) : null,
		enableSorting: false,
		enableHiding: false,
	},
];
