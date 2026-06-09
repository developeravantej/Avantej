import { createFileRoute } from "@tanstack/react-router";
import { requireSystemAdmin } from "@/lib/route-guards";
import { PlatformAdminTenantsPage } from "@/components/pages/platform-admin-tenants-list/PlatformAdminTenantsPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/tenants/",
)({
	beforeLoad: async () => {
		await requireSystemAdmin();
	},
	component: PlatformAdminTenantsPage,
});
