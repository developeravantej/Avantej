// LEGACY — slated for rewrite; do not extend
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/user/view/data-table";
import { PageLoader } from "@/components/ui/loading-spinner";
import { createColumns } from "@/components/tables/user/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/user/view",
)({
	component: UserViewPage,
});

function UserViewPage() {
	const { data: userContext, hasRole } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Determine if the caller is a tenant admin — controls "Login as" button visibility
	const callerIsAdmin = hasRole(["admin"]);

	// Build columns once per render — callerIsAdmin and organizationId drive the factory
	const columns = createColumns({
		callerIsAdmin,
		organizationId: organizationId ?? "",
	});

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
		return <PageLoader />;
	}

	return (
		<div className="p-6 space-y-6">
			<div className="flex items-center gap-3">
				<div>
					<h1 className="text-2xl font-bold font-heading">Members</h1>
					<p className="text-sm text-brand-secondary-1">
						Manage organization members and their roles
					</p>
				</div>
			</div>
			<DataTable columns={columns} data={members} />
		</div>
	);
}
