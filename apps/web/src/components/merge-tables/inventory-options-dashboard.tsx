"use client";

import { BrandsTabPage } from "@/components/pages/inventory/brands-tab";
import { CategoriesTabPage } from "@/components/pages/inventory/categories-tab";
import { SuppliersTabPage } from "@/components/pages/inventory/suppliers-tab";
import { ConsolidatedTabs } from "@/components/ui/consolidated-tabs";

export function InventoryOptionsDashboard({
  tab,
  onTabChange,
}: {
  tab: string;
  onTabChange: (v: string) => void;
}) {
  return (
    <ConsolidatedTabs
      value={tab}
      onValueChange={onTabChange}
      tabs={[
        { id: "brands", label: "Brands", content: <BrandsTabPage /> },
        { id: "categories", label: "Categories", content: <CategoriesTabPage /> },
        { id: "suppliers", label: "Suppliers", content: <SuppliersTabPage /> },
      ]}
    />
  );
}
