import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/brands/view",
)({ beforeLoad: makeTabRedirect("/dashboard/inventory-options", "brands") });
