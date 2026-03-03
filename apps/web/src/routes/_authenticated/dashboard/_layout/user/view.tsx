import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/user/view/data-table";
import { columns } from "@/components/tables/user/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/user/view",
)({
	component: UserViewPage,
});

function UserViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: members = [], isLoading } = useQuery({
		queryKey: ["members", organizationId],
		queryFn: () => client.members.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view members.
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
			<div className="flex items-center gap-3">
				<div>
					<h1 className="text-2xl font-bold">Members</h1>
					<p className="text-sm text-muted-foreground">
						Manage organization members and their roles
					</p>
				</div>
			</div>
			<DataTable columns={columns} data={members} />
		</div>
	);
}
