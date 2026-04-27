import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/promotions/view",
)({
	beforeLoad: () => {
		throw redirect({
			to: "/dashboard/service/view",
			search: { tab: "promotions" },
		});
	},
	component: () => null,
});
