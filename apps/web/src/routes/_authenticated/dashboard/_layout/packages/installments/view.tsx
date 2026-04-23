import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
// LEGACY — slated for rewrite; do not extend
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/packages/installments/view",
)({ beforeLoad: makeTabRedirect("/dashboard/packages/view", "installments") });
