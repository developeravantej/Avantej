import { auth } from "@avantej-core/auth";
import type { Context as HonoContext } from "hono";
// Dynamic imports to avoid TypeScript path resolution issues
// These will be resolved at runtime when called from apps/server

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });

  // Get organization context from Hono context (set by middleware)
  // These values are set by tenantMiddleware and hierarchyMiddleware
  // If not set, they will be undefined and oRPC procedures will handle errors appropriately
  const organizationId = context.get("organizationId");
  const tenantDb = context.get("tenantDb");
  const member = context.get("member");
  const organization = context.get("organization");
  const accessibleNodeIds = context.get("accessibleNodeIds");

  return {
    session,
    organizationId,
    tenantDb,
    member,
    organization,
    accessibleNodeIds,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
