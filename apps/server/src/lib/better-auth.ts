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
 * - 15-minute session expiry (constitution requirement)
 * - Organization plugin for multi-tenant management
 * - Admin plugin for platform administration
 * - Resend email integration for verification and password reset
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { controlPanelDb } from "@/lib/db";
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
 */
function createBetterAuthDb() {
  const databaseUrl = getEnvVar("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool });
}

/**
 * Better-Auth instance with Organization and Admin plugins
 *
 * Configuration:
 * - Database: Uses control panel database via Drizzle adapter
 * - Email/Password: Enabled with email verification required
 * - Session: 15-minute expiry, updates every 5 minutes
 * - Organization Plugin: Enables multi-tenant organization management
 * - Admin Plugin: Enables platform administration features
 */
export const auth = betterAuth({
  database: drizzleAdapter(createBetterAuthDb(), {
    provider: "pg",
    schema: schema,
  }),
  trustedOrigins: [
    getEnvVar("CORS_ORIGIN") || "http://localhost:3001",
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
  session: {
    expiresIn: 60 * 15, // 15 minutes (constitution requirement)
    updateAge: 60 * 5, // Update session every 5 minutes
  },
  secret:
    getEnvVar("BETTER_AUTH_SECRET") ||
    "dev-secret-key-minimum-32-characters-long",
  baseURL: getEnvVar("BETTER_AUTH_URL") || "http://localhost:3000",
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
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
        let organizationName = "an organization";
        try {
          const org = await controlPanelDb.query.organizations.findFirst({
            where: eq(organizations.id, invitation.organizationId),
          });
          if (org) {
            organizationName = org.name;
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
      // 1 hour max impersonation session duration
      impersonationSessionDuration: 60 * 60,
    }),
  ],
});
