import { os, ORPCError } from "@orpc/server";
import type { Context } from "@avantej-core/api/context";

// Helper function to get environment variable (Cloudflare Workers or Node.js)
export function getEnvVar(key: string): string | undefined {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const cloudflare = require("cloudflare:workers");
		return cloudflare.env?.[key];
	} catch {
		return process.env[key];
	}
}

// Create procedure base with Context type
export const o = os.$context<Context>();

// Protected procedure middleware that checks for authentication
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
