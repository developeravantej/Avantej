import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/uom-conversions/view",
)({ beforeLoad: makeTabRedirect("/dashboard/uom/view", "conversions") });
