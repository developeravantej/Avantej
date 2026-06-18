import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/refunds/view",
)({
	beforeLoad: () => {
		throw redirect({ to: "/dashboard/sales/view", search: { tab: "refunds" } });
	},
	component: () => null,
});
