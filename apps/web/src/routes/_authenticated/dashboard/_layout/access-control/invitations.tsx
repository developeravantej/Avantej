import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/invitations",
)({ beforeLoad: makeTabRedirect("/dashboard/access-control/user-assignment", "invitations") });
