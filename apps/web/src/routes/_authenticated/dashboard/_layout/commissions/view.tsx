import { createFileRoute } from "@tanstack/react-router";
import { AllCommissionsPage } from "@/components/pages/commissions/all-tab";
import { LiabilityTab } from "@/components/pages/commissions/liability-tab";
import { MyCommissionsPage } from "@/components/pages/commissions/mine-tab";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";
import { useUserContext } from "@/hooks/useUserContext";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/commissions/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "mine",
	}),
	component: CommissionsPage,
});

function CommissionsPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { hasPermission } = useUserContext();

	return (
		<ConsolidatedTabs
			value={tab}
			onValueChange={(v) => navigate({ search: { tab: v } })}
			tabs={[
				{ id: "mine", label: "My Commissions", content: <MyCommissionsPage /> },
				{
					id: "all",
					label: "All Commissions",
					content: <AllCommissionsPage />,
					hidden: !hasPermission("commission_management:read"),
				},
				{
					id: "liability",
					label: "Liability",
					content: <LiabilityTab />,
					hidden: !hasPermission("commission_payout:read"),
				},
			]}
		/>
	);
}
