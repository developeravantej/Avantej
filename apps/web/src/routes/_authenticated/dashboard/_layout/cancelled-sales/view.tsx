import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/cancelled-sales/view",
)({
	beforeLoad: () => {
		throw redirect({
			to: "/dashboard/sales/view",
			search: { tab: "cancelled" },
		});
	},
	component: () => null,
});
