import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";

import { DashboardPage } from "@/components/pages/dashboard/DashboardPage";
import type { Period } from "@/components/pages/dashboard/types";
import { redirectPureSaasOwnerToMissionControl } from "@/lib/redirect-pure-saas-owner";

const overviewSearchSchema = z.object({
	period: z
		.enum(["today", "this_week", "this_month", "this_year"])
		.default("this_month"),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/overview",
)({
	beforeLoad: redirectPureSaasOwnerToMissionControl,
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
