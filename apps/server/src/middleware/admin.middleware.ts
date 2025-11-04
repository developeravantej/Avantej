/**
 * Admin Middleware
 *
 * Checks if user has platform_admins record and validates admin role.
 * This middleware must be applied after authMiddleware.
 *
 * Usage:
 * ```typescript
 * import { adminMiddleware } from "@/middleware/admin.middleware";
 *
 * app.use("/api/admin/*", authMiddleware, adminMiddleware);
 * ```
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { controlPanelDb } from "@/lib/db";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";

/**
 * Admin middleware
 *
 * Validates that the authenticated user has platform administrator privileges.
 * Returns 403 Forbidden if user is not a platform admin.
 *
 * Role validation:
 * - super_admin: Full platform access
 * - support: Customer support access
 * - billing: Billing and subscription management access
 *
 * Injects into context:
 * - `adminRecord`: Platform admin record from control panel DB
 * - `adminRole`: Admin role (super_admin, support, billing)
 */
export const adminMiddleware = createMiddleware(async (c, next) => {
	try {
		const user = c.get("user");
		if (!user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Check if user has platform admin record
		const adminRecord = await controlPanelDb.query.platformAdmins.findFirst({
			where: eq(platformAdmins.userId, user.id),
		});

		if (!adminRecord) {
			return c.json({ error: "Forbidden: Admin access required" }, 403);
		}

		// Set admin record and role in context
		c.set("adminRecord", adminRecord);
		c.set("adminRole", adminRecord.role);

		await next();
	} catch (error) {
		console.error("Admin middleware error:", error);
		return c.json({ error: "Failed to validate admin access" }, 500);
	}
});

/**
 * Super Admin Middleware
 *
 * Validates that the authenticated user has super_admin role.
 * Returns 403 Forbidden if user is not a super admin.
 *
 * Usage:
 * ```typescript
 * import { superAdminMiddleware } from "@/middleware/admin.middleware";
 *
 * app.use("/api/admin/dangerous/*", authMiddleware, superAdminMiddleware);
 * ```
 */
export const superAdminMiddleware = createMiddleware(async (c, next) => {
	try {
		const user = c.get("user");
		if (!user) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		// Check if user has super_admin role
		const adminRecord = await controlPanelDb.query.platformAdmins.findFirst({
			where: eq(platformAdmins.userId, user.id),
		});

		if (!adminRecord || adminRecord.role !== "super_admin") {
			return c.json(
				{ error: "Forbidden: Super admin access required" },
				403
			);
		}

		// Set admin record and role in context
		c.set("adminRecord", adminRecord);
		c.set("adminRole", adminRecord.role);

		await next();
	} catch (error) {
		console.error("Super admin middleware error:", error);
		return c.json({ error: "Failed to validate super admin access" }, 500);
	}
});

