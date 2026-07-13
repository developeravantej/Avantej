import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { authClient } from "@/lib/auth-client";

/**
 * Bare authenticated layout for printable documents (invoice/receipt).
 *
 * Same session gate as `_authenticated`, but NO AppLayout — the sidebar and
 * topbar must not exist on these pages or they leak into the browser's print
 * output. Print routes live under this layout, never under `_authenticated`.
 */
export const Route = createFileRoute("/_print")({
	beforeLoad: async () => {
		try {
			const session = await authClient.getSession();
			if (!session.data) {
				throw redirect({ to: "/login", search: {} });
			}
		} catch (err) {
			if (err && typeof err === "object" && "to" in err) throw err;
			throw redirect({ to: "/login", search: {} });
		}
		return {};
	},
	component: () => (
		<ErrorBoundary>
			<Outlet />
		</ErrorBoundary>
	),
});
