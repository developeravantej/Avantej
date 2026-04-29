/**
 * Authentication Middleware
 *
 * Validates JWT session via Better-Auth and injects user into request context.
 * This middleware must be applied before any protected routes.
 *
 * Usage:
 * ```typescript
 * import { authMiddleware } from "@/middleware/auth.middleware";
 *
 * app.use("/api/protected/*", authMiddleware);
 * ```
 */

import { createMiddleware } from "hono/factory";
import { getBetterAuth } from "@/lib/better-auth";

/**
 * Authentication middleware
 *
 * Validates the user's session using Better-Auth and injects user data into context.
 * Uses request-scoped Better-Auth instance for Cloudflare Workers compatibility.
 * Returns 401 Unauthorized if no valid session is found.
 *
 * Injects into context:
 * - `user`: User object from Better-Auth session
 * - `session`: Session object from Better-Auth
 */
export const authMiddleware = createMiddleware(async (c, next) => {
	try {
		// Use request-scoped Better-Auth instance
		const auth = getBetterAuth(c);
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (!session || !session.user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Set user and session in Hono context
		c.set("user" as any, session.user);
		c.set("session" as any, session.session);

		await next();
	} catch (error) {
		console.error("Auth middleware error:", error);
		return c.json({ error: "Unauthorized" }, 401);
	}
});

