import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/permissions",
)({ beforeLoad: makeTabRedirect("/dashboard/access-control/roles", "permissions") });
