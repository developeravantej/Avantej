import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";
import { StockRequestsTabPage } from "@/components/pages/stock/requests-tab";
import { TransferOrdersTabPage } from "@/components/pages/stock/transfers-tab";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/stock-requests/view",
)({
  beforeLoad: async () => {
    await requirePermission("stock_requests:read");
  },
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string | undefined) ?? "requests",
  }),
  component: StockMovementPage,
});

function StockMovementPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ConsolidatedTabs
      value={tab}
      onValueChange={(v) => navigate({ search: { tab: v } })}
      tabs={[
        { id: "requests", label: "Requests", content: <StockRequestsTabPage /> },
        { id: "transfers", label: "Transfers", content: <TransferOrdersTabPage /> },
      ]}
    />
  );
}
