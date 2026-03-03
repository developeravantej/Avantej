import { createFileRoute } from "@tanstack/react-router";
import { InventoryOptionsDashboard } from "@/components/merge-tables/inventory-options-dashboard";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/inventory-options"
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <InventoryOptionsDashboard />;
}
