import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/purchase-orders/view",
)({
	beforeLoad: async () => {
		await requirePermission("purchase_order_management:read");
	},
});
