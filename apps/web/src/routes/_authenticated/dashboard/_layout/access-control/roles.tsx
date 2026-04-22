import { createFileRoute } from "@tanstack/react-router";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";
import { RolesTabPage } from "@/components/pages/access-control/roles-tab";
import { PermissionsTabPage } from "@/components/pages/access-control/permissions-tab";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/roles",
)({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "role_management", action: "read" },
			"/dashboard",
		);
	},
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "roles",
	}),
	component: RolesPage,
});

function RolesPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ConsolidatedTabs
			value={tab}
			onValueChange={(v) => navigate({ search: { tab: v } })}
			tabs={[
				{ id: "roles", label: "Roles", content: <RolesTabPage /> },
				{ id: "permissions", label: "Permissions", content: <PermissionsTabPage /> },
			]}
		/>
	);
}
