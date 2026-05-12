import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ImpersonationBanner } from "@/components/impersonation-banner";

export const Route = createFileRoute("/_authenticated/dashboard/_layout")({
	component: DashboardLayout,
});

function DashboardLayout() {
	return (
		<>
			<ImpersonationBanner />
			<Outlet />
		</>
	);
}

