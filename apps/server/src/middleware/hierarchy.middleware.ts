/**
 * Hierarchy Middleware
 *
 * Fetches user's member record from tenant DB and calculates accessible node IDs.
 * This middleware must be applied after tenantMiddleware.
 *
 * Usage:
 * ```typescript
 * import { hierarchyMiddleware } from "@/middleware/hierarchy.middleware";
 *
 * app.use("/api/orgs/:organizationId/*", authMiddleware, tenantMiddleware, hierarchyMiddleware);
 * ```
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import { getDescendantNodeIds } from "@avantej-core/services";

/**
 * Hierarchy middleware
 *
 * Fetches the user's member record from tenant database and calculates all accessible
 * hierarchy node IDs (current node + all descendants) for authorization purposes.
 *
 * Returns 403 if user is not a member of the organization.
 *
 * Injects into context:
 * - `member`: Member record from tenant database
 * - `hierarchyScopeId`: UUID of the hierarchy node the user is assigned to
 * - `accessibleNodeIds`: Array of UUIDs representing all nodes the user can access
 * - `role`: User's role in the organization (admin, trainer, staff, client)
 */
export const hierarchyMiddleware = createMiddleware(async (c, next) => {
	try {
		const user = c.get("user");
		const tenantDb = c.get("tenantDb");
		const organizationId = c.get("organizationId");

		if (!user || !tenantDb || !organizationId) {
			return c.json({ error: "Missing required context" }, 500);
		}

		// Get user's member record from tenant database
		const member = await tenantDb.query.members.findFirst({
			where: eq(members.userId, user.id),
		});

		if (!member) {
			return c.json(
				{ error: "User is not a member of this organization" },
				403,
			);
		}

		// Calculate accessible hierarchy node IDs (current node + all descendants)
		const accessibleNodeIds = await getDescendantNodeIds(
			tenantDb,
			member.hierarchyScopeId,
		);

		// Set member and hierarchy context in Hono context
		c.set("member", member);
		c.set("hierarchyScopeId", member.hierarchyScopeId);
		c.set("accessibleNodeIds", accessibleNodeIds);
		c.set("role", member.role);

		await next();
	} catch (error) {
		console.error("Hierarchy middleware error:", error);
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to initialize hierarchy context",
			},
			500,
		);
	}
});
