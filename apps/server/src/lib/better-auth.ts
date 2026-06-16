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
import { magicLink } from "better-auth/plugins";
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
  sendMagicLinkEmail as sendMagicLinkEmailResend,
  renderInvitationEmail,
} from "@/lib/email";
import { sendTenantEmail } from "@/lib/email-send-tenant";
import { emailDomains } from "@avantej-core/db/schema/control-panel/email-domains";
import { emailLogs } from "@avantej-core/db/schema/control-panel/email-logs";
import { dispatchProfileSync } from "@/services/ghl/dispatch-staff-sync";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

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
      update: {
        // Fire GHL profile sync after a user record changes. The dispatcher is
        // idempotent and soft-fails — it is safe to invoke on every update
        // (it short-circuits when the user has no GHL link rows or when
        // GHL_AGENCY_ID is unset).
        after: async (user) => {
          try {
            const ghlAgencyId = getEnvVar("GHL_AGENCY_ID");
            if (!ghlAgencyId) return;
            const databaseUrl = getEnvVar("DATABASE_URL");
            if (!databaseUrl) return;

            // Build a control-panel db scoped to this hook invocation. We
            // can't reuse the request-scoped pool here because the betterAuth
            // hook signature does not surface the Hono context. A short-lived
            // pool is acceptable since dispatchProfileSync awaits its work.
            const pool = new Pool({ connectionString: databaseUrl });
            try {
              const controlPanelDb = drizzle({
                client: pool,
                schema: controlPanelSchema,
              }) as NeonDatabase<typeof controlPanelSchema>;

              await dispatchProfileSync({
                controlPanelDb,
                userId: user.id,
                env: { GHL_AGENCY_ID: ghlAgencyId },
              });
            } finally {
              await pool.end();
            }
          } catch (err) {
            console.error(
              "dispatchProfileSync failed in user.update.after hook:",
              err,
            );
          }
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

        const inviterName = inviter?.name || undefined;
        const role = invitation.role;

        // No Hono context in this callback (Cloudflare Workers I/O isolation
        // forbids reusing singleton pools across requests), so we build a
        // temp Pool/drizzle client with the columns we need: organizations
        // for the org name, plus emailDomains + emailLogs for sendTenantEmail.
        let organizationName = "an organization";
        let sentViaTenantPath = false;
        const databaseUrl = getEnvVar("DATABASE_URL");

        if (databaseUrl) {
          const tempPool = new Pool({ connectionString: databaseUrl });
          const tempDb = drizzle({
            client: tempPool,
            schema: { organizations, emailDomains, emailLogs },
          });
          try {
            try {
              const org = await tempDb.query.organizations.findFirst({
                where: eq(organizations.id, invitation.organizationId),
              });
              if (org) {
                organizationName = org.name;
              }
            } catch (error) {
              console.error(
                "Failed to fetch organization name for invitation email:",
                error,
              );
            }

            const { subject, html, text } = renderInvitationEmail(
              invitationLink,
              organizationName,
              inviterName,
              role,
            );

            try {
              await sendTenantEmail(tempDb as never, {
                organizationId: invitation.organizationId,
                to: email,
                subject,
                html,
                text,
                allowPlatformFallback: true,
              });
              sentViaTenantPath = true;
            } catch (error) {
              // Tenant-path send failed; fall through to legacy platform
              // sender so the invite is never silently dropped.
              console.error(
                "Tenant invitation send failed; falling back to platform sender:",
                error,
              );
            }
          } finally {
            await tempPool.end();
          }
        }

        if (!sentViaTenantPath) {
          await sendInvitationEmailResend(
            email,
            invitationLink,
            organizationName,
            inviterName,
            role,
          );
        }
      },
    }),
    admin({
      impersonationSessionDuration: 60 * 60,
    }),
    magicLink({
      // Single-use token. 30 min covers email delivery + user attention lag.
      expiresIn: 60 * 30,
      sendMagicLink: async ({
        email,
        url,
      }: {
        email: string;
        token: string;
        url: string;
      }) => {
        await sendMagicLinkEmailResend(email, url);
      },
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
