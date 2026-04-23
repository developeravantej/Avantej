import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
// LEGACY — slated for rewrite; do not extend
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/service-category/view",
)({ beforeLoad: makeTabRedirect("/dashboard/service/view", "categories") });
