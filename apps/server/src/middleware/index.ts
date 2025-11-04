/**
 * Middleware Index
 *
 * Central export point for all authentication and authorization middleware.
 *
 * Usage:
 * ```typescript
 * import { authMiddleware, tenantMiddleware, hierarchyMiddleware, adminMiddleware } from "@/middleware";
 *
 * app.use("/api/protected/*", authMiddleware);
 * app.use("/api/orgs/:organizationId/*", authMiddleware, tenantMiddleware, hierarchyMiddleware);
 * app.use("/api/admin/*", authMiddleware, adminMiddleware);
 * ```
 */

export { authMiddleware } from "./auth.middleware";
export { tenantMiddleware } from "./tenant.middleware";
export { hierarchyMiddleware } from "./hierarchy.middleware";
export { adminMiddleware, superAdminMiddleware } from "./admin.middleware";

