import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/walk-in/view",
)({
	beforeLoad: makeTabRedirect("/dashboard/customers/view", "registered"),
});
