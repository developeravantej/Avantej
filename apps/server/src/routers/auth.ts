/**
 * Auth Router (oRPC)
 *
 * Provides type-safe authentication procedures via oRPC.
 * Replaces REST endpoints for internal frontend usage.
 *
 * Procedures:
 * - login: Sign in with email/password, returns user context
 * - userContext: Get current user's organizations and hierarchy data
 * - verifyEmail: Verify email address via token
 */

import { verifyEmailToken } from "@/services/auth.service";
import type { Context } from "@avantej-core/api/context";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { getDescendantNodeIds } from "@avantej-core/services";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { z } from "zod";

// Configure Neon for WebSocket support
neonConfig.webSocketConstructor = ws;

// Create procedure base with Context type
const o = os.$context<Context>();

// Middleware for protected routes
const authMiddleware = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

// Type for Better-Auth sign-in response
interface BetterAuthSignInResponse {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    createdAt: Date;
  };
  session: {
    token: string;
  };
}

// Type guard for Better-Auth response
function isBetterAuthSignInResponse(
  data: unknown
): data is BetterAuthSignInResponse {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.user === "object" &&
    obj.user !== null &&
    typeof (obj.user as Record<string, unknown>).id === "string" &&
    typeof (obj.user as Record<string, unknown>).email === "string"
  );
}

/**
 * Login procedure - Sign in with email and password
 * Returns user info and organizations list
 */
const login = o
  .input(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
    })
  )
  .handler(async ({ input, context }) => {
    const { email, password } = input;
    const c = context.honoContext;

    if (!c) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Missing Hono context",
      });
    }

    // Get Better-Auth instance
    const getBetterAuthFn = c.get("getBetterAuth");
    const auth = getBetterAuthFn ? getBetterAuthFn() : null;

    if (!auth) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Auth service unavailable",
      });
    }

    // Create a request to Better-Auth's sign-in endpoint
    const signInRequest = new Request(
      `${c.req.url.split("/rpc")[0]}/api/auth/sign-in/email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Object.fromEntries(c.req.raw.headers.entries()),
        },
        body: JSON.stringify({ email, password }),
      }
    );

    // Call Better-Auth handler to get the response with cookies
    const authResponse = await auth.handler(signInRequest);

    if (!authResponse.ok) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Invalid credentials",
      });
    }

    // Parse the response to get user and session
    const authData = (await authResponse.json()) as unknown;

    if (!isBetterAuthSignInResponse(authData)) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Invalid credentials",
      });
    }

    const { user, session } = authData;

    // Copy cookies from Better-Auth response to our response
    const setCookieHeader = authResponse.headers.get("Set-Cookie");
    if (setCookieHeader) {
      c.header("Set-Cookie", setCookieHeader);
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new ORPCError("FORBIDDEN", {
        message: "Email not verified",
      });
    }

    // Get user's organizations from control panel database (set by dbMiddleware)
    const controlPanelDb = c.get("controlPanelDb") as
      | (NeonDatabase<
          typeof import("@avantej-core/db/schema/control-panel-schema")
        > & { $client: Pool })
      | undefined;

    if (!controlPanelDb) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Database unavailable",
      });
    }

    const userOrganizations =
      await controlPanelDb.query.organizationMembers.findMany({
        where: eq(organizationMembers.userId, user.id),
        with: {
          organization: true,
        },
      });

    // Build organizations summary
    const organizationsSummary: Array<{
      id: string;
      name: string;
      slug: string;
      role: string;
    }> = [];

    for (const om of userOrganizations) {
      if (om.status !== "active") continue;
      const org = om.organization as {
        id: string;
        name: string;
        slug: string;
        paymentStatus: string;
      } | null;
      if (!org || org.paymentStatus !== "active") continue;
      organizationsSummary.push({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: om.role,
      });
    }

    return {
      accessToken: session?.token || "",
      refreshToken: "", // Better-Auth handles refresh tokens in HTTP-only cookies
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      organizations: organizationsSummary,
    };
  });

/**
 * User context procedure - Get current user's complete context
 * Includes user data, organizations, hierarchy, and permissions
 */
const userContext = o.use(authMiddleware).handler(async ({ context }) => {
  const c = context.honoContext;

  if (!c) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Missing Hono context",
    });
  }

  // Get current user from context (set by requireAuth middleware)
  const userId = context.session?.user?.id;

  if (!userId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Not authenticated",
    });
  }

  // Get control panel database from context (set by dbMiddleware)
  const controlPanelDb = c.get("controlPanelDb") as
    | (NeonDatabase<
        typeof import("@avantej-core/db/schema/control-panel-schema")
      > & { $client: Pool })
    | undefined;

  if (!controlPanelDb) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Database unavailable",
    });
  }

  // Get decrypt function
  const decrypt = c.get("decrypt");
  if (!decrypt) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Decrypt function unavailable",
    });
  }

  // Get user's organizations
  const userOrganizations = await controlPanelDb
    .select({
      id: organizationMembers.organizationId,
      role: organizationMembers.role,
      memberStatus: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));

  // Build organizations with hierarchy data
  const organizationsWithHierarchy: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    hierarchy: {
      nodes: Array<{
        id: string;
        name: string;
        type: string;
        depth: number;
        parentId: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
      }>;
      member: {
        role: string;
        hierarchyScopeId: string;
        hierarchyScopeName: string;
        accessibleNodeIds: string[];
      } | null;
    };
  }> = [];

  for (const om of userOrganizations) {
    if (om.memberStatus !== "active") continue;

    // Get organization details
    const org = await controlPanelDb.query.organizations.findFirst({
      where: (orgs, { eq }) => eq(orgs.id, om.id),
    });

    if (!org || org.paymentStatus !== "active") continue;

    // Get tenant database connection for this organization
    let hierarchyData = {
      nodes: [] as Array<{
        id: string;
        name: string;
        type: string;
        depth: number;
        parentId: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
      }>,
      member: null as {
        role: string;
        hierarchyScopeId: string;
        hierarchyScopeName: string;
        accessibleNodeIds: string[];
      } | null,
    };

    try {
      // Decrypt connection string and connect to tenant DB
      const connectionString = decrypt(org.connectionString);
      const tenantPool = new Pool({ connectionString });
      const tenantDb = drizzle({
        client: tenantPool,
        schema: tenantSchema,
      }) as NeonDatabase<typeof tenantSchema>;

      try {
        // Get all hierarchy nodes (no soft-delete in current schema)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allNodes = await tenantDb.query.hierarchyNodes.findMany({
          orderBy: (nodes: any, { asc }: any) => [
            asc(nodes.depth),
            asc(nodes.name),
          ],
        });

        hierarchyData.nodes = allNodes.map((node) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        }));

        // Get member record and accessible nodes
        const member = await tenantDb.query.members.findFirst({
          where: eq(members.userId, userId),
        });

        if (member) {
          const accessibleNodeIds = await getDescendantNodeIds(
            tenantDb,
            member.hierarchyScopeId
          );

          const scopeNode = await tenantDb.query.hierarchyNodes.findFirst({
            where: eq(hierarchyNodes.id, member.hierarchyScopeId),
          });

          hierarchyData.member = {
            role: member.role,
            hierarchyScopeId: member.hierarchyScopeId,
            hierarchyScopeName: scopeNode?.name || "Unknown",
            accessibleNodeIds,
          };
        }
      } finally {
        await tenantPool.end();
      }
    } catch (error) {
      console.error(`Failed to load hierarchy for org ${org.id}:`, error);
      // Continue with empty hierarchy data
    }

    organizationsWithHierarchy.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: om.role,
      hierarchy: hierarchyData,
    });
  }

  return {
    user: {
      id: context.session!.user.id,
      email: context.session!.user.email,
      name: context.session!.user.name,
      emailVerified: context.session!.user.emailVerified,
    },
    organizations: organizationsWithHierarchy,
    currentOrganizationId: organizationsWithHierarchy[0]?.id || null,
  };
});

/**
 * Verify email procedure - Verify email address via token
 */
const verifyEmail = o
  .input(
    z.object({
      token: z.string().min(1),
    })
  )
  .handler(async ({ input, context }) => {
    const { token } = input;
    const c = context.honoContext;

    if (!c) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Missing Hono context",
      });
    }

    try {
      await verifyEmailToken(token, c);
      return { message: "Email verified successfully" };
    } catch (error) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          error instanceof Error ? error.message : "Invalid or expired token",
      });
    }
  });

export const authRouter = {
  login,
  userContext,
  verifyEmail,
};
