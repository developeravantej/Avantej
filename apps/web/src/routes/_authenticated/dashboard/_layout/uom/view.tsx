import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";
import { UnitsTabPage } from "@/components/pages/uom/units-tab";
import { UomConversionsTabPage } from "@/components/pages/uom/conversions-tab";

import { z } from "zod";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/uom/view",
)({
	beforeLoad: async () => {
		await requirePermission("inventory:read");
	},
	validateSearch: z.object({ tab: z.string().catch("units") }),
	component: UomPage,
});

function UomPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ConsolidatedTabs
			value={tab}
			onValueChange={(v) => navigate({ search: { tab: v } })}
			tabs={[
				{ id: "units", label: "Units", content: <UnitsTabPage /> },
				{
					id: "conversions",
					label: "Conversions",
					content: <UomConversionsTabPage />,
				},
			]}
		/>
	);
}
