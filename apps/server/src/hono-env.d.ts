/**
 * Hono Context Variables Type Declaration
 *
 * Extends Hono's ContextVariableMap interface to include custom context variables
 * injected by middleware. This provides type safety for c.get() and c.set() calls.
 *
 * Variables are injected by:
 * - authMiddleware: user, session
 * - tenantMiddleware: organization, organizationId, tenantDb
 * - hierarchyMiddleware: member, hierarchyScopeId, accessibleNodeIds, role
 * - adminMiddleware: adminRecord, adminRole
 */

import type {
  BetterAuthUser,
  BetterAuthSession,
} from "@avantej-core/types/better-auth";
import type { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import type { members } from "@avantej-core/db/schema/tenant/members";
import type { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { Pool } from "@neondatabase/serverless";

declare module "hono" {
  interface ContextVariableMap {
    // Database middleware variables (request-scoped pools)
    controlPanelPool: Pool;
    controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
    tenantPools: Map<string, Pool>;

    // Auth middleware variables
    user: BetterAuthUser;
    session: BetterAuthSession;

    // Tenant middleware variables
    organization: typeof organizations.$inferSelect;
    organizationId: string;
    tenantDb: NeonDatabase<typeof tenantSchema>;

    // Hierarchy middleware variables
    member: typeof members.$inferSelect;
    hierarchyScopeId: string;
    accessibleNodeIds: string[];
    role: string;

    // Admin middleware variables
    adminRecord: typeof platformAdmins.$inferSelect;
    adminRole: string;
  }
}
