import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";
// LEGACY — consolidated into the Services page Categories tab; do not extend
export const Route = createFileRoute("/_authenticated/service-category/view")({
	beforeLoad: makeTabRedirect("/dashboard/service/view", "categories"),
});
