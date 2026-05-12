import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
// LEGACY — slated for rewrite; do not extend
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/invitations",
)({ beforeLoad: makeTabRedirect("/dashboard/access-control/user-assignment", "invitations") });
