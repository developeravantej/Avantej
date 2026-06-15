import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { authClient } from "@/lib/auth-client";
import { ErrorBoundary } from "@/components/ui/error-boundary";

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
		try {
			const session = await authClient.getSession();
			if (!session.data) {
				throw redirect({ to: "/login", search: {} });
			}
		} catch (err) {
			// If it's a redirect, re-throw it
			if (err && typeof err === "object" && "to" in err) throw err;
			// Network / server error — redirect to login
			throw redirect({ to: "/login", search: {} });
		}
		return {};
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const title = "Dashboard"; // Default title, can be overridden by child routes

	return (
		<ErrorBoundary>
			<AppLayout title={title}>
				<Outlet />
			</AppLayout>
		</ErrorBoundary>
	);
}
