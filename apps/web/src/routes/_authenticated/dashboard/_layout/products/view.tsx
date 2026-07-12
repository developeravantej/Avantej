import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requirePermission } from "@/lib/route-guards";
import { ProductsViewPage } from "@/components/pages/products/products-view-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/products/view",
)({
	beforeLoad: async () => {
		await requirePermission("inventory:read");
	},
	validateSearch: z.object({
		tab: z.enum(["catalog", "pricing"]).catch("catalog"),
	}),
	component: ProductsViewPage_,
});

function ProductsViewPage_() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<ProductsViewPage
			tab={tab}
			onTabChange={(t) => navigate({ search: { tab: t } })}
		/>
	);
}
