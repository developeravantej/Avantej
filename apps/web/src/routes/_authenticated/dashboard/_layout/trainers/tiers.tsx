import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/trainers/tiers",
)({
	beforeLoad: () => {
		throw redirect({
			to: "/dashboard/trainers/view",
			search: { tab: "tiers" },
		});
	},
	component: () => null,
});
