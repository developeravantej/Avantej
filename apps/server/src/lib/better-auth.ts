/**
 * Better-Auth Configuration
 *
 * Configures Better-Auth with Organization and Admin plugins for multi-tenant support.
 * Uses Drizzle adapter with control panel database schema.
 *
 * Environment Variables:
 * - DATABASE_URL: Control panel database connection string
 * - BETTER_AUTH_SECRET: Secret key for session encryption
 * - BETTER_AUTH_URL: Base URL for Better-Auth (e.g., http://localhost:3000)
 * - CORS_ORIGIN: Allowed CORS origin
 * - RESEND_API_KEY: Resend API key for email sending
 * - RESEND_FROM_EMAIL: Sender email address
 * - RESEND_FROM_NAME: Sender name
 *
 * Features:
 * - Email/password authentication
 * - Email verification required
 * - 8-hour session expiry for development (refresh every 30 minutes)
 * - Organization plugin for multi-tenant management
 * - Admin plugin for platform administration
 * - Resend email integration for verification and password reset
 */

import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { organization } from "better-auth/plugins";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import type { Context } from "hono";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import * as schema from "@avantej-core/db/schema/auth";

// Configure Neon for Cloudflare Workers (WebSocket support)
neonConfig.webSocketConstructor = ws;
import {
  sendVerificationEmail as sendVerificationEmailResend,
  sendPasswordResetEmail as sendPasswordResetEmailResend,
  sendInvitationEmail as sendInvitationEmailResend,
} from "@/lib/email";

/**
 * Get environment variable from Cloudflare Workers env or process.env (for Node.js/test environments)
 */
function getEnvVar(key: string): string | undefined {
  try {
    // Try to access Cloudflare Workers env (only available in Workers runtime)
    // Using dynamic require to avoid TypeScript errors in Node.js/test environments
    const cloudflareWorkers = require("cloudflare:workers") as {
      env?: Record<string, string>;
    };
    if (cloudflareWorkers?.env?.[key]) {
      return cloudflareWorkers.env[key];
    }
  } catch {
    // Not in Cloudflare Workers environment (e.g., in tests)
  }
  // Fall back to process.env
  return process.env[key];
}

/**
 * Create database client for Better-Auth (without schema - Better-Auth adds its own)
 * Better-Auth's drizzle adapter expects a client without a schema
 *
 * @param c - Optional Hono context. If provided, uses request-scoped pool.
 */
function createBetterAuthDb(c?: Context) {
  // If context is provided, use request-scoped pool from context
  if (c) {
    const controlPanelPool = c.get("controlPanelPool");
    if (controlPanelPool) {
      // Create drizzle instance without schema (Better-Auth adds its own)
      return drizzle({ client: controlPanelPool });
    }
  }

  // Fall back to creating a new pool (for non-request contexts)
  const databaseUrl = getEnvVar("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool });
}

/**
 * Create Better-Auth instance with request-scoped database connection
 *
 * @param c - Optional Hono context. If provided, uses request-scoped pool.
 * @returns Better-Auth instance configured with request-scoped database
 */
function createBetterAuth(c?: Context) {
  // Determine if we're running over HTTPS (production) or HTTP (development)
  const betterAuthUrl = getEnvVar("BETTER_AUTH_URL") || "http://localhost:3000";
  const isHttps = betterAuthUrl.startsWith("https://");

  return betterAuth({
    database: drizzleAdapter(createBetterAuthDb(c), {
      provider: "pg",
      schema: schema,
    }),
  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: false,
        fieldName: "firstName",
        defaultValue: "",
      },
      lastName: {
        type: "string",
        required: false,
        fieldName: "lastName",
        defaultValue: "",
      },
      phone: {
        type: "string",
        required: false,
        fieldName: "phone",
      },
      idPassportNo: {
        type: "string",
        required: false,
        fieldName: "idPassportNo",
      },
      addressType: {
        type: "string",
        required: false,
        fieldName: "addressType",
      },
      streetAddress: {
        type: "string",
        required: false,
        fieldName: "streetAddress",
      },
      city: {
        type: "string",
        required: false,
        fieldName: "city",
      },
      state: {
        type: "string",
        required: false,
        fieldName: "state",
      },
      country: {
        type: "string",
        required: false,
        fieldName: "country",
      },
      postalCode: {
        type: "string",
        required: false,
        fieldName: "postalCode",
      },
      dateOfBirth: {
        type: "string",
        required: false,
        fieldName: "dateOfBirth",
      },
      emergencyContactName: {
        type: "string",
        required: false,
        fieldName: "emergencyContactName",
      },
      emergencyContactRelationship: {
        type: "string",
        required: false,
        fieldName: "emergencyContactRelationship",
      },
      emergencyContactPhone: {
        type: "string",
        required: false,
        fieldName: "emergencyContactPhone",
      },
    },
  },
  trustedOrigins: [
    getEnvVar("CORS_ORIGIN") || "http://localhost:3001",
    "http://localhost:4001", // E2E alt port
    "mybettertapp://",
    "exp://",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      await sendVerificationEmailResend(
        user.email,
        url,
        user.name || undefined
      );
    },
    sendResetPassword: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      await sendPasswordResetEmailResend(
        user.email,
        url,
        user.name || undefined
      );
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      await sendVerificationEmailResend(
        user.email,
        url,
        user.name || undefined
      );
    },
    sendOnSignUp: true, // Automatically send verification email on signup
  },
  email: {
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      await sendVerificationEmailResend(
        user.email,
        url,
        user.name || undefined
      );
    },
    sendPasswordResetEmail: async ({
      user,
      url,
    }: {
      user: { email: string; name?: string | null };
      url: string;
    }) => {
      await sendPasswordResetEmailResend(
        user.email,
        url,
        user.name || undefined
      );
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          return { data: { ...user, role: null } };
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 8, // 8 hours for development
    updateAge: 60 * 30, // Refresh every 30 minutes
  },
  secret:
    getEnvVar("BETTER_AUTH_SECRET") ||
    "dev-secret-key-minimum-32-characters-long",
  baseURL: getEnvVar("BETTER_AUTH_URL") || "http://localhost:3000",
  advanced: {
    defaultCookieAttributes: {
      sameSite: isHttps ? "none" : "lax",
      secure: isHttps,
      httpOnly: true,
    },
    // uncomment cookieCache setting when ready to deploy to Cloudflare using *.workers.dev domains
    // cookieCache: {
    //   enabled: true,
    //   maxAge: 60,
    // },
    // uncomment crossSubDomainCookies setting when ready to deploy and replace <your-workers-subdomain> with your actual workers subdomain
    // https://developers.cloudflare.com/workers/wrangler/configuration/#workersdev
    // crossSubDomainCookies: {
    //   enabled: true,
    //   domain: "<your-workers-subdomain>",
    // },
  },
  plugins: [
    expo(), // Expo plugin - safe for both web and native, only activates for Expo requests
    organization({
      // Only allow org creation if user has valid subscription
      // This will be enforced via payment-gated provisioning (T040)
      allowUserToCreateOrganization: async () => {
        // For now, allow organization creation
        // Will be replaced with subscription check in T040 integration
        return true;
      },
      // Send invitation email using Resend
      sendInvitationEmail: async ({
        email,
        invitation,
        inviter,
      }: {
        email: string;
        invitation: {
          id: string;
          organizationId: string;
          email: string;
          role: string;
          expiresAt: Date;
        };
        inviter?: { id: string; name?: string | null } | null;
      }) => {
        // Construct invitation link using invitation ID
        // Better-Auth organization plugin uses invitation ID for acceptance
        const baseURL = getEnvVar("BETTER_AUTH_URL") || "http://localhost:3000";
        const invitationLink = `${baseURL}/accept-invitation?id=${invitation.id}`;

        // Fetch organization name from database
        // Note: This callback doesn't have access to Hono context,
        // so we create a temporary pool for this operation (Cloudflare Workers requirement)
        let organizationName = "an organization";
        try {
          // Create a temporary pool for this read operation
          // Cannot use singleton pool in Cloudflare Workers due to I/O isolation
          const databaseUrl = getEnvVar("DATABASE_URL");
          if (databaseUrl) {
            const tempPool = new Pool({ connectionString: databaseUrl });
            const tempDb = drizzle({ client: tempPool, schema: { organizations } });
            try {
              const org = await tempDb.query.organizations.findFirst({
                where: eq(organizations.id, invitation.organizationId),
              });
              if (org) {
                organizationName = org.name;
              }
            } finally {
              await tempPool.end();
            }
          }
        } catch (error) {
          console.error(
            "Failed to fetch organization name for invitation email:",
            error
          );
          // Fall back to default name
        }

        const inviterName = inviter?.name || undefined;
        const role = invitation.role;

        await sendInvitationEmailResend(
          email,
          invitationLink,
          organizationName,
          inviterName,
          role
        );
      },
    }),
    admin({
      impersonationSessionDuration: 60 * 60,
    }),
  ],
  });
}

// Lazy singleton — not initialized at module load time to avoid throwing during
// Cloudflare Workers script validation when DATABASE_URL is unavailable.
let _authInstance: ReturnType<typeof createBetterAuth> | null = null;

/**
 * Get request-scoped Better-Auth instance
 *
 * Prefers request-scoped pool from Hono context (created by dbMiddleware).
 * Falls back to singleton instance for non-request contexts.
 *
 * @param c - Optional Hono context. If provided, uses request-scoped pool.
 * @returns Better-Auth instance configured with request-scoped database
 */
export function getBetterAuth(c?: Context) {
  if (c) {
    return createBetterAuth(c);
  }
  if (!_authInstance) {
    _authInstance = createBetterAuth();
  }
  return _authInstance;
}

/**
 * Better-Auth instance with Organization and Admin plugins
 *
 * @deprecated Use getBetterAuth(c) in request handlers for Cloudflare Workers compatibility.
 * This singleton instance uses a singleton pool that cannot be shared across requests.
 * Only use this in test environments or scripts outside request handlers.
 */
export const auth = new Proxy({} as ReturnType<typeof createBetterAuth>, {
  get(_target, prop: string | symbol) {
    return (getBetterAuth() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
