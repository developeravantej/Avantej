import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { AllCommissionsPage } from "@/components/pages/commissions/all-tab";
import { LiabilityTab } from "@/components/pages/commissions/liability-tab";
import { MyCommissionsPage } from "@/components/pages/commissions/mine-tab";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";
import { PageHeader } from "@/components/ui/page-header";
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
		<div className="space-y-6 p-6">
			<PageHeader
				icon={TrendingUp}
				title="Commissions"
				description="Track and manage staff commission splits across all sales and appointments."
			/>
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
		</div>
	);
}
