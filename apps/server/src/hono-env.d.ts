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
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

declare module "hono" {
  interface ContextVariableMap {
    // Auth middleware variables
    user: BetterAuthUser;
    session: BetterAuthSession;

    // Tenant middleware variables
    organization: typeof organizations.$inferSelect;
    organizationId: string;
    tenantDb: NeonHttpDatabase<typeof tenantSchema>;

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
