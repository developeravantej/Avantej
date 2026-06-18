import type { Context as HonoContext } from "hono";
import { resolveMemberContext } from "@avantej-core/services";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
	// Use request-scoped Better-Auth instance from context (set by dbMiddleware)
	// This ensures we use request-scoped database connections for Cloudflare Workers compatibility
	const getBetterAuthFn = context.get("getBetterAuth");
	const auth = getBetterAuthFn ? getBetterAuthFn() : null;

	if (!auth) {
		throw new Error(
			"getBetterAuth not available in context. Ensure dbMiddleware is applied.",
		);
	}

	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});

	// Get organization context from Hono context (set by middleware)
	// tenantMiddleware sets these for regular routes
	// orpcTenantMiddleware sets these for oRPC routes
	let organizationId = context.get("organizationId");
	let tenantDb = context.get("tenantDb");
	let member = context.get("member");
	const organization = context.get("organization");
	let accessibleNodeIds = context.get("accessibleNodeIds");

	// For oRPC routes, if tenantDb is set but member is not, set it up now.
	// This happens when orpcTenantMiddleware set up tenantDb but couldn't resolve
	// the member yet (e.g. session was not available at middleware time).
	if (tenantDb && !member && session?.user && organizationId) {
		try {
			const resolved = await resolveMemberContext(tenantDb, session.user.id);
			if (resolved) {
				member = resolved.member;
				accessibleNodeIds = resolved.accessibleNodeIds;
				context.set("member", member);
				context.set("accessibleNodeIds", accessibleNodeIds);
			} else {
				console.error(
					`[createContext] Member not found for userId: ${session.user.id}, organizationId: ${organizationId}`,
				);
			}
		} catch (error) {
			console.error(
				"Failed to set up member in createContext for oRPC:",
				error,
			);
		}
	}

	const installmentLockOnOpen = context.get("installmentLockOnOpen") as
		| boolean
		| undefined;

	return {
		session,
		organizationId,
		tenantDb,
		member,
		organization,
		accessibleNodeIds,
		installmentLockOnOpen: installmentLockOnOpen !== false,
		honoContext: context,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
