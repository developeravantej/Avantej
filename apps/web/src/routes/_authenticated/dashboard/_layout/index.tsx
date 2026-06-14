import { createFileRoute, redirect } from "@tanstack/react-router";

import { client } from "@/utils/orpc";
import { DashboardLaunchpad } from "@/components/pages/launchpad/DashboardLaunchpad";

export const Route = createFileRoute("/_authenticated/dashboard/_layout/")({
	// Pure SaaS owners (platform admin with no org membership) get the
	// platform-admin Mission Control instead of the tenant dashboard, which
	// would otherwise fire org-scoped queries and 403 ("not a member").
	beforeLoad: async () => {
		try {
			const me = await client.admin.me({});
			if (me.isPlatformAdmin) {
				const ctx = await client.auth.userContext({});
				if (!ctx?.organizations || ctx.organizations.length === 0) {
					throw redirect({ to: "/dashboard/platform-admin" });
				}
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			// Non-admin or transient error: fall through to the tenant dashboard.
		}
	},
	component: DashboardLaunchpad,
});
