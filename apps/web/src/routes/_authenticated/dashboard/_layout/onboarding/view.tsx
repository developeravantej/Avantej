import { createFileRoute } from "@tanstack/react-router";
import { OnboardingIndexPage } from "@/components/pages/onboarding/OnboardingIndexPage";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/onboarding/view",
)({
	beforeLoad: async () => {
		await requirePermission("hierarchy_management:read");
	},
	component: OnboardingIndexPage,
});
