import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { client } from "@/utils/orpc";
import { DashboardPage } from "@/components/pages/dashboard/DashboardPage";
import type { Period } from "@/components/pages/dashboard/types";

const overviewSearchSchema = z.object({
	period: z
		.enum(["today", "this_week", "this_month", "this_year"])
		.default("this_month"),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/overview",
)({
	// Pure SaaS owners (platform admin with no org membership) get the
	// platform-admin Mission Control instead of the tenant analytics dashboard,
	// which would otherwise fire org-scoped queries and 403 ("not a member").
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
			// Non-admin or transient error: fall through to the analytics dashboard.
		}
	},
	component: OverviewPage,
	validateSearch: overviewSearchSchema,
});

const routeApi = getRouteApi("/_authenticated/dashboard/_layout/overview");

function OverviewPage() {
	const { period } = routeApi.useSearch();
	const navigate = routeApi.useNavigate();
	return (
		<DashboardPage
			period={period}
			onSelectPeriod={(p: Period) => navigate({ search: { period: p } })}
		/>
	);
}
