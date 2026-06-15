import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { UserViewPage } from "@/components/pages/user/UserViewPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/user/view",
)({
	beforeLoad: async () => {
		await requirePermission("user_management:read");
	},
	component: UserViewPage,
});
