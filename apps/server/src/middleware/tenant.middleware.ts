/**
 * Tenant Middleware
 *
 * Looks up organization in control panel DB and injects tenantDb connection.
 * This middleware must be applied after authMiddleware.
 *
 * Organization ID can come from:
 * - Session (Better-Auth organization plugin: session.user.organizationId)
 * - Request parameter (e.g., /api/orgs/:organizationId/...)
 * - Request header (X-Organization-Id)
 *
 * Usage:
 * ```typescript
 * import { tenantMiddleware } from "@/middleware/tenant.middleware";
 *
 * app.use("/api/orgs/:organizationId/*", authMiddleware, tenantMiddleware);
 * ```
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";

/**
 * Tenant middleware
 *
 * Resolves organization from session or request, then injects tenant database connection.
 * Returns 404 if organization not found or 400 if no organization ID provided.
 *
 * Organization ID resolution priority:
 * 1. URL parameter (e.g., /orgs/:organizationId)
 * 2. Request header (X-Organization-Id)
 * 3. Session (session.user.organizationId from Better-Auth organization plugin)
 *
 * Injects into context:
 * - `organization`: Organization record from control panel DB
 * - `organizationId`: Organization UUID
 * - `tenantDb`: Drizzle client for tenant database
 */
export const tenantMiddleware = createMiddleware(async (c, next) => {
	try {
		const user = c.get("user");
		if (!user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Resolve organization ID from multiple sources (priority order)
		let organizationId: string | undefined;

		// 1. Check URL parameter (e.g., /orgs/:id or /orgs/:organizationId)
		const paramOrgId = c.req.param("organizationId") || c.req.param("id");
		if (paramOrgId) {
			organizationId = paramOrgId;
		}

		// 2. Check request header
		if (!organizationId) {
			organizationId = c.req.header("X-Organization-Id");
		}

		// 3. Check session (Better-Auth organization plugin)
		if (!organizationId && (user as any).organizationId) {
			organizationId = (user as any).organizationId;
		}

		if (!organizationId) {
			return c.json({ error: "No active organization" }, 400);
		}

		// Get organization details from control panel database (use request-scoped DB)
		const controlPanelDb = getControlPanelDb(c);
		const organization = await controlPanelDb.query.organizations.findFirst({
			where: eq(organizations.id, organizationId),
		});

		if (!organization) {
			return c.json({ error: "Organization not found" }, 404);
		}

		// Plan E E.3 / ADR-0024 — suspended tenants are read-only at the app
		// boundary. Platform-admin paths bypass this so ops can resume/cancel.
		const isPlatformAdminPath = c.req.path.includes("/platformAdmin") || c.req.path.includes("/admin");
		if (organization.paymentStatus === "suspended" && !isPlatformAdminPath) {
			return c.json(
				{ error: "Tenant is suspended", paymentStatus: "suspended" },
				403,
			);
		}

		// Get tenant database connection (use request-scoped pool with caching)
		const tenantDb = await getTenantDb(organizationId, c);

		// Set organization and tenant database in context
		c.set("organization", organization);
		c.set("organizationId", organizationId);
		c.set("tenantDb", tenantDb);

		await next();
	} catch (error) {
		console.error("Tenant middleware error:", error);
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to initialize tenant context",
			},
			500
		);
	}
});

