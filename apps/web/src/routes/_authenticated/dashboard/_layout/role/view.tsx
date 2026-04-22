import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/role/view",
)({ beforeLoad: makeTabRedirect("/dashboard/access-control/roles", "roles") });
