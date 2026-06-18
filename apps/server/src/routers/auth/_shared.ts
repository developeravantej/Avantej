import type { Context } from "@avantej-core/api/context";
import { ORPCError, os } from "@orpc/server";

// Create procedure base with Context type
export const o = os.$context<Context>();

// Middleware for protected routes
export const authMiddleware = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});
