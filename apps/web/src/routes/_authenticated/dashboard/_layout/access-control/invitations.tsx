import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { InvitationsPage } from "@/components/invitations/invitations-page";

/**
 * Invitations Route
 * 
 * Manages organization invitations - create, list, revoke, and resend invitations.
 * Requires: user_management:read and user_management:create permissions
 */
export const Route = createFileRoute("/_authenticated/dashboard/_layout/access-control/invitations")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "user_management", action: "read" },
			"/dashboard"
		);
	},
	component: InvitationsPage,
});

