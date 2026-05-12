import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/categories/view",
)({ beforeLoad: makeTabRedirect("/dashboard/inventory-options", "categories") });
