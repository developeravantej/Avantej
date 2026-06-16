import { createFileRoute } from "@tanstack/react-router";

import { DashboardLaunchpad } from "@/components/pages/launchpad/DashboardLaunchpad";
import { redirectPureSaasOwnerToMissionControl } from "@/lib/redirect-pure-saas-owner";

export const Route = createFileRoute("/_authenticated/dashboard/_layout/")({
	beforeLoad: redirectPureSaasOwnerToMissionControl,
	component: DashboardLaunchpad,
});
