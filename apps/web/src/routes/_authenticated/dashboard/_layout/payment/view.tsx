import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payment/view",
)({
	beforeLoad: () => {
		throw redirect({ to: "/dashboard/sales/view" });
	},
	component: () => null,
});
