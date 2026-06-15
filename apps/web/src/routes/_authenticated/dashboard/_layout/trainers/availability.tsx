import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/trainers/availability",
)({
	beforeLoad: async () => {
		throw redirect({
			to: "/dashboard/trainers/view",
			search: { tab: "availability" },
		});
	},
	component: () => null,
});
