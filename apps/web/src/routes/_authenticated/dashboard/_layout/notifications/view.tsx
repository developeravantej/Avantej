import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import DataTable from "@/components/tables/sales/view/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
	columns as staticColumns,
	type NotificationRow,
} from "@/components/tables/notifications/view/columns";
import { Bell } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/notifications/view",
)({
	component: NotificationsViewPage,
});

const READ_TABS = [
	{ value: undefined, label: "All" },
	{ value: false, label: "Unread" },
	{ value: true, label: "Read" },
] as const;

function NotificationsViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [readFilter, setReadFilter] = useState<boolean | undefined>(undefined);

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["notifications", organizationId, readFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.notifications.list({
				organizationId,
				isRead: readFilter,
			});
		},
		enabled: !!organizationId,
	});

	const markAllReadMutation = useMutation({
		mutationFn: () =>
			client.notifications.markAllRead({
				organizationId: organizationId!,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["notifications", organizationId],
			});
			toast.success("All marked as read");
		},
	});

	const markReadMutation = useMutation({
		mutationFn: (id: string) =>
			client.notifications.markRead({
				organizationId: organizationId!,
				id,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["notifications", organizationId],
			});
		},
	});

	const data: NotificationRow[] = apiData.map((item) => ({
		id: item.id,
		title: item.title,
		message: item.message,
		type: item.type,
		isRead: item.isRead,
		createdAt: item.createdAt
			? new Date(item.createdAt).toISOString()
			: "",
	}));

	const columns: ColumnDef<NotificationRow>[] = [
		...staticColumns,
		{
			id: "actions",
			header: "Action",
			cell: ({ row }) =>
				!row.original.isRead ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => markReadMutation.mutate(row.original.id)}
						disabled={markReadMutation.isPending}
					>
						Mark Read
					</Button>
				) : null,
			enableSorting: false,
			enableHiding: false,
		},
	];

	// Guard: no org selected
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view notifications.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Bell className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold">Notifications</h1>
						<p className="text-muted-foreground text-sm">
							Your notification history.
						</p>
					</div>
				</div>
				<Button
					onClick={() => markAllReadMutation.mutate()}
					disabled={markAllReadMutation.isPending || data.length === 0}
					variant="outline"
				>
					{markAllReadMutation.isPending ? "Marking…" : "Mark All as Read"}
				</Button>
			</div>

			{/* Read/Unread filter tabs */}
			<div className="flex items-center rounded-lg border bg-muted/40 p-1 gap-1">
				{READ_TABS.map((tab) => (
					<button
						key={tab.label}
						type="button"
						onClick={() => setReadFilter(tab.value)}
						className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
							readFilter === tab.value
								? "bg-background shadow-sm text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>

			<Separator />

			{/* Table or empty state */}
			{data.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
					<Bell className="h-10 w-10 opacity-30" />
					<p className="text-sm">
						{readFilter === false
							? "You're all caught up!"
							: "No notifications"}
					</p>
				</div>
			) : (
				<DataTable<NotificationRow, unknown> columns={columns} data={data} />
			)}
		</div>
	);
}
