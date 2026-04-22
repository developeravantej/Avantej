import { createFileRoute } from "@tanstack/react-router";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";
import { UnitsTabPage } from "@/components/pages/uom/units-tab";
import { UomConversionsTabPage } from "@/components/pages/uom/conversions-tab";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/uom/view",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string | undefined) ?? "units",
  }),
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
        { id: "conversions", label: "Conversions", content: <UomConversionsTabPage /> },
      ]}
    />
  );
}
