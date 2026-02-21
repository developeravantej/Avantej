import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { authClient } from "@/lib/auth-client";

/**
 * Authenticated Layout Route
 * 
 * This route wraps all authenticated pages and provides:
 * - Authentication check (redirects to /login if not authenticated)
 * - AppLayout with sidebar and topbar
 * - User context from Better-Auth session
 */
export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
				search: {},
				throw: true,
			});
		}
		// Return session in context for child routes if needed
		return {};
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const title = "Dashboard"; // Default title, can be overridden by child routes

	return (
		<AppLayout title={title}>
			<Outlet />
		</AppLayout>
	);
}
