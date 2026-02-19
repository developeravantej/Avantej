import type { Context as HonoContext } from "hono";
import { eq } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import { getDescendantNodeIds } from "@avantej-core/services";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  // Use request-scoped Better-Auth instance from context (set by dbMiddleware)
  // This ensures we use request-scoped database connections for Cloudflare Workers compatibility
  const getBetterAuthFn = context.get("getBetterAuth");
  const auth = getBetterAuthFn ? getBetterAuthFn() : null;
  
  if (!auth) {
    throw new Error("getBetterAuth not available in context. Ensure dbMiddleware is applied.");
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
  
  // For oRPC routes, if tenantDb is set but member is not, set it up now
  // This happens when orpcTenantMiddleware set up tenantDb but user wasn't available yet
  if (tenantDb && !member && session?.user && organizationId) {
    try {
      // Get member record
      member = await tenantDb.query.members.findFirst({
        where: eq(members.userId, session.user.id),
      });
      
      if (member) {
        console.log(`[createContext] Found member: ${member.id}, hierarchyScopeId: ${member.hierarchyScopeId}, role: ${member.role}`);
        
        // Calculate accessible node IDs
        try {
          accessibleNodeIds = await getDescendantNodeIds(tenantDb, member.hierarchyScopeId);
          console.log(`[createContext] Calculated ${accessibleNodeIds.length} accessible node IDs from hierarchyScopeId ${member.hierarchyScopeId}`);
        } catch (descError) {
          console.error(`[createContext] Failed to get descendant nodes for hierarchyScopeId ${member.hierarchyScopeId}:`, descError);
          // If getDescendantNodeIds fails, set to empty array (will be handled in listNodes)
          accessibleNodeIds = [];
        }
        
        // Store in context
        context.set('member', member);
        context.set('accessibleNodeIds', accessibleNodeIds);
      } else {
        console.error(`[createContext] Member not found for userId: ${session.user.id}, organizationId: ${organizationId}`);
      }
    } catch (error) {
      console.error("Failed to set up member in createContext for oRPC:", error);
    }
  }
  
  // Log final state
  if (tenantDb && member) {
    console.log(`[createContext] Final state - member: ${member.id}, accessibleNodeIds count: ${accessibleNodeIds?.length || 0}`);
  }

  return {
    session,
    organizationId,
    tenantDb,
    member,
    organization,
    accessibleNodeIds,
    honoContext: context,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
