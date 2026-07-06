import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/import",
)({
	beforeLoad: async () => {
		await requirePermission("data_import:import");
	},
});
