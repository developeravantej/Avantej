import { createFileRoute } from "@tanstack/react-router";

import { requirePermission } from "@/lib/route-guards";
import { BranchPage } from "@/components/pages/branch/BranchPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/branch/view",
)({
	beforeLoad: async () => {
		await requirePermission("hierarchy_management:read");
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <BranchPage />;
}
