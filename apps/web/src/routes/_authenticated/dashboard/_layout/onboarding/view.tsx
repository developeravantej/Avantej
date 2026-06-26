import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OnboardingIndexPage } from "@/components/pages/onboarding/OnboardingIndexPage";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/onboarding/view",
)({
	// Optional ?branch=<hierarchyNodeId> preselects that branch (e.g. when
	// jumping here from a self-signup invitation row).
	validateSearch: z.object({ branch: z.string().optional() }),
	beforeLoad: async () => {
		await requirePermission("hierarchy_management:read");
	},
	component: OnboardingIndexPage,
});
