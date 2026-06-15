import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
// LEGACY — slated for rewrite; do not extend
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/walk-in/view",
)({
	beforeLoad: makeTabRedirect("/dashboard/customers/v2/view", "customers"),
});
