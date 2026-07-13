import { createFileRoute } from "@tanstack/react-router";
import { makeTabRedirect } from "@/lib/tab-redirect";

// Legacy customers list retired — permanent redirect to the v2 directory.
// Route file kept so external links/bookmarks to /customers keep working.
export const Route = createFileRoute("/_authenticated/customers")({
	beforeLoad: makeTabRedirect("/dashboard/customers/v2/view", "customers"),
});
