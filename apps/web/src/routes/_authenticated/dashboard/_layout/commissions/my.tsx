import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/commissions/my",
)({ beforeLoad: makeTabRedirect("/dashboard/commissions/view", "mine") });
