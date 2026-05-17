/**
 * Platform Admin — Tenants layout route.
 *
 * Thin layout that gates auth and renders `<Outlet />` so that
 * `tenants.index.tsx` (list) and `tenants.$id.tsx` (drill-in) each
 * render in their own right rather than the parent stealing the slot.
 *
 * History: before this split, `tenants.tsx` shipped the list UI
 * directly with no `<Outlet />`. TanStack file routing treated it as
 * the parent of `tenants.$id.tsx`, so visiting the drill-in URL
 * matched both routes but only the parent rendered → the list page
 * appeared at `/tenants/<id>` with no drill-in content. Splitting
 * the list into `tenants.index.tsx` restores the canonical
 * layout-parent-plus-leaves pattern.
 */

import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/tenants",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin) {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			throw redirect({ to: "/dashboard" });
		}
	},
	component: TenantsLayout,
});

function TenantsLayout() {
	return <Outlet />;
}
