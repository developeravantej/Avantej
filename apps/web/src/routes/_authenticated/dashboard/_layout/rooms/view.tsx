import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/rooms/view",
)({
	beforeLoad: () => {
		throw redirect({ to: "/dashboard/service/view", search: { tab: "rooms" } });
	},
	component: () => null,
});
