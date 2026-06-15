import { createFileRoute } from "@tanstack/react-router";

import { requirePermission } from "@/lib/route-guards";
import { ReportsPage } from "@/components/pages/reports/ReportsPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/reports/view",
)({
	beforeLoad: async () => {
		await requirePermission("reports:read");
	},
	component: ReportsPage,
});
