import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { CommandPalette } from "@/components/platform-admin/command-palette";

export const Route = createFileRoute("/_authenticated/dashboard/_layout")({
	component: DashboardLayout,
});

function DashboardLayout() {
	const location = useLocation();
	const isPlatformAdmin = location.pathname.startsWith(
		"/dashboard/platform-admin",
	);
	return (
		<>
			<ImpersonationBanner />
			<Outlet />
			{isPlatformAdmin && <CommandPalette />}
		</>
	);
}
