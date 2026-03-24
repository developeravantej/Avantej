/**
 * Authentication Routes
 *
 * Implements authentication endpoints following the OpenAPI contract.
 * Uses Better-Auth for core authentication functionality.
 *
 * Routes:
 * - POST /auth/register - Register new user
 * - POST /auth/login - Login with email/password
 * - POST /auth/verify-email - Verify email token
 * - POST /auth/reset-password - Request password reset
 * - POST /auth/reset-password/confirm - Confirm password reset
 * - POST /auth/logout - Logout and invalidate session
 * - POST /auth/refresh - Refresh access token
 */

import { getBetterAuth } from "@/lib/better-auth";
import { getControlPanelDb } from "@/lib/db";
import { authMiddleware } from "@/middleware/auth.middleware";
import {
  resetPassword,
  sendPasswordResetEmail,
  sendVerificationEmail,
  verifyEmailToken,
} from "@/services/auth.service";
import { decrypt } from "@avantej-core/db";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { getDescendantNodeIds } from "@avantej-core/services";
import type { BetterAuthGetSessionResponse } from "@avantej-core/types/better-auth";
import {
  isBetterAuthError,
  isBetterAuthSignInResponse,
  isBetterAuthSignUpResponse,
} from "@avantej-core/types/better-auth";
import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Hono } from "hono";

export const authRoutes = new Hono();

/**
 * POST /auth/register
 * Register a new user account
 */
authRoutes.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, firstName, lastName, name } = body;

    // Validate input
    if (!email || !password || (!name && (!firstName || !lastName))) {
      return c.json({ error: "Email, password, and name (or firstName + lastName) are required" }, 400);
    }

    if (password.length < 8) {
      return c.json(
        { error: "Password must be at least 8 characters long" },
        400
      );
    }

    // Register user via Better-Auth
    // Better-Auth API method name is signUpEmail (camelCase)
    const auth = getBetterAuth(c);
    const computedName = name || `${firstName} ${lastName}`;
    const result = (await (auth.api as any).signUpEmail({
      body: {
        email,
        password,
        name: computedName,
        firstName: firstName || computedName.split(" ")[0],
        lastName: lastName || computedName.split(" ").slice(1).join(" "),
      },
      headers: c.req.raw.headers,
    })) as unknown;

    // Check for errors
    if (isBetterAuthError(result)) {
      if (
        result.message.includes("already") ||
        result.message.includes("exists")
      ) {
        return c.json({ error: "Email already registered" }, 409);
      }
      return c.json(
        { error: result.message || "Failed to register user" },
        400
      );
    }

    // Validate response structure
    if (!isBetterAuthSignUpResponse(result)) {
      return c.json({ error: "Failed to register user" }, 400);
    }

    const user = result.user;

    // Send verification email
    try {
      await sendVerificationEmail(user.id, email, c);
    } catch (error) {
      console.error("Failed to send verification email:", error);
      // Continue even if email sending fails
    }

    return c.json(
      {
        userId: user.id,
        email: user.email,
        message: "Verification email sent",
      },
      201
    );
  } catch (error) {
    console.error("Registration error:", error);
    if (error instanceof Error && error.message.includes("already")) {
      return c.json({ error: "Email already registered" }, 409);
    }
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to register user",
      },
      400
    );
  }
});

/**
 * POST /auth/login
 * Login with email and password
 */
authRoutes.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Sign in via Better-Auth
    // Better-Auth API method name is signInEmail (camelCase)
    // We need to call Better-Auth's handler directly to get cookies set properly
    // Create a temporary request to Better-Auth's sign-in endpoint
    const signInRequest = new Request(
      `${c.req.url.split("/auth")[0]}/api/auth/sign-in/email`,
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
    const auth = getBetterAuth(c);
    const authResponse = await auth.handler(signInRequest);

    if (!authResponse.ok) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Parse the response to get user and session
    const authData = (await authResponse.json()) as unknown;

    if (!isBetterAuthSignInResponse(authData)) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const { user, session } = authData;

    // Copy cookies from Better-Auth response to our response
    // Better-Auth sets cookies in the response headers
    const setCookieHeader = authResponse.headers.get("Set-Cookie");
    if (setCookieHeader) {
      c.header("Set-Cookie", setCookieHeader);
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return c.json({ error: "Email not verified" }, 403);
    }

    // Get user's organizations from control panel database
    const controlPanelDb = getControlPanelDb(c);
    const userOrganizations =
      await controlPanelDb.query.organizationMembers.findMany({
        where: eq(organizationMembers.userId, user.id),
        with: {
          organization: true,
        },
      });

    // Filter out suspended organizations and ensure organization exists
    // Build organizations summary with explicit null checks
    const organizationsSummary: Array<{
      id: string;
      name: string;
      slug: string;
      role: string;
    }> = [];

    for (const om of userOrganizations) {
      if (om.status !== "active") continue;
      // Type assertion needed because Drizzle relation types can be complex
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

    // Better-Auth handles tokens in cookies/headers
    // We need to extract the session token if available
    const sessionToken = session?.token || "";

    return c.json({
      accessToken: sessionToken,
      refreshToken: "", // Better-Auth handles refresh tokens in HTTP-only cookies
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      organizations: organizationsSummary,
    });
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "Invalid credentials" }, 401);
  }
});

/**
 * POST /auth/verify-email
 * Verify email address via token
 */
authRoutes.post("/verify-email", async (c) => {
  try {
    const body = await c.req.json();
    const { token } = body;

    if (!token) {
      return c.json({ error: "Token is required" }, 400);
    }

    // Verify email token
    await verifyEmailToken(token, c);

    return c.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Email verification error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid or expired token",
      },
      400
    );
  }
});

/**
 * POST /auth/reset-password
 * Request password reset email
 */
authRoutes.post("/reset-password", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    // Send password reset email (always returns success to prevent email enumeration)
    await sendPasswordResetEmail(email, c);

    // Always return 200 to prevent email enumeration
    return c.json({
      message: "If the email exists, a password reset link has been sent",
    });
  } catch (error) {
    // Still return 200 to prevent email enumeration
    console.error("Password reset request error:", error);
    return c.json({
      message: "If the email exists, a password reset link has been sent",
    });
  }
});

/**
 * POST /auth/reset-password/confirm
 * Confirm password reset with token
 */
authRoutes.post("/reset-password/confirm", async (c) => {
  try {
    const body = await c.req.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return c.json({ error: "Token and new password are required" }, 400);
    }

    if (newPassword.length < 8) {
      return c.json(
        { error: "Password must be at least 8 characters long" },
        400
      );
    }

    // Reset password
    await resetPassword(token, newPassword, c);

    return c.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Password reset confirm error:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid or expired token",
      },
      400
    );
  }
});

/**
 * POST /auth/logout
 * Logout and invalidate session
 */
authRoutes.post("/logout", authMiddleware, async (c) => {
  try {
    // Sign out via Better-Auth handler to properly clear cookies
    const signOutRequest = new Request(
      `${c.req.url.split("/auth")[0]}/api/auth/sign-out`,
      {
        method: "POST",
        headers: Object.fromEntries(c.req.raw.headers.entries()),
      }
    );

    const auth = getBetterAuth(c);
    const authResponse = await auth.handler(signOutRequest);

    // Copy cookies from Better-Auth response (for clearing cookies)
    const setCookieHeader = authResponse.headers.get("Set-Cookie");
    if (setCookieHeader) {
      c.header("Set-Cookie", setCookieHeader);
    }

    return c.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ error: "Failed to logout" }, 500);
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
authRoutes.post("/refresh", async (c) => {
  try {
    // Better-Auth handles token refresh automatically via cookies
    // We'll check if there's a valid session and return a new access token
    const auth = getBetterAuth(c);
    const session = (await auth.api.getSession({
      headers: c.req.raw.headers,
    })) as BetterAuthGetSessionResponse;

    if (!session || !session.session) {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    // Better-Auth manages token refresh internally
    // Return the session token as the access token
    return c.json({
      accessToken: session.session.token,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return c.json({ error: "Invalid refresh token" }, 401);
  }
});

/**
 * GET /auth/organizations
 * Get current user's organizations (requires authentication)
 */
authRoutes.get("/organizations", authMiddleware, async (c) => {
  try {
    // Get current user from Better-Auth session
    const auth = getBetterAuth(c);
    const session = (await auth.api.getSession({
      headers: c.req.raw.headers,
    })) as BetterAuthGetSessionResponse;

    if (!session || !session.user) {
      console.error(
        "Get organizations error: Unauthorized - No session or user"
      );
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;

    // Get user's organizations from control panel database using a manual join
    const controlPanelDb = getControlPanelDb(c);
    const userOrganizations = await controlPanelDb
      .select({
        id: organizationMembers.organizationId,
        role: organizationMembers.role,
        memberStatus: organizationMembers.status,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    // Get organization details for each membership
    const organizationsSummary: Array<{
      id: string;
      name: string;
      slug: string;
      role: string;
    }> = [];

    for (const om of userOrganizations) {
      if (om.memberStatus !== "active") continue;

      // Get organization details
      const org = await controlPanelDb.query.organizations.findFirst({
        where: (orgs, { eq }) => eq(orgs.id, om.id),
      });

      if (!org || org.paymentStatus !== "active") continue;

      organizationsSummary.push({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: om.role,
      });
    }

    return c.json({ organizations: organizationsSummary });
  } catch (error) {
    console.error("Get organizations error:", error);
    return c.json({ error: "Failed to retrieve organizations" }, 500);
  }
});

/**
 * GET /auth/user-context
 * Get current user's complete context: user data, organizations, hierarchy, and permissions
 * This endpoint combines data from control panel and tenant databases
 */
authRoutes.get("/user-context", authMiddleware, async (c) => {
  try {
    // Get current user from Better-Auth session
    const auth = getBetterAuth(c);
    const session = (await auth.api.getSession({
      headers: c.req.raw.headers,
    })) as BetterAuthGetSessionResponse;

    if (!session || !session.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;
    const controlPanelDb = getControlPanelDb(c);

    // Get user's organizations from control panel database
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
        const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

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

    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
      },
      organizations: organizationsWithHierarchy,
      currentOrganizationId: organizationsWithHierarchy[0]?.id || null,
    });
  } catch (error) {
    console.error("Get user context error:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to retrieve user context",
      },
      500
    );
  }
});
