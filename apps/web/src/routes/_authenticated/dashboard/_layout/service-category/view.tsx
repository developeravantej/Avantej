import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/service-category/view",
)({ beforeLoad: makeTabRedirect("/dashboard/service/view", "categories") });
