import { redirect } from "@tanstack/react-router";

import { client } from "@/utils/orpc";

/**
 * Shared `beforeLoad` guard for tenant dashboard routes.
 *
 * Pure SaaS owners (platform admins with no org membership) are sent to the
 * platform-admin Mission Control instead of a tenant route, which would
 * otherwise fire org-scoped queries and 403 ("not a member"). Any other error
 * (non-admin / transient) falls through to the tenant route.
 *
 * Used by both `/dashboard/` (launchpad) and `/dashboard/overview` (analytics)
 * so the redirect logic lives in one place.
 */
export async function redirectPureSaasOwnerToMissionControl(): Promise<void> {
	try {
		const me = await client.admin.me({});
		if (me.isPlatformAdmin) {
			const ctx = await client.auth.userContext({});
			if (!ctx?.organizations || ctx.organizations.length === 0) {
				throw redirect({ to: "/dashboard/platform-admin" });
			}
		}
	} catch (err: unknown) {
		if (
			err !== null &&
			typeof err === "object" &&
			"TANSTACK_ROUTER_REDIRECT" in err
		) {
			throw err;
		}
		// Non-admin or transient error: fall through to the tenant route.
	}
}
