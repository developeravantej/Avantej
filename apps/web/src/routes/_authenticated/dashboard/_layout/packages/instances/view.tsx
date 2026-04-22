import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/packages/instances/view",
)({ beforeLoad: makeTabRedirect("/dashboard/packages/view", "session-packs") });
