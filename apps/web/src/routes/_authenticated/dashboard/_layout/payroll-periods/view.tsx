import { createFileRoute } from "@tanstack/react-router";

import { requirePermission } from "@/lib/route-guards";
import { PayrollPeriodsPage } from "@/components/pages/payroll-periods/PayrollPeriodsPage";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payroll-periods/view",
)({
	beforeLoad: async () => {
		await requirePermission("commission_payout:read");
	},
	component: PayrollPeriodsPage,
});
