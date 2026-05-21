import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { InventoryOptionsDashboard } from "@/components/merge-tables/inventory-options-dashboard";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/inventory-options",
)({
  beforeLoad: async () => {
    await requirePermission("inventory:read");
  },
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string | undefined) ?? "brands",
  }),
  component: InventoryOptionsPage,
});

function InventoryOptionsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <InventoryOptionsDashboard
      tab={tab}
      onTabChange={(v) => navigate({ search: { tab: v } })}
    />
  );
}
