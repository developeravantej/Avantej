import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { CustomersListPage } from "@/components/pages/customers/CustomersListPage";

export const Route = createFileRoute("/_authenticated/customers")({
	beforeLoad: async () => {
		await requirePermission("user_management:read");
	},
	component: CustomersListPage,
});
