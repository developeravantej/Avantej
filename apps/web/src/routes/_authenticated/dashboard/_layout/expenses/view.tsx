import { createFileRoute } from "@tanstack/react-router";
import { ExpensesViewPage } from "@/components/pages/expenses/ExpensesViewPage";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/expenses/view",
)({
	beforeLoad: async () => {
		await requirePermission("expense_management:read");
	},
	component: ExpensesViewPage,
});
