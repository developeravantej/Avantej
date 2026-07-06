import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/export",
)({
	beforeLoad: async () => {
		await requirePermission("reports:export");
	},
});
